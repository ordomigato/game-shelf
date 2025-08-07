<template>
  <div class="input-wrapper">
    <label v-if="label" :for="props.id" class="input-label">{{ label }}</label>
    <input
      :id="props.id"
      :type="type"
      :placeholder="placeholder"
      :value="modelValue"
      :disabled="disabled"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement)?.value)"
      class="input-field"
    />
  </div>
</template>
<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  id: string
  label?: string
  type?: string
  placeholder?: string
  disabled?: boolean
}>()
</script>
<style scoped>
.input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.input-label {
  font-size: 0.9rem;
  color: white;
}

.input-field {
  padding: 0.6rem 1rem;
  font-size: 1rem;
  border-radius: 6px;
  border: 1px solid #ccc;
  background-color: #fefefe;
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}

.input-field:focus {
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.2);
}

.input-field:disabled {
  background-color: #eee;
  cursor: not-allowed;
}
</style>
