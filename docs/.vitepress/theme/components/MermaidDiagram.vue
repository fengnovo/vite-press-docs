<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'

const props = defineProps<{
  graph: string
}>()

const { isDark } = useData()
const canvas = ref<HTMLElement | null>(null)
const zoomStage = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const errorMessage = ref('')
const isRendered = ref(false)
const isZoomOpen = ref(false)
const isDragging = ref(false)
const zoomScale = ref(1)
const panX = ref(0)
const panY = ref(0)
const zoomSvg = ref('')
const source = computed(() => decodeURIComponent(props.graph))
const zoomPercent = computed(() => Math.round(zoomScale.value * 100))
const zoomTransform = computed(() => ({
  transform: `translate(-50%, -50%) translate(${panX.value}px, ${panY.value}px) scale(${zoomScale.value})`
}))

let renderVersion = 0
let isUnmounted = false
let previousActiveElement: HTMLElement | null = null
let previousBodyOverflow = ''
let dragPointerId: number | null = null
let dragStartX = 0
let dragStartY = 0
const zoomNamespace = `zoom-${Math.random().toString(36).slice(2)}`

const minScale = 0.5
const maxScale = 6

function clampScale(value: number) {
  return Math.min(maxScale, Math.max(minScale, value))
}

function replaceZoomSvg(svg: string) {
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)]
    .map((match) => match[1])
    .sort((first, second) => second.length - first.length)

  zoomSvg.value = ids.reduce(
    (result, id) => result.replaceAll(id, `${id}-${zoomNamespace}`),
    svg
  )
}

function resetZoom() {
  zoomScale.value = 1
  panX.value = 0
  panY.value = 0
}

function openZoom() {
  if (!isRendered.value || !zoomSvg.value) return

  previousActiveElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  resetZoom()
  isZoomOpen.value = true
  void nextTick(() => closeButton.value?.focus())
}

function closeZoom(restoreFocus = true) {
  if (!isZoomOpen.value) return

  isZoomOpen.value = false
  isDragging.value = false
  dragPointerId = null
  document.body.style.overflow = previousBodyOverflow

  if (restoreFocus) {
    void nextTick(() => previousActiveElement?.focus())
  }
}

function zoomBy(factor: number) {
  zoomScale.value = clampScale(zoomScale.value * factor)
}

function handleWheel(event: WheelEvent) {
  const stage = zoomStage.value
  if (!stage) return

  const rect = stage.getBoundingClientRect()
  const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? event.deltaY * 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? event.deltaY * rect.height
      : event.deltaY
  const nextScale = clampScale(zoomScale.value * Math.exp(-delta * 0.0015))
  if (nextScale === zoomScale.value) return

  const pointerX = event.clientX - (rect.left + rect.width / 2)
  const pointerY = event.clientY - (rect.top + rect.height / 2)
  const ratio = nextScale / zoomScale.value

  panX.value = pointerX - (pointerX - panX.value) * ratio
  panY.value = pointerY - (pointerY - panY.value) * ratio
  zoomScale.value = nextScale
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0) return

  const stage = event.currentTarget as HTMLElement
  dragPointerId = event.pointerId
  dragStartX = event.clientX - panX.value
  dragStartY = event.clientY - panY.value
  isDragging.value = true
  stage.setPointerCapture(event.pointerId)
}

function drag(event: PointerEvent) {
  if (!isDragging.value || dragPointerId !== event.pointerId) return
  panX.value = event.clientX - dragStartX
  panY.value = event.clientY - dragStartY
}

function stopDrag(event: PointerEvent) {
  if (dragPointerId !== event.pointerId) return

  const stage = event.currentTarget as HTMLElement
  if (stage.hasPointerCapture(event.pointerId)) {
    stage.releasePointerCapture(event.pointerId)
  }
  isDragging.value = false
  dragPointerId = null
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (!isZoomOpen.value) return

  if (event.key === 'Escape') {
    event.preventDefault()
    closeZoom()
  } else if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    zoomBy(1.2)
  } else if (event.key === '-') {
    event.preventDefault()
    zoomBy(1 / 1.2)
  } else if (event.key === '0') {
    event.preventDefault()
    resetZoom()
  }
}

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
    replaceZoomSvg(svg)
    isRendered.value = true
  } catch (error) {
    if (isUnmounted || currentVersion !== renderVersion) return

    errorMessage.value = error instanceof Error ? error.message : '未知错误'
    isRendered.value = false
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleDocumentKeydown)
  void renderDiagram()
})

watch(isDark, () => {
  void renderDiagram()
})

onBeforeUnmount(() => {
  isUnmounted = true
  renderVersion += 1
  document.removeEventListener('keydown', handleDocumentKeydown)
  closeZoom(false)
})
</script>

<template>
  <figure class="mermaid-diagram">
    <div
      v-show="!errorMessage"
      ref="canvas"
      class="mermaid-diagram__canvas"
      role="button"
      tabindex="0"
      aria-haspopup="dialog"
      aria-label="Mermaid 流程图，点击放大"
      :aria-busy="!isRendered"
      @click="openZoom"
      @keydown.enter="openZoom"
      @keydown.space.prevent="openZoom"
    />
    <span v-if="isRendered && !errorMessage" class="mermaid-diagram__hint" aria-hidden="true">
      点击放大 · 滚轮缩放
    </span>
    <div v-if="!isRendered && !errorMessage" class="mermaid-diagram__loading">
      流程图生成中...
    </div>
    <details v-if="errorMessage" class="mermaid-diagram__error" open>
      <summary>流程图渲染失败：{{ errorMessage }}</summary>
      <pre><code>{{ source }}</code></pre>
    </details>
  </figure>

  <Teleport to="body">
    <div
      v-if="isZoomOpen"
      class="mermaid-zoom"
      role="dialog"
      aria-modal="true"
      aria-label="Mermaid 流程图放大查看"
      @click.self="closeZoom()"
    >
      <div class="mermaid-zoom__toolbar">
        <button type="button" title="缩小" aria-label="缩小流程图" @click="zoomBy(1 / 1.2)">−</button>
        <output aria-live="polite">{{ zoomPercent }}%</output>
        <button type="button" title="放大" aria-label="放大流程图" @click="zoomBy(1.2)">+</button>
        <button type="button" title="恢复默认大小" aria-label="恢复默认大小" @click="resetZoom">↺</button>
        <button
          ref="closeButton"
          type="button"
          title="关闭"
          aria-label="关闭流程图"
          @click="closeZoom()"
        >×</button>
      </div>
      <div
        ref="zoomStage"
        class="mermaid-zoom__stage"
        :class="{ 'is-dragging': isDragging }"
        @wheel.prevent="handleWheel"
        @pointerdown="startDrag"
        @pointermove="drag"
        @pointerup="stopDrag"
        @pointercancel="stopDrag"
      >
        <div
          class="mermaid-zoom__diagram"
          role="img"
          aria-label="放大后的 Mermaid 流程图"
          :style="zoomTransform"
          v-html="zoomSvg"
        />
      </div>
      <p class="mermaid-zoom__help">滚轮缩放 · 拖拽移动 · Esc 关闭</p>
    </div>
  </Teleport>
</template>
