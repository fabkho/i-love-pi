---
name: vue-nuxt-performance
description: >
  Audit Vue and Nuxt applications for performance issues. Checks for hydration mismatches,
  missing lazy loading, reactivity overhead, bundle size problems, SSR anti-patterns, and
  Core Web Vitals regressions. Use when user says "check performance", "audit performance",
  "vue performance", "nuxt performance", "hydration issues", "slow page", "optimize vue",
  "optimize nuxt", or invokes /vue-nuxt-performance.
---

# Vue & Nuxt Performance Audit

When triggered, systematically audit the codebase for performance issues across these categories. Report findings as a prioritized list with file locations, the problem, and the fix.

## Audit Procedure

1. **Identify the project type**: Check `nuxt.config.ts`/`nuxt.config.js` for Nuxt, or `vite.config.ts`/`vue.config.js` for plain Vue.
2. **Scan the codebase** using the checks below.
3. **Report findings** grouped by severity (Critical → Warning → Info), each with file path, line, problem, and fix.

## Checks to Perform

### 1. Hydration Mismatches (Nuxt only — Critical)

Scan `<script setup>` blocks and templates for:

#### Browser-only APIs in server context
**Problem**: `localStorage`, `sessionStorage`, `window`, `document`, `navigator` used outside `onMounted` or `import.meta.client` guards.

```html
<!-- BAD -->
<script setup>
const theme = localStorage.getItem('theme') || 'light'
</script>

<!-- GOOD -->
<script setup>
const theme = useCookie('theme', { default: () => 'light' })
</script>
```

#### Inconsistent data between server and client
**Problem**: `Math.random()`, `Date.now()`, `new Date()` used directly in reactive state or templates.

```html
<!-- BAD -->
<template><div>{{ Math.random() }}</div></template>

<!-- GOOD -->
<script setup>
const state = useState('random', () => Math.random())
</script>
```

#### Conditional rendering based on client state
**Problem**: `v-if` conditions using `window`, `screen`, `navigator`, or other browser globals.

```html
<!-- BAD -->
<div v-if="window?.innerWidth > 768">Desktop</div>

<!-- GOOD: use CSS -->
<div class="hidden md:block">Desktop</div>
```

#### Third-party libraries with side effects
**Problem**: Browser-only libs imported at top-level or initialized in `<script setup>` with `import.meta.client` but outside `onMounted`.

```html
<!-- BAD -->
<script setup>
if (import.meta.client) {
  const { default: Lib } = await import('browser-only-lib')
  Lib.init()
}
</script>

<!-- GOOD -->
<script setup>
onMounted(async () => {
  const { default: Lib } = await import('browser-only-lib')
  Lib.init()
})
</script>
```

#### Dynamic time-based content
**Problem**: `new Date().getHours()` or similar in setup/template without `ClientOnly` or `NuxtTime`.

```html
<!-- GOOD -->
<NuxtTime :date="new Date()" format="HH:mm" />

<!-- GOOD -->
<ClientOnly>
  {{ greeting }}
  <template #fallback>Hello!</template>
</ClientOnly>
```

### 2. Missing Lazy Loading (Critical)

#### Components that should be lazy
**Problem**: Heavy or conditionally-rendered components imported eagerly.
**Detection**: Look for components behind `v-if`, `v-show`, tabs, modals, drawers that are NOT using the `Lazy` prefix (Nuxt) or `defineAsyncComponent` (Vue).

```html
<!-- BAD (Nuxt) -->
<HeavyChart v-if="showChart" />

<!-- GOOD (Nuxt) -->
<LazyHeavyChart v-if="showChart" />

<!-- GOOD (Vue) -->
const HeavyChart = defineAsyncComponent(() => import('./HeavyChart.vue'))
```

#### Route-level code splitting
**Problem**: Route components imported statically in router config.

```js
// BAD
import Dashboard from '@/views/Dashboard.vue'

// GOOD
const Dashboard = () => import('@/views/Dashboard.vue')
```

### 3. Missing Lazy Hydration (Nuxt ≥3.16 — Warning)

**Problem**: Below-the-fold or non-critical components that hydrate immediately.
**Detection**: Look for components that are visually below the fold or non-interactive on load without `hydrate-on-visible`, `hydrate-on-idle`, or `hydrate-on-interaction`.

```html
<!-- GOOD -->
<LazyFooter hydrate-on-visible />
<LazyComments hydrate-on-idle />
<LazySearchModal hydrate-on-interaction />
```

### 4. Vue Reactivity Overhead (Warning)

#### Large immutable data without shallowRef
**Problem**: Large arrays or deeply nested objects stored in `ref()` or `reactive()` that are replaced wholesale, not mutated deeply.
**Detection**: Look for `ref([...largeArray])` patterns, API responses stored in `ref()` with 100+ items.

```js
// BAD
const items = ref(largeArray)

// GOOD
const items = shallowRef(largeArray)
// Update by replacing:
items.value = [...items.value, newItem]
```

#### Computed properties returning new objects every time
**Problem**: `computed()` that returns a new object/array on every call, defeating Vue 3.4+ computed stability.

```js
// BAD
const result = computed(() => ({ isEven: count.value % 2 === 0 }))

// GOOD
const result = computed((oldValue) => {
  const newValue = { isEven: count.value % 2 === 0 }
  if (oldValue && oldValue.isEven === newValue.isEven) return oldValue
  return newValue
})
```

### 5. Props Stability (Warning)

**Problem**: Passing frequently-changing values as props to list items when a derived boolean would suffice.

```html
<!-- BAD: every ListItem re-renders when activeId changes -->
<ListItem v-for="item in list" :id="item.id" :active-id="activeId" />

<!-- GOOD: only items whose active status changed re-render -->
<ListItem v-for="item in list" :id="item.id" :active="item.id === activeId" />
```

### 6. Missing v-once / v-memo (Info)

- **`v-once`**: Static content that uses runtime data but never updates. Look for large template blocks rendered once.
- **`v-memo`**: Large `v-for` lists where most items don't change between renders.

```html
<div v-for="item in list" :key="item.id" v-memo="[item.id === selected]">
  <!-- expensive template -->
</div>
```

### 7. Nuxt-Specific Optimizations (Warning)

#### Hybrid rendering not configured
**Problem**: All routes use the same rendering strategy when some could be prerendered or cached.
**Detection**: Check `nuxt.config.ts` for `routeRules`. If absent, suggest configuring it.

```ts
export default defineNuxtConfig({
  routeRules: {
    '/': { prerender: true },
    '/products/**': { swr: 3600 },
    '/admin/**': { ssr: false },
  },
})
```

#### NuxtLink prefetch strategy
**Detection**: Check if prefetch strategy is configured. Default viewport prefetching may be too aggressive.

```ts
export default defineNuxtConfig({
  experimental: {
    defaults: {
      nuxtLink: { prefetchOn: 'interaction' },
    },
  },
})
```

#### Plugin performance
- Check for plugins that could be composables instead.
- Check async plugins missing `parallel: true`.
- Check for expensive computation in plugin setup.

```ts
// GOOD: async plugin with parallel
export default defineNuxtPlugin({
  parallel: true,
  async setup() { /* ... */ },
})
```

#### Data fetching
**Problem**: Using raw `fetch`/`axios` instead of `useFetch`/`useAsyncData`, causing double-fetching (server + client).

#### Image optimization
**Problem**: Using raw `<img>` tags instead of `<NuxtImg>` (from `@nuxt/image`).
**Detection**: Look for `<img` tags in templates. Check if `@nuxt/image` is installed.

```html
<!-- Critical images -->
<NuxtImg src="/hero.jpg" format="webp" :preload="{ fetchPriority: 'high' }" loading="eager" width="800" height="400" />

<!-- Non-critical images -->
<NuxtImg src="/logo.jpg" format="webp" loading="lazy" fetchpriority="low" width="200" height="100" />
```

#### Font optimization
**Detection**: Check if `@nuxt/fonts` is installed. Look for external font CDN links in `<head>` or CSS.

#### Script optimization
**Detection**: Check for inline `<script>` tags loading third-party scripts. Suggest `@nuxt/scripts` for analytics, tag managers, etc.

### 8. Unnecessary Component Abstractions (Info)

**Problem**: Renderless or wrapper components used in large lists, creating hundreds of unnecessary component instances.
**Detection**: Look for wrapper components in `v-for` loops that only pass through props/slots.

## Search Patterns

Use these grep/ripgrep patterns to find issues:

```bash
# Browser APIs in script setup (hydration risks)
rg -n 'localStorage|sessionStorage|window\.|document\.|navigator\.' --type vue --glob '*.vue'

# Random/Date in templates or setup
rg -n 'Math\.random|new Date\(\)\.get|Date\.now' --type vue --glob '*.vue'

# Static route imports
rg -n "^import .+ from .+views/" src/router/ app/router/

# Raw img tags (Nuxt projects)
rg -n '<img ' --glob '*.vue'

# Raw fetch/axios in components (Nuxt projects)
rg -n '\bfetch\(|axios\.' --glob '*.vue' --glob '*.ts' -g '!node_modules'

# Async plugins without parallel
rg -n 'defineNuxtPlugin' --glob '*.ts' --glob '*.js' -l
```

## Output Format

```
## Performance Audit Results

### 🔴 Critical
1. **[file:line]** Hydration mismatch: `localStorage` used in setup
   → Use `useCookie()` or move to `onMounted`

### 🟡 Warning
2. **[file:line]** Large list (v-for) without virtualization (~500 items)
   → Use vue-virtual-scroller

### 🔵 Info
3. **[file:line]** Static content could use `v-once`
   → Add v-once to reduce update overhead
```
