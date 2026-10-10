<script setup lang="ts">
import { FetchError } from 'ofetch'
import type {
  CollectionSummary,
  BlueprintSummary,
} from '#shared/types/collection'
import {
  STARTER_BLUEPRINTS,
  type StarterBlueprint,
} from '#shared/utils/starter-blueprints'

/**
 * Creates a collection (name, description, and a starter or one of the
 * user's blueprints) or edits an existing one's name and description.
 * Emits the saved collection.
 */
const props = defineProps<{
  /** Set to edit this collection. Leave out to create a new one. */
  collection?: CollectionSummary
}>()
const emit = defineEmits<{ saved: [collection: CollectionSummary] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const auth = useAuth()
const collections = useCollections()

const starters: {
  id: StarterBlueprint
  labelKey: string
  descriptionKey: string
}[] = [
  {
    id: 'collector',
    labelKey: 'collections.form.starters.collector.name',
    descriptionKey: 'collections.form.starters.collector.description',
  },
  {
    id: 'player',
    labelKey: 'collections.form.starters.player.name',
    descriptionKey: 'collections.form.starters.player.description',
  },
  {
    id: 'blank',
    labelKey: 'collections.form.starters.blank.name',
    descriptionKey: 'collections.form.starters.blank.description',
  },
]

const title = ref('')
const description = ref('')
/** A starter's id, or the id of one of the user's blueprints. */
const start = ref<string>('collector')
const blueprints = ref<BlueprintSummary[]>([])
/** With a blueprint picked: share its fields, or start from a copy. */
const keepLinked = ref(true)
const error = ref('')
const saving = ref(false)

watch(open, async (isOpen) => {
  if (!isOpen) return
  title.value = props.collection?.title ?? ''
  description.value = props.collection?.description ?? ''
  start.value = 'collector'
  keepLinked.value = true
  error.value = ''
  if (props.collection) return
  try {
    blueprints.value = await collections.blueprints()
  } catch (e) {
    // Without the list, the starters are still there to pick from.
    console.error(e)
    blueprints.value = []
  }
})

const isStarter = (id: string): id is StarterBlueprint =>
  STARTER_BLUEPRINTS.includes(id as StarterBlueprint)

const slugPreview = computed(() => slugify(title.value))
const isWishlist = computed(() => props.collection?.kind === 'wishlist')
// The Wishlist's name can't be changed, so it never blocks saving.
const canSave = computed(
  () => !saving.value && (isWishlist.value || title.value.trim() !== ''),
)

async function save() {
  const problem = isWishlist.value ? null : collectionTitleProblem(title.value)
  error.value = problem ? t(problem.key, problem.params ?? {}) : ''
  if (error.value) return
  saving.value = true
  try {
    const details = {
      ...(!isWishlist.value && { title: title.value.trim() }),
      description: description.value.trim() || null,
    }
    const saved = props.collection
      ? await collections.update(props.collection.id, details)
      : await collections.create({
          title: title.value.trim(),
          description: details.description,
          ...(isStarter(start.value)
            ? { starter: start.value }
            : { blueprintId: start.value, copy: !keepLinked.value }),
        })
    open.value = false
    emit('saved', saved)
  } catch (e) {
    error.value =
      e instanceof FetchError && e.statusCode === 409
        ? t('collections.nameTaken')
        : t('common.genericError')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {{
            collection
              ? $t('collections.form.editTitle')
              : $t('collections.form.createTitle')
          }}
        </DialogTitle>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="save">
        <FormMessage v-if="error">{{ error }}</FormMessage>
        <div v-if="!isWishlist" class="flex flex-col gap-2">
          <Label for="collection-title">{{
            $t('collections.form.name')
          }}</Label>
          <Input
            id="collection-title"
            v-model="title"
            maxlength="80"
            aria-describedby="collection-address"
            required
          />
          <p id="collection-address" class="text-xs text-muted-foreground">
            {{
              $t('collections.form.address', {
                path: `/u/${auth.me.value?.username ?? ''}/shelf/${slugPreview || '…'}`,
              })
            }}
          </p>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="collection-description">
            {{ $t('collections.form.description') }}
          </Label>
          <Textarea
            id="collection-description"
            v-model="description"
            maxlength="500"
            rows="3"
          />
        </div>
        <fieldset v-if="!collection" class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-medium">
            {{ $t('collections.form.start') }}
          </legend>
          <RadioGroup v-model="start" class="gap-2">
            <Label
              v-for="option in starters"
              :key="option.id"
              :for="`starter-${option.id}`"
              class="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent"
            >
              <RadioGroupItem
                :id="`starter-${option.id}`"
                :value="option.id"
                class="mt-0.5"
              />
              <span class="flex flex-col gap-0.5">
                <span class="font-medium">{{ $t(option.labelKey) }}</span>
                <span class="text-xs font-normal text-muted-foreground">
                  {{ $t(option.descriptionKey) }}
                </span>
              </span>
            </Label>
            <template v-if="blueprints.length">
              <p class="mt-2 text-sm font-medium">
                {{ $t('collections.form.yourBlueprints') }}
              </p>
              <Label
                v-for="set in blueprints"
                :key="set.id"
                :for="`blueprint-${set.id}`"
                class="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent"
              >
                <RadioGroupItem
                  :id="`blueprint-${set.id}`"
                  :value="set.id"
                  class="mt-0.5"
                />
                <span class="flex flex-col gap-0.5">
                  <span class="font-medium">{{ set.name }}</span>
                  <span class="text-xs font-normal text-muted-foreground">
                    {{
                      $t(
                        'collections.form.fieldCount',
                        { count: set.fieldCount },
                        set.fieldCount,
                      )
                    }}
                  </span>
                </span>
              </Label>
            </template>
          </RadioGroup>
          <div
            v-if="!isStarter(start)"
            class="flex flex-col gap-1 rounded-md bg-muted/50 p-3"
          >
            <Label class="flex items-center gap-2">
              <Checkbox v-model="keepLinked" />
              {{ $t('collections.form.keepLinked') }}
            </Label>
            <p class="text-xs text-muted-foreground">
              {{
                keepLinked
                  ? $t('collections.form.keepLinkedOn')
                  : $t('collections.form.keepLinkedOff')
              }}
            </p>
          </div>
        </fieldset>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">
            {{ $t('collections.form.cancel') }}
          </Button>
          <Button type="submit" :disabled="!canSave">
            <template v-if="collection">
              {{
                saving
                  ? $t('collections.form.saving')
                  : $t('collections.form.save')
              }}
            </template>
            <template v-else>
              {{
                saving
                  ? $t('collections.form.creating')
                  : $t('collections.form.create')
              }}
            </template>
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
