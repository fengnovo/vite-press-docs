<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'

const props = defineProps<{
  graph: string
}>()

const { isDark } = useData()
const canvas = ref<HTMLElement | null>(null)
const errorMessage = ref('')
const isRendered = ref(false)
const source = computed(() => decodeURIComponent(props.graph))

let renderVersion = 0
let isUnmounted = false

async function renderDiagram() {
  const target = canvas.value
  if (!target) return

  const currentVersion = ++renderVersion
  errorMessage.value = ''

  try {
    const { default: mermaid } = await import('mermaid')

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: isDark.value ? 'dark' : 'neutral',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true
      },
      sequence: {
        useMaxWidth: true,
        wrap: true
      }
    })

    const id = `mermaid-${Date.now()}-${currentVersion}-${Math.random().toString(36).slice(2)}`
    const { svg, bindFunctions } = await mermaid.render(id, source.value)

    if (isUnmounted || currentVersion !== renderVersion) return

    target.innerHTML = svg
    bindFunctions?.(target)
    isRendered.value = true
  } catch (error) {
    if (isUnmounted || currentVersion !== renderVersion) return

    errorMessage.value = error instanceof Error ? error.message : '未知错误'
    isRendered.value = false
  }
}

onMounted(() => {
  void renderDiagram()
})

watch(isDark, () => {
  void renderDiagram()
})

onBeforeUnmount(() => {
  isUnmounted = true
  renderVersion += 1
})
</script>

<template>
  <figure class="mermaid-diagram">
    <div
      v-show="!errorMessage"
      ref="canvas"
      class="mermaid-diagram__canvas"
      role="img"
      aria-label="Mermaid 流程图"
      :aria-busy="!isRendered"
    />
    <div v-if="!isRendered && !errorMessage" class="mermaid-diagram__loading">
      流程图生成中...
    </div>
    <details v-if="errorMessage" class="mermaid-diagram__error" open>
      <summary>流程图渲染失败：{{ errorMessage }}</summary>
      <pre><code>{{ source }}</code></pre>
    </details>
  </figure>
</template>
