<script setup>
import AdminIcon from './AdminIcon.vue'

defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Rechercher…' },
  label: { type: String, default: 'Rechercher' },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <div class="relative w-full sm:max-w-xs">
    <AdminIcon
      name="search"
      class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
    />
    <input
      type="search"
      class="input pl-9"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="label"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  </div>
</template>
