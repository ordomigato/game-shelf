<script setup lang="ts">
import { Plus, Star } from '@lucide/vue'
import { toast } from 'vue-sonner'
import type { CollectionEntry, LibraryItem } from '#shared/types/collection'
import { platformsOf } from '#shared/utils/platforms'

/**
 * The platforms column, the same on every page: the platforms the game is
 * owned on as plain chips, and the ones it's on the Wishlist for as outline
 * chips with a star. The owner clicks the cell to pick from the platforms
 * the catalog knows the game on. Each tick saves at once and shows
 * straight away, and is undone with a message if saving fails. A game
 * added by hand has no catalog platforms, so its cell is empty and can't
 * be clicked.
 */
const props = defineProps<{ item: CollectionEntry; editable: boolean }>()
const emit = defineEmits<{
  /** The game's new place on the lists, as saved. */
  changed: [saved: LibraryItem]
}>()

const { t } = useI18n()
const collections = useCollections()

const saving = ref(false)
/** The platforms as ticked, until the save finishes. */
const pending = ref<{ ownedOn: number[]; wantedOn: number[] } | null>(null)

const ownedOn = computed(
  () => pending.value?.ownedOn ?? props.item.ownedOn ?? [],
)
const wantedOn = computed(
  () => pending.value?.wantedOn ?? props.item.wantedOn ?? [],
)
const options = computed(() => props.item.catalogPlatforms ?? [])
const shown = computed(() =>
  platformsOf({
    catalogPlatforms: options.value,
    ownedOn: ownedOn.value,
    wantedOn: wantedOn.value,
  }),
)
const pickable = computed(() => props.editable && options.value.length > 0)

type Group = 'owned' | 'wanted'

async function toggle(platformId: number, group: Group, on: boolean) {
  if (saving.value) return
  const owned = new Set(ownedOn.value)
  const wanted = new Set(wantedOn.value)
  const [mine, other] = group === 'owned' ? [owned, wanted] : [wanted, owned]
  if (on) {
    mine.add(platformId)
    other.delete(platformId)
  } else {
    mine.delete(platformId)
  }
  pending.value = { ownedOn: [...owned], wantedOn: [...wanted] }
  saving.value = true
  try {
    const { item } = await collections.changeLists(props.item.id, {
      type: group === 'owned' ? 'setOwnedOn' : 'setWantedOn',
      platforms: [...mine],
    })
    if (item) emit('changed', item)
  } catch {
    toast.error(t('table.platformsSaveFailed'))
  } finally {
    pending.value = null
    saving.value = false
  }
}
</script>

<template>
  <Popover v-if="pickable">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="-mx-1.5 flex max-w-64 flex-wrap items-center gap-1 rounded-md px-1.5 py-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="$t('table.editPlatforms', { name: item.name })"
      >
        <Badge
          v-for="platform in shown.owned"
          :key="`owned-${platform.id}`"
          as="span"
          variant="secondary"
          class="text-[11px]"
          :title="platform.name"
        >
          {{ platform.name }}
        </Badge>
        <Badge
          v-for="platform in shown.wanted"
          :key="`wanted-${platform.id}`"
          as="span"
          variant="outline"
          class="gap-1 text-[11px] text-muted-foreground"
          :title="`${platform.name} (${$t('table.wishlist')})`"
        >
          <Star class="size-3" aria-hidden="true" />
          {{ platform.name }}
          <span class="sr-only">{{ $t('table.wishlist') }}</span>
        </Badge>
        <Plus
          v-if="!shown.owned.length && !shown.wanted.length"
          class="size-4 text-muted-foreground"
          aria-hidden="true"
        />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-64 p-3">
      <div class="flex flex-col gap-3">
        <fieldset
          v-for="group in ['owned', 'wanted'] as const"
          :key="group"
          class="flex flex-col gap-1"
          :disabled="saving"
        >
          <legend class="mb-1 text-xs font-medium text-muted-foreground">
            {{
              group === 'owned'
                ? $t('addToCollection.ownedOn')
                : $t('addToCollection.wantedOn')
            }}
          </legend>
          <Label
            v-for="platform in options"
            :key="platform.id"
            class="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 font-normal hover:bg-accent"
          >
            <Checkbox
              :model-value="
                (group === 'owned' ? ownedOn : wantedOn).includes(platform.id)
              "
              :disabled="saving"
              @update:model-value="toggle(platform.id, group, $event === true)"
            />
            {{ platform.name }}
          </Label>
        </fieldset>
      </div>
    </PopoverContent>
  </Popover>
</template>
