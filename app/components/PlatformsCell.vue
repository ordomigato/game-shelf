<script setup lang="ts">
import { Plus } from '@lucide/vue'
import type {
  CollectionEntry,
  LibraryItem,
  ListName,
} from '#shared/types/collection'
import { platformsOf } from '#shared/utils/platforms'

/**
 * The platforms column, the same on every page: the platforms the game is
 * owned on as plain chips, and the ones it's on the Wishlist for as outline
 * chips with a star (see `PlatformChips`). A visitor only reads them. The
 * owner clicks the cell to pick from the platforms the catalog knows the
 * game on. Each tick saves at once and shows
 * straight away, and is undone with a message if saving fails. A game
 * added by hand has no catalog platforms, so its cell is empty and can't
 * be clicked.
 */
const props = defineProps<{ item: CollectionEntry; editable: boolean }>()
const emit = defineEmits<{
  /** The game's new place on the lists, as saved. */
  changed: [saved: LibraryItem]
}>()

const collections = useCollections()

const { ownedOn, wantedOn, toggle } = usePlatformToggle(
  () => props.item,
  async (list, platforms) => {
    const { item } = await collections.changeLists(props.item.id, {
      type: list === 'owned' ? 'setOwnedOn' : 'setWantedOn',
      platforms,
    })
    return item
  },
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

async function tick(list: ListName, platformId: number, on: boolean) {
  const saved = await toggle(list, platformId, on)
  if (saved) emit('changed', saved)
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
        <PlatformChips :owned="shown.owned" :wanted="shown.wanted" />
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
          v-for="group in ['owned', 'wishlist'] as const"
          :key="group"
          class="flex flex-col gap-1"
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
            class="flex cursor-pointer items-center gap-2 min-h-10 rounded-sm px-1.5 py-1 font-normal hover:bg-accent"
          >
            <Checkbox
              :model-value="
                (group === 'owned' ? ownedOn : wantedOn).includes(platform.id)
              "
              @update:model-value="tick(group, platform.id, $event === true)"
            />
            {{ platform.name }}
          </Label>
        </fieldset>
      </div>
    </PopoverContent>
  </Popover>
  <div v-else class="flex max-w-64 flex-wrap items-center gap-1">
    <PlatformChips :owned="shown.owned" :wanted="shown.wanted" />
  </div>
</template>
