<script setup lang="ts">
import { Download } from '@lucide/vue'
import { FetchError } from 'ofetch'

const { t } = useI18n()
useHead(() => ({
  title: t('app.title', { page: t('account.settings.pageTitle') }),
}))

const auth = useAuth()
const collections = useCollections()
const error = ref('')

const exporting = ref(false)
const exportError = ref('')

/** Downloads every collection as CSV files in one zip. */
async function exportEverything() {
  exportError.value = ''
  exporting.value = true
  try {
    const date = new Date().toISOString().slice(0, 10)
    saveFile(
      await collections.exportEverything(),
      `thisplayshelf-${auth.me.value?.username ?? 'export'}-${date}.zip`,
    )
  } catch (e) {
    exportError.value =
      e instanceof FetchError && e.statusCode === 429
        ? t('account.settings.exportTooSoon')
        : t('account.settings.exportFailed')
  } finally {
    exporting.value = false
  }
}
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
    <SettingsBarcodeShare v-if="auth.me.value?.contributesBarcodes" />
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 class="text-lg font-semibold">
            {{ $t('account.settings.exportTitle') }}
          </h2>
        </CardTitle>
        <CardDescription>{{
          $t('account.settings.exportDescription')
        }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <FormMessage v-if="exportError">{{ exportError }}</FormMessage>
        <Button
          variant="outline"
          class="self-start"
          :disabled="exporting"
          @click="exportEverything"
        >
          <Download />
          {{
            exporting
              ? $t('account.settings.exporting')
              : $t('account.settings.exportButton')
          }}
        </Button>
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
