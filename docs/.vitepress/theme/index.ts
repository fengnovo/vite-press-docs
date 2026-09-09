import type { Theme } from 'vitepress'
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import mediumZoom, { type Zoom } from 'medium-zoom'
import 'medium-zoom/dist/style.css'
import MermaidDiagram from './components/MermaidDiagram.vue'
import './style.css'

const zoomableImageSelector = '.vp-doc img:not(.no-zoom)'
let imageZoom: Zoom | undefined

function refreshImageZoom() {
  void nextTick(() => {
    const images = document.querySelectorAll<HTMLImageElement>(zoomableImageSelector)

    images.forEach((image) => {
      image.tabIndex = 0
      image.setAttribute('role', 'button')
      image.setAttribute('aria-label', `${image.alt || '文章图片'}，点击放大`)
    })

    if (!imageZoom) {
      imageZoom = mediumZoom(images, {
        background: 'rgba(12, 19, 19, 0.92)',
        margin: 24,
        scrollOffset: 40
      })
      return
    }

    imageZoom.detach()
    imageZoom.attach(images)
  })
}

function handleImageZoomKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  if (!(event.target instanceof HTMLImageElement)) return
  if (!event.target.matches(zoomableImageSelector)) return

  event.preventDefault()
  void imageZoom?.open({ target: event.target })
}

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('MermaidDiagram', MermaidDiagram)
  },
  setup() {
    const route = useRoute()

    onMounted(() => {
      refreshImageZoom()
      document.addEventListener('keydown', handleImageZoomKeydown)
    })
    onBeforeUnmount(() => {
      document.removeEventListener('keydown', handleImageZoomKeydown)
    })
    watch(() => route.path, refreshImageZoom)
  }
} satisfies Theme
