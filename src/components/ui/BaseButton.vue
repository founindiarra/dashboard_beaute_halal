<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

/** Bouton unique du dashboard : <router-link>, <a> ou <button> selon les props. */
const props = defineProps({
  to: { type: [String, Object], default: null },
  href: { type: String, default: null },
  type: { type: String, default: 'button' },
  variant: { type: String, default: 'primary' }, // primary | secondary | ghost | danger | subtle
  size: { type: String, default: 'md' }, // sm | md
  block: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})

const VARIANTS = {
  primary: 'bg-cocoa-dark text-cream border-cocoa-dark hover:bg-cocoa hover:border-cocoa',
  secondary: 'bg-surface text-cocoa-dark border-line hover:border-gold hover:text-gold',
  ghost: 'bg-transparent text-cocoa border-transparent hover:bg-ivory',
  subtle: 'bg-ivory text-cocoa-dark border-transparent hover:bg-sand',
  danger: 'bg-danger text-white border-danger hover:opacity-90',
}

const SIZES = {
  sm: 'min-h-[36px] gap-1.5 px-3 text-[0.78rem]',
  md: 'min-h-[42px] gap-2 px-4 text-[0.85rem]',
}

const isDisabled = computed(() => props.disabled || props.loading)

const tag = computed(() => {
  if (isDisabled.value) return 'button'
  if (props.to) return RouterLink
  if (props.href) return 'a'
  return 'button'
})

const classes = computed(() => [
  'inline-flex items-center justify-center rounded-full border font-medium',
  'transition-colors duration-150 select-none whitespace-nowrap',
  SIZES[props.size] || SIZES.md,
  VARIANTS[props.variant] || VARIANTS.primary,
  props.block ? 'w-full' : '',
  isDisabled.value ? 'cursor-not-allowed opacity-55' : '',
])

const attrs = computed(() => {
  if (isDisabled.value) return { type: props.type, disabled: true }
  if (props.to) return { to: props.to }
  if (props.href) {
    const external = props.href.startsWith('http')
    return {
      href: props.href,
      ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
    }
  }
  return { type: props.type }
})
</script>

<template>
  <component :is="tag" v-bind="attrs" :class="classes">
    <span
      v-if="loading"
      class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
    <slot />
  </component>
</template>
