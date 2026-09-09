<script setup lang="ts">
import { withBase } from 'vitepress'

type ProjectLink = {
  label: string
  url: string
  internal?: boolean
}

type Project = {
  number: string
  title: string
  category: string
  description: string
  image: string
  imageAlt: string
  coverShape: 'wide' | 'standard' | 'tall'
  primaryUrl: string
  primaryLabel: string
  links: ProjectLink[]
  tags: string[]
}

defineProps<{
  projects: Project[]
}>()
</script>

<template>
  <main class="project-showcase">
    <header class="project-showcase__header">
      <p class="project-showcase__eyebrow">
        项目作品集 · {{ projects.length }} 个工程实践
      </p>
      <h1>把想法做成可以运行的东西</h1>
      <p class="project-showcase__lead">
        这里收录的不只是 Demo，也包括架构拆分、交付链路和稳定性建设。点开卡片可以直接体验项目，源码与完整复盘也都留在卡片里。
      </p>
    </header>

    <div class="project-masonry" aria-label="项目作品列表">
      <article
        v-for="project in projects"
        :key="project.number"
        class="project-tile"
      >
        <a
          class="project-tile__primary"
          :href="project.primaryUrl"
          target="_blank"
          rel="noreferrer"
          :aria-label="`${project.primaryLabel}（新标签页）`"
        />

        <div :class="['project-tile__media', `project-tile__media--${project.coverShape}`]">
          <img
            :src="withBase(project.image)"
            :alt="project.imageAlt"
            width="1200"
            height="800"
            loading="lazy"
          >
        </div>

        <div class="project-tile__body">
          <p class="project-tile__category">{{ project.category }}</p>
          <h2>{{ project.title }}</h2>
          <p class="project-tile__description">{{ project.description }}</p>

          <ul class="project-tile__tags" aria-label="技术关键词">
            <li v-for="tag in project.tags" :key="tag">{{ tag }}</li>
          </ul>

          <nav class="project-tile__links" :aria-label="`${project.title}相关链接`">
            <a
              v-for="link in project.links"
              :key="`${project.number}-${link.label}`"
              :href="link.internal ? withBase(link.url) : link.url"
              target="_blank"
              rel="noreferrer"
            >
              {{ link.label }}<span aria-hidden="true">↗</span>
            </a>
          </nav>
        </div>
      </article>
    </div>
  </main>
</template>
