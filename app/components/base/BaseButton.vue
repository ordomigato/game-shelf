<template>
  <button
    :class="['base-button', variantClass, { loading, disabled }]"
    :type="type"
    :disabled="disabled || loading"
  >
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <span><slot /></span>
  </button>
</template>

<script setup lang="ts">
const props = defineProps<{
  type?: 'button' | 'submit' | 'reset'
  variant?: 'primary' | 'secondary' | 'ghost'
  loading?: boolean
  disabled?: boolean
}>()

const type = props.type ?? 'button'

const variantClass = {
  primary: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
}[props.variant ?? 'primary']
</script>

<style scoped>
.base-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  padding: 0.5em 1em;
  font-size: 1rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s ease, opacity 0.2s ease;
  white-space: nowrap;
}

/* Variants */
.base-button.primary {
  background-color: #007bff;
  color: white;
}
.base-button.primary:hover {
  background-color: #0069d9;
}

.base-button.secondary {
  background-color: #f0f0f0;
  color: #333;
}
.base-button.secondary:hover {
  background-color: #e0e0e0;
}

.base-button.ghost {
  background: transparent;
  color: #007bff;
  border: 1px solid #007bff;
}
.base-button.ghost:hover {
  background-color: rgba(0, 123, 255, 0.1);
}

/* Disabled state */
.base-button:disabled,
.base-button.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Loading Spinner */
.spinner {
  width: 1em;
  height: 1em;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
