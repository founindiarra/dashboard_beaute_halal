<script setup>
import { computed } from 'vue'

/** Pastille d'état, déclinée sur les tons sobres de la charte admin. */
const props = defineProps({
  label: { type: String, required: true },
  tone: { type: String, default: 'neutral' }, // ok | warn | danger | info | neutral
})

const TONES = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  neutral: 'bg-line-soft text-muted',
}

const classes = computed(() => TONES[props.tone] || TONES.neutral)
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-3 py-1 text-[0.7rem] font-medium whitespace-nowrap"
    :class="classes"
  >
    {{ label }}
  </span>
</template>
