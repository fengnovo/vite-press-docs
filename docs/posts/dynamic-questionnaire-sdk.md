---
title: 通用动态问卷：用 JSON 配置驱动多步骤表单
description: 拆解一个基于 Next.js、React 和 TypeScript 的动态问卷系统，重点看三份 JSON、条件联动、运行时字段解析和提交闭环
date: 2025-10-20
---

# 通用动态问卷：用 JSON 配置驱动多步骤表单
git: https://github.com/fengnovo/general-questionnaire-sdk   
线上地址：https://questionnaire.keen-tech.top/questionnaire/kyc-questionnaire   

最近整理了一个通用动态问卷示例。它基于 Next.js、React、TypeScript 和 Tailwind CSS 实现，页面本身是静态生成的问卷入口，真正的问卷内容在浏览器运行时通过接口读取。

这个项目没有接数据库，所有问卷配置、枚举选项和提交结果都保存在本地 `data` 目录的 JSON 文件里。它适合用来验证一个问题：如果我们不把表单写死在页面里，而是让配置决定字段、步骤、选项和联动规则，一个多步骤问卷系统应该怎么拆？

## 先用大白话理解

这个项目的核心不是“写一个 KYC 表单”，而是“写一个能根据 JSON 自动生成表单的问卷引擎”。页面本身不提前知道有哪些问题，也不知道每个问题是输入框、下拉框还是上传文件。它打开后先读取配置，再按配置把页面拼出来。

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>1. 读取配置</strong>
    <span>页面请求 schema、questionnaire 和 options 三份 JSON。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>2. 生成字段</strong>
    <span>用 question.field 去 schema 里找标题、控件类型、占位文案。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>3. 合并选项</strong>
    <span>把 options 里的国家、地区等枚举塞回对应 select 字段。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>4. 根据答案联动</strong>
    <span>用户改答案后，重新计算字段是 input 还是 select。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>5. 校验并提交</strong>
    <span>当前步骤必填项通过后，提交到 /api/submit。</span>
  </div>
</div>

大白话说：`schema` 是页面说明书，`questionnaire` 是题目清单，`options` 是下拉字典，用户填写的 `content` 是答案。

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

用户侧的填写流程可以这样看：

<div class="lc-flow">
  <div class="lc-flow__node"><strong>打开问卷</strong><span>进入 /questionnaire/kyc-questionnaire。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>填写当前步骤</strong><span>输入文字、选择下拉项或添加文件。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>点击 Continue</strong><span>只校验当前步骤的必填项。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>补全错误</strong><span>没填必填项就显示红色提示，留在当前步骤。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>最后 Submit</strong><span>最后一步通过后展示提交成功。</span></div>
</div>

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

三份 JSON 的关系可以理解成：

<div class="lc-protocol-grid">
  <div>
    <strong>schema.json</strong>
    <span>管“怎么显示”：label、component、placeholder、condition。</span>
  </div>
  <div>
    <strong>questionnaire.json</strong>
    <span>管“每一步问什么”：step、questions、required、content。</span>
  </div>
  <div>
    <strong>options.json</strong>
    <span>管“下拉有什么”：按 field 名维护所有枚举选项。</span>
  </div>
  <div>
    <strong>submissions.json</strong>
    <span>管“用户提交了什么”：保存每一步提交结果。</span>
  </div>
</div>

为什么要拆开？因为“题目结构”和“字段展示”不是一回事。`questionnaire` 只要知道当前步骤问了 `country_of_residence`，至于这个字段叫啥、用什么控件、有哪些选项，都交给 `schema + options`。

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

这一步可以画成：

<div class="lc-map">
  <div>
    <strong>question.field</strong>
    <span>例如 country_of_residence，只是字段名。</span>
  </div>
  <div>
    <strong>schema.fields</strong>
    <span>找到同名字段，拿到 label、component、placeholder。</span>
  </div>
  <div>
    <strong>options</strong>
    <span>如果是 select，再按字段名注入下拉选项。</span>
  </div>
  <div>
    <strong>FieldRenderer</strong>
    <span>根据最终 component 渲染 InputField、SelectField 或 FileUploadField。</span>
  </div>
</div>

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

首次加载时，完整链路是：

<div class="lc-sequence">
  <div><b>Server Component 入口</b><span>QuestionnairePage 只负责拿到 pageId，并挂载 Client Component。</span></div>
  <div><b>三路并行请求</b><span>QuestionnaireApp 同时请求 /api/schema、/api/questionnaire 和 /api/options。</span></div>
  <div><b>合并 options</b><span>mergeAllFieldOptions() 把下拉枚举按 field 注入 schema.fields。</span></div>
  <div><b>检测循环依赖</b><span>detectCircularFieldDependencies() 用 DFS 检查字段 condition 是否互相依赖。</span></div>
  <div><b>生成答案快照</b><span>把所有 questions 拉平成 values：{ field → content }。</span></div>
  <div><b>计算运行时字段</b><span>对每个 field 调 resolveRuntimeField(field, values)。</span></div>
  <div><b>渲染当前步骤</b><span>StepRenderer 遍历 questions，FieldRenderer 按 component 分发具体控件。</span></div>
</div>

这里的核心点是“运行时字段”。配置里写的是默认状态，但页面真正渲染的是根据当前答案算出来的状态。

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

用更直白的话说，`condition` 就是“如果……那么……”：

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>默认配置</strong>
    <span>state 默认是 input，placeholder 是 State。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>读取当前答案</strong>
    <span>country_of_residence 当前值是 US。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>判断 when</strong>
    <span>US 是否在 BR、US、CA 里面？是。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>合并 then</strong>
    <span>把 component 改成 select，把 placeholder 改成 State / Province。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>重新渲染</strong>
    <span>FieldRenderer 从 InputField 切换到 SelectField。</span>
  </div>
</div>

所以联动不是在页面里写 `if country === 'US'`，而是把规则写进 JSON，运行时统一解释。

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

用户改一个下拉框后，系统不是只改一个 DOM，而是重新走一遍数据流：

<div class="lc-sequence">
  <div><b>用户选择国家</b><span>SelectField 触发 onChange("country_of_residence", "US")。</span></div>
  <div><b>更新答案</b><span>updateQuestionContent() 找到对应 question，把 content 改成 US。</span></div>
  <div><b>触发重渲染</b><span>setQuestionnaire(newQuestionnaire) 后 React 重新计算。</span></div>
  <div><b>重建 values</b><span>useMemo 生成新的答案快照：country_of_residence = US。</span></div>
  <div><b>重新求值所有字段</b><span>resolveRuntimeField() 重新执行每个字段的 condition。</span></div>
  <div><b>生成新字段配置</b><span>state 的 component 从 input 变成 select。</span></div>
  <div><b>页面更新控件</b><span>FieldRenderer 拿到新配置，显示下拉框和选项。</span></div>
</div>

这种“每次从答案快照重新计算”的方式，比链式触发更稳。字段 A 和字段 B 就算互相依赖，也只是读取当前答案，不会递归读取对方计算后的配置。

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

条件规则可以按这几类理解：

<div class="lc-protocol-grid">
  <div>
    <strong>eq / neq</strong>
    <span>等于或不等于某个值，比如客户类型是否为 individual。</span>
  </div>
  <div>
    <strong>in / notIn</strong>
    <span>是否在一组选项中，比如国家是否属于 BR、US、CA。</span>
  </div>
  <div>
    <strong>empty / notEmpty</strong>
    <span>字段有没有填写，适合控制提示文案或后续字段状态。</span>
  </div>
  <div>
    <strong>allOf / anyOf</strong>
    <span>多个条件全部满足，或满足任意一个即可。</span>
  </div>
</div>

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

提交链路可以拆成：

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>点击按钮</strong>
    <span>Continue 或 Submit 都走同一个主操作。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>校验当前步骤</strong>
    <span>只检查当前 step.questions 里的 required 字段。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>失败停留</strong>
    <span>必填没填就 setErrors，显示红色提示。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>成功提交</strong>
    <span>POST /api/submit，把当前步骤答案写入 submissions。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>切换状态</strong>
    <span>不是最后一步就进入下一步，最后一步显示成功页。</span>
  </div>
</div>

这里也有一个重要边界：前端校验是为了用户体验，后端接口仍然要再校验一次。真正产品化时，服务端必须按 schema/questionnaire 做二次校验。

## 本地文件作为“轻量后端”

项目没有数据库，几个本地文件承担了后端存储：

| 需求 | 文件 |
| --- | --- |
| 修改字段标题、控件类型、联动规则 | `data/schema.json` |
| 修改问卷步骤和必填项 | `data/questionnaire.json` |
| 修改下拉选项 | `data/options.json` |
| 查看提交结果 | `data/submissions.json` |

这个设计让项目非常适合做 SDK 原型或产品 demo。配置人员不用改 React 组件，只要理解三份 JSON 的分工，就能调整问卷结构。

本地 JSON 的角色可以这样看：

<div class="lc-map">
  <div>
    <strong>配置人员改问卷</strong>
    <span>改 schema、questionnaire、options，不需要改 React 组件。</span>
  </div>
  <div>
    <strong>Next.js API 读文件</strong>
    <span>API Routes 把本地 JSON 当成轻量数据源返回给浏览器。</span>
  </div>
  <div>
    <strong>浏览器运行时渲染</strong>
    <span>QuestionnaireApp 根据配置和答案快照生成页面。</span>
  </div>
  <div>
    <strong>提交结果落文件</strong>
    <span>/api/submit 把提交记录写入 data/submissions.json。</span>
  </div>
</div>

这不是最终生产形态，但很适合验证边界：配置驱动、运行时解析、当前步骤校验、提交闭环。

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

最后更新：2025-10-20
