<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="mx-auto w-full max-w-md py-8">
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 class="font-heading text-2xl font-bold">{{ title }}</h1>
        </CardTitle>
        <CardDescription v-if="description">{{ description }}</CardDescription>
      </CardHeader>
      <CardContent>
        <slot />
      </CardContent>
      <CardFooter
        v-if="$slots.footer"
        class="flex-col items-start gap-2 text-sm"
      >
        <slot name="footer" />
      </CardFooter>
    </Card>
  </div>
</template>
