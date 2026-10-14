<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, required: true },
  hint: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <button
    type="button"
    class="flex w-full items-start gap-3 text-left"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    :class="disabled ? 'cursor-not-allowed opacity-55' : ''"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span
      class="mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors"
      :class="modelValue ? 'border-gold bg-gold' : 'border-line bg-line-soft'"
    >
      <span
        class="h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
        :class="modelValue ? 'translate-x-[1.15rem]' : 'translate-x-[0.15rem]'"
      />
    </span>
    <span class="min-w-0">
      <span class="block text-sm text-cocoa-dark">{{ label }}</span>
      <span v-if="hint" class="block text-xs text-muted">{{ hint }}</span>
    </span>
  </button>
</template>
