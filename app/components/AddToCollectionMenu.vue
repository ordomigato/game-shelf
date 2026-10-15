<script setup lang="ts">
import { CircleCheck, CirclePlus, Plus } from '@lucide/vue'
import { toast } from 'vue-sonner'
import type { CollectionSummary } from '#shared/types/collection'

/**
 * The "Add to collection" menu for an IGDB game: Owned and the Wishlist
 * first, then the user's collections as checkboxes. Each tick saves
 * straight away. A game is one library item however many collections it's
 * in, so the first tick creates the item and later ticks only link it.
 * Ticking a collection ticks Owned too, and unticking Owned (after asking)
 * unticks the collections. The collections
 * come from the sidebar's list and the game's ticks are remembered, so
 * opening the menu again doesn't ask the server again.
 */
const props = withDefaults(
  defineProps<{
    game: { igdbId: number; name: string; coverId: string | null }
    /** `icon` for a small button over a search result's cover. */
    variant?: 'icon' | 'button'
  }>(),
  { variant: 'button' },
)
/** Whether the game is in at least one collection. Drives the trigger. */
const tracked = defineModel<boolean>('tracked', { default: false })

const { t } = useI18n()
const auth = useAuth()
const route = useRoute()
const collections = useCollections()
const myCollections = useMyCollections()
const titleOf = useCollectionTitle()
const unown = useUnownConfirm()

const open = ref(false)
const loading = ref(false)
const error = ref('')
const lists = computed(() => myCollections.list.value ?? [])
const itemId = ref<string | null>(null)
const selected = ref(new Set<string>())
const saving = ref(new Set<string>())
const creating = ref(false)

const label = computed(() =>
  tracked.value
    ? t('addToCollection.inCollections')
    : t('addToCollection.button'),
)

async function onOpenChange(value: boolean) {
  if (!value) {
    open.value = false
    return
  }
  await auth.ensureLoaded()
  if (auth.status.value !== 'signedIn') {
    await navigateTo({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  open.value = true
  await load()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [, membership] = await Promise.all([
      myCollections.load(),
      collections.membership(props.game.igdbId),
    ])
    itemId.value = membership.item?.id ?? null
    setSelected(membership.collectionIds)
  } catch {
    error.value = t('addToCollection.loadFailed')
  } finally {
    loading.value = false
  }
}

function setSelected(ids: Iterable<string>) {
  selected.value = new Set(ids)
  tracked.value = selected.value.size > 0
}

/**
 * Before unticking Owned: the custom collections the game would leave too,
 * confirmed. False when the person cancels.
 */
async function confirmUnown(collection: CollectionSummary) {
  if (collection.kind !== 'owned') return true
  const others = lists.value.filter(
    (other) => other.kind === 'custom' && selected.value.has(other.id),
  )
  return unown.confirm(
    props.game.name,
    others.map((other) => titleOf(other)),
  )
}

async function toggle(collection: CollectionSummary, checked: boolean) {
  const id = collection.id
  if (saving.value.has(id)) return
  if (!checked && !(await confirmUnown(collection))) return
  saving.value = new Set(saving.value).add(id)
  error.value = ''
  const before = selected.value
  const next = new Set(before)
  if (checked) next.add(id)
  else next.delete(id)
  setSelected(next)
  try {
    if (checked && !itemId.value) {
      const added = await collections.addGame(props.game, [id])
      itemId.value = added.item.id
      setSelected(added.collectionIds)
    } else if (checked) {
      const saved = await collections.addItem(id, itemId.value!)
      setSelected(saved.collectionIds)
    } else {
      const saved = await collections.removeItem(id, itemId.value!)
      setSelected(saved.collectionIds)
    }
  } catch (error) {
    setSelected(before)
    toast.error(limitMessage(error, t) ?? t('addToCollection.saveFailed'))
  } finally {
    const done = new Set(saving.value)
    done.delete(id)
    saving.value = done
  }
}

function startCreating() {
  open.value = false
  creating.value = true
}

async function onCreated(collection: CollectionSummary) {
  await toggle(collection, true)
}
</script>

<template>
  <DropdownMenu :open="open" @update:open="onOpenChange">
    <DropdownMenuTrigger as-child>
      <CoverActionButton
        v-if="variant === 'icon'"
        :state="tracked ? 'have' : 'add'"
        :label="`${label}: ${game.name}`"
      />
      <Button v-else :variant="tracked ? 'outline' : 'default'">
        <CircleCheck v-if="tracked" />
        <CirclePlus v-else />
        {{ label }}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-64">
      <DropdownMenuLabel>{{ $t('addToCollection.heading') }}</DropdownMenuLabel>
      <p v-if="loading" class="px-2 py-1.5 text-sm text-muted-foreground">
        {{ $t('addToCollection.loading') }}
      </p>
      <template v-else>
        <DropdownMenuCheckboxItem
          v-for="collection in lists"
          :key="collection.id"
          :model-value="selected.has(collection.id)"
          :disabled="saving.has(collection.id)"
          @update:model-value="toggle(collection, $event === true)"
          @select.prevent
        >
          <span class="truncate">{{ titleOf(collection) }}</span>
        </DropdownMenuCheckboxItem>
      </template>
      <p v-if="error" role="alert" class="px-2 py-1.5 text-sm text-destructive">
        {{ error }}
      </p>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="startCreating">
        <Plus /> {{ $t('addToCollection.newCollection') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  <CollectionFormDialog v-model:open="creating" @saved="onCreated" />
</template>
