<script setup lang="ts">
/**
 * The question `useUnownConfirm` asks before a game leaves its last list
 * and the collections it's in. One for the whole app, in the layout.
 */
const { locale } = useI18n()
const { question, answer } = useUnownConfirm()

const collections = computed(() =>
  new Intl.ListFormat(locale.value, {
    style: 'long',
    type: 'conjunction',
  }).format(question.value?.collections ?? []),
)

function onOpenChange(open: boolean) {
  if (!open) answer(false)
}
</script>

<template>
  <AlertDialog :open="question !== null" @update:open="onOpenChange">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{
          question?.list === 'wishlist'
            ? $t('unown.titleWishlist', { name: question?.name ?? '' })
            : $t('unown.titleOwned', { name: question?.name ?? '' })
        }}</AlertDialogTitle>
        <AlertDialogDescription>{{
          $t('unown.body', { collections })
        }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ $t('collection.cancel') }}</AlertDialogCancel>
        <Button variant="destructive" @click="answer(true)">
          {{ $t('unown.confirm') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
