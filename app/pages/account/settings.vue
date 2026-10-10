<script setup lang="ts">
const { t } = useI18n()
useHead(() => ({
  title: t('app.title', { page: t('account.settings.pageTitle') }),
}))

const auth = useAuth()
const error = ref('')
const deleting = ref(false)

async function deleteAccount() {
  error.value = ''
  deleting.value = true
  try {
    await auth.deleteAccount()
    await navigateTo('/')
  } catch {
    error.value = t('account.settings.deleteFailed')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 class="text-lg font-semibold">
            {{ $t('account.settings.appearanceTitle') }}
          </h2>
        </CardTitle>
        <CardDescription>{{
          $t('account.settings.appearanceDescription')
        }}</CardDescription>
      </CardHeader>
      <CardContent>
        <ThemeSwitcher show-labels />
      </CardContent>
    </Card>
    <Card class="border-destructive/40">
      <CardHeader>
        <CardTitle>
          <h2 class="text-lg font-semibold">
            {{ $t('account.settings.deleteTitle') }}
          </h2>
        </CardTitle>
        <CardDescription>{{
          $t('account.settings.deleteDescription')
        }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <FormMessage v-if="error">{{ error }}</FormMessage>
        <AlertDialog>
          <AlertDialogTrigger as-child>
            <Button variant="destructive" class="self-start">
              {{ $t('account.settings.deleteButton') }}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{{
                $t('account.settings.confirmTitle')
              }}</AlertDialogTitle>
              <AlertDialogDescription>
                {{ $t('account.settings.confirmBody') }}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{{
                $t('account.settings.keep')
              }}</AlertDialogCancel>
              <AlertDialogAction
                class="bg-destructive text-white hover:bg-destructive/90"
                :disabled="deleting"
                @click="deleteAccount"
              >
                {{ $t('account.settings.deleteButton') }}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  </div>
</template>
