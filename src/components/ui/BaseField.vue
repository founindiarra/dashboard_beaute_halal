<script setup>
import { computed, useId } from 'vue'

/**
 * Champ de formulaire : input, textarea ou select selon les props.
 * Porte l'étiquette, l'aide et le message d'erreur, relié au champ par
 * aria-describedby pour les lecteurs d'écran.
 */
const props = defineProps({
  label: { type: String, required: true },
  modelValue: { type: [String, Number], default: '' },
  type: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  autocomplete: { type: String, default: null },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  textarea: { type: Boolean, default: false },
  rows: { type: Number, default: 3 },
  /** Liste [{ value, label }] : le champ devient un menu déroulant. */
  options: { type: Array, default: null },
  error: { type: String, default: '' },
  hint: { type: String, default: '' },
  min: { type: [String, Number], default: null },
  max: { type: [String, Number], default: null },
  step: { type: [String, Number], default: null },
})

defineEmits(['update:modelValue'])

const uid = useId()
const fieldId = computed(() => `field-${uid}`)
const describedBy = computed(() => (props.error || props.hint ? `${fieldId.value}-desc` : undefined))
</script>

<template>
  <div class="flex flex-col">
    <label :for="fieldId" class="label">
      {{ label }}
      <span v-if="required" class="text-danger" aria-hidden="true">*</span>
    </label>

    <select
      v-if="options"
      :id="fieldId"
      class="input"
      :value="modelValue"
      :required="required"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option v-for="option in options" :key="String(option.value)" :value="option.value">
        {{ option.label }}
      </option>
    </select>

    <textarea
      v-else-if="textarea"
      :id="fieldId"
      class="input resize-y"
      :rows="rows"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      @input="$emit('update:modelValue', $event.target.value)"
    />

    <input
      v-else
      :id="fieldId"
      class="input"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :required="required"
      :disabled="disabled"
      :min="min"
      :max="max"
      :step="step"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      @input="$emit('update:modelValue', $event.target.value)"
    />

    <p
      v-if="error || hint"
      :id="describedBy"
      class="mt-1 text-xs"
      :class="error ? 'text-danger' : 'text-muted'"
    >
      {{ error || hint }}
    </p>
  </div>
</template>
