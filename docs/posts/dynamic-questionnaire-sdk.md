---
title: 通用动态问卷：用 JSON 配置驱动多步骤表单
description: 拆解一个基于 Next.js、React 和 TypeScript 的动态问卷系统，重点看三份 JSON、条件联动、运行时字段解析和提交闭环
date: 2026-06-25
---

# 通用动态问卷：用 JSON 配置驱动多步骤表单

最近整理了一个通用动态问卷示例。它基于 Next.js、React、TypeScript 和 Tailwind CSS 实现，页面本身是静态生成的问卷入口，真正的问卷内容在浏览器运行时通过接口读取。

这个项目没有接数据库，所有问卷配置、枚举选项和提交结果都保存在本地 `data` 目录的 JSON 文件里。它适合用来验证一个问题：如果我们不把表单写死在页面里，而是让配置决定字段、步骤、选项和联动规则，一个多步骤问卷系统应该怎么拆？

## 用户看到什么

用户访问：

```text
/questionnaire/kyc-questionnaire
```

页面会展示问卷标题、当前步骤、问题列表和底部操作按钮。中间步骤按钮是 `Continue`，最后一步按钮是 `Submit`。红色星号表示必填项，必填项没填时不会进入下一步，而是在对应问题下显示红色错误提示。

手机端则采用全屏展示，不再套外层卡片框。这个细节很实用：移动端填写问卷时，空间比装饰性容器重要得多。

从普通用户视角看，流程很简单：

```text
打开页面 -> 填写当前步骤 -> 点击继续 -> 按提示补全 -> 最后提交
```

但从实现视角看，页面并不知道“这个问卷到底有哪些字段”。它需要先向后端拿配置。

## 三份 JSON 分工

浏览器加载后，会并行请求三个接口：

```text
/api/schema?pageId=kyc-questionnaire
/api/questionnaire?pageId=kyc-questionnaire
/api/options
```

三份数据各司其职：

- `schema.json`：字段展示配置，决定字段标题、控件类型、占位文案和条件联动。
- `questionnaire.json`：问卷步骤结构，决定有几步、每一步有哪些问题、哪些字段必填。
- `options.json`：所有下拉枚举，按字段名统一维护。

这个拆法很关键。问题数据里只放 `field`、`required`、`content`，不放标题和组件类型；字段如何展示由 schema 决定；下拉选项单独维护。这样问卷答案更干净，展示配置也更容易复用。

一个字段配置大概是：

```json
{
  "field": "country_of_residence",
  "label": "Country/region of residence",
  "component": "select",
  "placeholder": "Country/region of residence",
  "options": []
}
```

一个步骤问题大概是：

```json
{
  "stepId": "address",
  "stepIndex": 2,
  "title": "Address information",
  "questions": [
    {
      "field": "country_of_residence",
      "required": true,
      "content": ""
    },
    {
      "field": "address",
      "required": true,
      "content": ""
    }
  ]
}
```

前端渲染时，会用 question 里的 `field` 去 schema 中找到完整字段配置，再决定渲染输入框、下拉框还是文件上传。

## 首次渲染链路

页面组件分成两层：

- `QuestionnairePage`：Next.js Server Component，负责静态入口和传入 `pageId`。
- `QuestionnaireApp`：Client Component，负责请求配置、维护状态、求值和提交。

首次挂载后，`QuestionnaireApp` 做三件事：

1. 并行请求 schema、questionnaire 和 options。
2. 调用 `mergeAllFieldOptions()`，把 options 按字段名合并到 `schema.fields[].options`。
3. 基于当前 answers 快照，计算每个字段的运行时配置。

渲染树大致是：

```text
QuestionnairePage
  -> QuestionnaireApp
    -> QuestionnaireShell
      -> StepRenderer
        -> FieldRenderer
          -> InputField / SelectField / FileUploadField
```

`FieldRenderer` 是最核心的分发点。它不关心某个业务字段叫什么，只看 `field.component`：

- `input` 渲染 `InputField`
- `select` 渲染 `SelectField`
- `file` 渲染 `FileUploadField`

这也是配置化表单的基本姿势：业务字段变多，不应该导致页面组件无限膨胀。

## 条件联动怎么做

这个系统最有意思的是字段联动。

比如默认情况下，`state` 是输入框；当 `country_of_residence` 是 `BR`、`US` 或 `CA` 时，`state` 变成下拉框。

配置可以这样写：

```json
{
  "field": "state",
  "label": "State",
  "component": "input",
  "placeholder": "State",
  "options": [],
  "condition": [
    {
      "when": {
        "field": "country_of_residence",
        "operator": "in",
        "value": ["BR", "US", "CA"]
      },
      "then": {
        "component": "select",
        "placeholder": "State / Province",
        "options": []
      }
    }
  ]
}
```

运行时会对每个字段调用 `resolveRuntimeField(field, values)`：

1. 从所有 questions 中提取当前答案快照 `values`。
2. 遍历字段的 `condition` 数组。
3. 对每条 `when` 调用 `evaluateCondition(when, values)`。
4. 如果命中，就把 `then` 合并到默认字段配置上。
5. `FieldRenderer` 消费合并后的字段配置，决定最终渲染什么组件。

这意味着字段本身不是静态的。它的组件类型、placeholder、options 都可以根据当前答案动态变化。

## 用户交互后的重新求值

当用户选择 `United States` 时，流程大致是：

```text
SelectField.onChange("country_of_residence", "US")
  -> updateQuestionContent()
  -> 更新 question.content
  -> setQuestionnaire(newQuestionnaire)
  -> React 触发重渲染
  -> useMemo 重新计算 values
  -> resolveRuntimeField("state", values)
  -> state.component 从 input 变成 select
```

这里没有做递归式联动求值，而是每次拿“当前答案快照”重新算一遍所有字段的运行时状态。这种方式更可控，也能避免联动规则之间互相触发导致死循环。

项目还会用 DFS 检测字段依赖中的循环。如果发现循环依赖，页面仍然可以使用，但控制台会输出 warning，提醒配置人员检查规则。

## 条件表达能力

当前支持的判断方式覆盖了常见问卷需求：

- `eq`：等于某个值
- `neq`：不等于某个值
- `in`：在一组选项中
- `notIn`：不在一组选项中
- `empty`：没有填写
- `notEmpty`：已经填写

如果多个条件必须同时满足，可以用 `allOf`；如果满足任意一个即可，可以用 `anyOf`。

例如：

```json
{
  "when": {
    "allOf": [
      {
        "field": "country_of_residence",
        "operator": "eq",
        "value": "BR"
      },
      {
        "field": "customer_type",
        "operator": "eq",
        "value": "individual"
      }
    ]
  },
  "then": {
    "placeholder": "请输入个人税号"
  }
}
```

这套条件语法不算复杂，但已经能覆盖“字段根据另一个字段变化”“国家影响地区字段”“客户类型影响证件提示”等高频场景。

## 提交与步骤切换

点击 `Continue` 或 `Submit` 时，前端会先执行 `validateStep(currentStep)`：

```text
用户点击按钮
  -> validateStep(currentStep)
  -> 必填项没填：setErrors，停留当前步骤
  -> 校验通过：POST /api/submit
  -> 不是最后一步：进入下一步
  -> 最后一步：显示提交成功
```

文件上传字段目前只保存文件名、大小和类型，不真正上传文件内容。这也符合示例项目定位：先把配置、渲染、校验和提交闭环跑通，文件存储可以以后接对象存储或后端上传服务。

## 本地文件作为“轻量后端”

项目没有数据库，几个本地文件承担了后端存储：

| 需求 | 文件 |
| --- | --- |
| 修改字段标题、控件类型、联动规则 | `data/schema.json` |
| 修改问卷步骤和必填项 | `data/questionnaire.json` |
| 修改下拉选项 | `data/options.json` |
| 查看提交结果 | `data/submissions.json` |

这个设计让项目非常适合做 SDK 原型或产品 demo。配置人员不用改 React 组件，只要理解三份 JSON 的分工，就能调整问卷结构。

## 我喜欢的几个设计点

第一，字段展示和问卷步骤分离。`questionnaire` 只描述“问什么”，`schema` 描述“怎么展示”，这让答案结构更稳定。

第二，options 单独集中管理。下拉选项不散落在每个字段里，加载后按字段名合并，方便以后换成枚举接口或远程字典服务。

第三，条件联动是“快照求值”。每次状态变化都从当前 answers 重新计算运行时字段配置，逻辑清楚，也不容易陷入递归联动。

第四，组件层级很薄。`FieldRenderer` 只根据 `component` 分发，新增字段不需要新增页面逻辑。

第五，移动端全屏展示。对问卷这种任务型页面来说，这是一个比视觉包装更重要的体验选择。

## 可以继续扩展什么

这个项目已经具备动态问卷的主干。后续如果要产品化，可以继续补：

- 后端数据库和正式提交记录。
- 文件上传到对象存储。
- 更完整的字段类型，比如日期、手机号、地址级联、多选。
- 条件规则可视化编辑器，降低 JSON 配置门槛。
- 表单草稿自动保存和恢复。
- 服务端根据 schema 做二次校验。
- 问卷版本管理，保证历史提交可追溯。

不过这些都应该建立在当前几个边界上：schema 管展示，questionnaire 管步骤，options 管枚举，运行时根据答案快照解析字段状态。

把这几个边界守住，动态问卷就不会变成一堆条件判断堆出来的表单页面。
