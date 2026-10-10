<script setup lang="ts">
import { ArrowLeft, Trash2 } from '@lucide/vue'
import { FetchError } from 'ofetch'
import { toast } from 'vue-sonner'
import type { BlueprintImpact } from '#shared/types/collection'
import { blueprintNameProblem } from '#shared/utils/blueprint-names'

definePageMeta({ middleware: 'auth' })

/**
 * The one place to edit a blueprint: its name, its fields, and which
 * collections use it. Before saving fields, the server works out what
 * changes across every collection using it, and that's shown to confirm.
 */
const route = useRoute()
const { t } = useI18n()
const auth = useAuth()
const collections = useCollections()
const titleOf = useCollectionTitle()

const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = useAsyncData(
  () => `blueprint-${id.value}`,
  () => collections.getBlueprint(id.value),
  { watch: [id] },
)
const notFound = computed(() => error.value?.statusCode === 404)

useHead(() => ({
  title: t('app.title', {
    page: data.value?.name ?? t('blueprintsPage.title'),
  }),
}))

const shelfPath = computed(() => `/u/${auth.me.value?.username ?? ''}/shelf`)

// Name

const name = ref('')
const nameError = ref('')
const renaming = ref(false)
watch(
  data,
  (blueprint) => {
    if (blueprint) name.value = blueprint.name ?? ''
  },
  { immediate: true },
)
const nameChanged = computed(
  () => !!data.value && name.value.trim() !== (data.value.name ?? ''),
)

async function rename() {
  if (!data.value) return
  const problem = blueprintNameProblem(name.value)
  nameError.value = problem ? t(problem.key, problem.params ?? {}) : ''
  if (problem) return
  renaming.value = true
  try {
    const saved = await collections.renameBlueprint(
      data.value.id,
      name.value.trim(),
    )
    data.value = { ...data.value, name: saved.name }
    toast.success(t('blueprintsPage.renamed'))
  } catch (e) {
    nameError.value =
      e instanceof FetchError && e.statusCode === 409
        ? t('blueprints.nameTaken')
        : t('blueprintsPage.renameFailed')
  } finally {
    renaming.value = false
  }
}

// Fields

const editor = useFieldDrafts()
watch(
  data,
  (blueprint) => {
    if (blueprint) editor.reset(blueprint.fields)
  },
  { immediate: true },
)
const attempted = ref(false)
const checking = ref(false)
const saving = ref(false)
/** What saving would change, while asking to confirm. */
const impact = ref<BlueprintImpact | null>(null)

async function review() {
  if (!data.value) return
  attempted.value = true
  if (editor.problem.value) return
  checking.value = true
  try {
    impact.value = await collections.previewBlueprintFields(
      data.value.id,
      editor.nextFields.value,
      editor.renames.value,
    )
  } catch {
    toast.error(t('blueprintsPage.previewFailed'))
  } finally {
    checking.value = false
  }
}

async function saveFields() {
  if (!data.value) return
  saving.value = true
  try {
    await collections.updateBlueprintFields(
      data.value.id,
      editor.nextFields.value,
      editor.renames.value,
    )
    impact.value = null
    attempted.value = false
    await refresh()
    toast.success(t('blueprintsPage.saved'))
  } catch {
    toast.error(t('fieldEditor.saveFailed'))
  } finally {
    saving.value = false
  }
}

/** Ticked to confirm values will be deleted. */
const acknowledged = ref(false)
watch(impact, () => {
  acknowledged.value = false
})

/** Removed fields that no game using the blueprint has a value for. */
const emptyRemovals = computed(() => {
  if (!data.value || !impact.value) return []
  const kept = new Set(editor.nextFields.value.map((field) => field.id))
  const losing = new Set(impact.value.lost.map((loss) => loss.name))
  return data.value.fields
    .filter((field) => !kept.has(field.id) && !losing.has(field.name))
    .map((field) => field.name)
})

/** The review dialog is open while there's a preview to confirm. */
const reviewing = computed({
  get: () => impact.value !== null,
  set: (open) => {
    if (!open) impact.value = null
  },
})

const gamesAffected = computed(
  () =>
    impact.value?.collections.reduce(
      (total, collection) => total + collection.itemCount,
      0,
    ) ?? 0,
)

// Delete

const confirmingDelete = ref(false)
async function deleteBlueprint() {
  if (!data.value) return
  try {
    await collections.deleteBlueprint(data.value.id)
    await navigateTo('/blueprints')
  } catch {
    toast.error(t('blueprintsPage.deleteFailed'))
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
    <div>
      <Button as-child variant="ghost" size="sm" class="-ml-2">
        <NuxtLink to="/blueprints">
          <ArrowLeft /> {{ $t('blueprintsPage.back') }}
        </NuxtLink>
      </Button>
    </div>

    <div v-if="status === 'pending' && !data" class="flex flex-col gap-3">
      <Skeleton class="h-10 w-64" />
      <Skeleton class="h-40 w-full" />
    </div>

    <div v-else-if="notFound" class="py-12 text-center">
      <p class="text-lg font-medium">{{ $t('blueprintsPage.notFound') }}</p>
    </div>

    <div v-else-if="error" class="py-12 text-center">
      <p class="text-lg font-medium">{{ $t('blueprintsPage.loadFailed') }}</p>
      <Button class="mt-4" @click="refresh()">{{ $t('shelf.retry') }}</Button>
    </div>

    <template v-else-if="data">
      <h1 class="text-3xl font-bold">{{ data.name }}</h1>

      <!-- Name -->
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 class="text-lg font-semibold">
              {{ $t('blueprintsPage.nameTitle') }}
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form class="flex flex-col gap-3" @submit.prevent="rename">
            <div class="flex gap-2">
              <Input
                v-model="name"
                :aria-label="$t('blueprints.name')"
                maxlength="60"
                class="max-w-sm"
              />
              <Button type="submit" :disabled="!nameChanged || renaming">
                {{ $t('blueprintsPage.rename') }}
              </Button>
            </div>
            <FormMessage v-if="nameError">{{ nameError }}</FormMessage>
          </form>
        </CardContent>
      </Card>

      <!-- Used by -->
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 class="text-lg font-semibold">
              {{ $t('blueprintsPage.usedByTitle') }}
            </h2>
          </CardTitle>
          <CardDescription>
            {{ $t('blueprintsPage.usedByDescription') }}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul v-if="data.collections.length" class="flex flex-col gap-1">
            <li
              v-for="collection in data.collections"
              :key="collection.id"
              class="flex items-center justify-between gap-4"
            >
              <NuxtLink
                :to="`${shelfPath}/${collection.slug}`"
                class="font-medium text-primary underline-offset-4 hover:underline"
              >
                {{ titleOf(collection) }}
              </NuxtLink>
              <span class="text-sm text-muted-foreground">
                {{ $t('shelf.gameCount', collection.itemCount) }}
              </span>
            </li>
          </ul>
          <div v-else class="flex flex-col items-start gap-3">
            <p class="text-sm text-muted-foreground">
              {{ $t('blueprintsPage.unused') }}
            </p>
            <Button variant="destructive" @click="confirmingDelete = true">
              <Trash2 /> {{ $t('blueprintsPage.delete') }}
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- Fields -->
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 class="text-lg font-semibold">
              {{ $t('fieldEditor.title') }}
            </h2>
          </CardTitle>
          <CardDescription>
            {{ $t('blueprintsPage.fieldsDescription') }}
          </CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <form id="blueprint-fields" @submit.prevent="review">
            <FieldsEditor :editor="editor" />
          </form>

          <FormMessage v-if="attempted && editor.problem.value">{{
            editor.problem.value
          }}</FormMessage>

          <div>
            <Button type="submit" form="blueprint-fields" :disabled="checking">
              {{
                checking
                  ? $t('blueprintsPage.checking')
                  : $t('fieldEditor.save')
              }}
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- What saving would change, to confirm before anything is saved -->
      <AlertDialog v-model:open="reviewing">
        <AlertDialogContent v-if="impact">
          <AlertDialogHeader>
            <AlertDialogTitle>{{
              $t('blueprintsPage.reviewTitle')
            }}</AlertDialogTitle>
            <AlertDialogDescription>
              {{
                $t(
                  'blueprintsPage.reviewCollections',
                  {
                    count: impact.collections.length,
                    games: gamesAffected,
                  },
                  impact.collections.length,
                )
              }}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul class="list-disc pl-5 text-sm text-muted-foreground">
            <li v-for="collection in impact.collections" :key="collection.id">
              {{ titleOf(collection) }} ·
              {{ $t('shelf.gameCount', collection.itemCount) }}
            </li>
          </ul>
          <DataLossWarning
            v-model:acknowledged="acknowledged"
            :losses="impact.lost"
            :empty-removals="emptyRemovals"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{{ $t('fieldEditor.back') }}</AlertDialogCancel>
            <Button
              :class="
                impact.lost.length
                  ? 'bg-destructive text-white hover:bg-destructive/90'
                  : undefined
              "
              :disabled="saving || (impact.lost.length > 0 && !acknowledged)"
              @click="saveFields"
            >
              {{
                saving
                  ? $t('fieldEditor.saving')
                  : impact.lost.length
                    ? $t('dataLoss.deleteAndSave')
                    : $t('fieldEditor.save')
              }}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog v-model:open="confirmingDelete">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{{
              $t('blueprintsPage.deleteTitle', { name: data.name ?? '' })
            }}</AlertDialogTitle>
            <AlertDialogDescription>
              {{ $t('blueprintsPage.deleteBody') }}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{{ $t('collection.cancel') }}</AlertDialogCancel>
            <AlertDialogAction
              class="bg-destructive text-white hover:bg-destructive/90"
              @click="deleteBlueprint"
            >
              {{ $t('blueprintsPage.delete') }}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </template>
  </div>
</template>
