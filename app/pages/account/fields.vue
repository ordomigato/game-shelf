<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { FieldDefinition } from '#shared/types/collection'

/**
 * The extra fields the user keeps for their games. One set for the whole
 * account, so every collection shows the same columns.
 */
const { t } = useI18n()
useHead(() => ({
  title: t('app.title', { page: t('account.tabs.fields') }),
}))

const accountFields = useAccountFields()
const { data, status, error, refresh } = useAsyncData(
  'account-fields',
  () => accountFields.get(),
  { server: false },
)

function onSaved(fields: FieldDefinition[]) {
  data.value = fields
  toast.success(t('fieldEditor.saved'))
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>
        <h2 class="text-lg font-semibold">{{ $t('fieldEditor.title') }}</h2>
      </CardTitle>
      <CardDescription>{{ $t('fieldEditor.description') }}</CardDescription>
    </CardHeader>
    <CardContent>
      <div v-if="status === 'pending' && !data" class="flex flex-col gap-3">
        <Skeleton class="h-16 w-full" />
        <Skeleton class="h-16 w-full" />
      </div>
      <div v-else-if="error" class="py-6 text-center">
        <p class="font-medium">{{ $t('fieldEditor.loadFailed') }}</p>
        <Button class="mt-4" @click="refresh()">{{ $t('shelf.retry') }}</Button>
      </div>
      <FieldsPanel v-else-if="data" :fields="data" @saved="onSaved" />
    </CardContent>
  </Card>
</template>
