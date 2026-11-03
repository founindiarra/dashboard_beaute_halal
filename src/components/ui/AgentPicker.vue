<script setup>
import { computed } from 'vue'

/**
 * Choix de plusieurs agents / coiffeuses pour une même prestation.
 * Le premier de la liste est l'agent principal. `options` : [{ value, label }] (sans « Aucun agent »).
 */
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] },
  label: { type: String, default: 'Agents / coiffeuses' },
  hint: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const selected = computed(() => props.modelValue.map(String))
const toggle = (value) => {
  const v = String(value)
  emit('update:modelValue', selected.value.includes(v) ? selected.value.filter((x) => x !== v) : [...selected.value, v])
}
</script>

<template>
  <fieldset class="flex flex-col">
    <legend class="label">{{ label }}</legend>
    <div class="flex flex-wrap gap-2">
      <label
        v-for="option in options"
        :key="option.value"
        class="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors"
        :class="selected.includes(String(option.value)) ? 'border-gold bg-gold/10 text-cocoa-dark' : 'border-line-soft bg-white text-cocoa'"
      >
        <input
          type="checkbox"
          class="h-4 w-4 accent-[var(--color-gold)]"
          :checked="selected.includes(String(option.value))"
          @change="toggle(option.value)"
        />
        <span>{{ option.label }}</span>
        <span v-if="selected[0] === String(option.value) && selected.length > 1" class="text-[0.65rem] uppercase tracking-wide text-muted">principal</span>
      </label>
      <p v-if="!options.length" class="text-xs text-muted">Aucun agent actif.</p>
    </div>
    <p v-if="hint" class="mt-1 text-xs text-muted">{{ hint }}</p>
  </fieldset>
</template>
