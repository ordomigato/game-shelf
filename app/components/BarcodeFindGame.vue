<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { BarcodeMatch } from '#shared/types/barcode'
import type { GameSummary } from '#shared/types/game'
import type { GameMembership } from '~/composables/useGameMemberships'

/**
 * A step inside the scanner for choosing the game a barcode stands for:
 * search, pick a game, then optionally one of its platforms. It sends the
 * search words and a game id only, never the barcode. Emits the chosen
 * game as a match for the row.
 */
defineProps<{ name: string | null }>()
const emit = defineEmits<{ pick: [match: BarcodeMatch]; back: [] }>()

const auth = useAuth()
const input = ref('')
const games = ref<GameSummary[]>([])
const status = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
const choosing = ref<GameSummary | null>(null)
const membership = ref<GameMembership | null>(null)
const platform = ref('none')
const loadingGame = ref(false)
const gameFailed = ref(false)
let controller: AbortController | undefined

const term = computed(() => input.value.trim())
const tooShort = computed(
  () => term.value.length > 0 && term.value.length < MIN_SEARCH_LENGTH,
)
const platforms = computed(() => membership.value?.platforms ?? [])

async function search() {
  controller?.abort()
  if (term.value.length < MIN_SEARCH_LENGTH) {
    games.value = []
    status.value = 'idle'
    return
  }
  controller = new AbortController()
  const { signal } = controller
  status.value = 'loading'
  try {
    const response = await $fetch<{ games: GameSummary[] }>(
      '/api/games/search',
      { query: { q: term.value }, signal },
    )
    games.value = response.games
    status.value = 'done'
  } catch (error) {
    if (signal.aborted) return
    console.error(error)
    status.value = 'error'
  }
}
const debounced = useDebounceFn(search, 300)
watch(input, () => void debounced())
onBeforeUnmount(() => controller?.abort())

async function choose(game: GameSummary) {
  choosing.value = game
  platform.value = 'none'
  membership.value = null
  gameFailed.value = false
  loadingGame.value = true
  try {
    membership.value = await auth.apiFetch<GameMembership>(
      `/api/library-items/igdb/${game.id}`,
      { retry: 0 },
    )
  } catch (error) {
    console.error(error)
    gameFailed.value = true
  } finally {
    loadingGame.value = false
  }
}

function confirm() {
  const game = choosing.value
  const found = membership.value
  if (!game || !found) return
  const chosen = platforms.value.find((p) => String(p.id) === platform.value)
  const item = found.item
  emit('pick', {
    igdbId: game.id,
    name: item?.name ?? game.name,
    coverId: game.coverId,
    releaseDate: game.year ? `${game.year}-01-01` : null,
    platform: chosen ?? null,
    owned: item?.owned ?? false,
    wishlisted: item?.wishlisted ?? false,
    ownedOn: item?.ownedOn ?? [],
    wantedOn: item?.wantedOn ?? [],
  })
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4" data-testid="scan-find">
    <div v-if="!choosing" class="flex min-h-0 flex-1 flex-col gap-3">
      <p class="text-sm text-muted-foreground">
        {{
          name ? $t('scan.findChange', { name }) : $t('scan.findDescription')
        }}
      </p>
      <form class="flex flex-col gap-1.5" @submit.prevent="search">
        <Label for="scan-find-input">{{ $t('scan.findLabel') }}</Label>
        <Input
          id="scan-find-input"
          v-model="input"
          type="search"
          autocomplete="off"
          :placeholder="$t('scan.findPlaceholder')"
        />
        <p v-if="tooShort" class="text-sm text-muted-foreground">
          {{ $t('search.tooShort', { count: MIN_SEARCH_LENGTH }) }}
        </p>
      </form>
      <p v-if="status === 'loading'" class="text-sm text-muted-foreground">
        {{ $t('scan.findSearching') }}
      </p>
      <p
        v-else-if="status === 'error'"
        class="text-sm text-destructive"
        role="alert"
      >
        {{ $t('search.errorTitle') }} {{ $t('search.errorBody') }}
      </p>
      <p
        v-else-if="status === 'done' && !games.length"
        class="text-sm text-muted-foreground"
      >
        {{ $t('scan.findNone', { term }) }}
      </p>
      <ul
        v-if="games.length"
        class="-mx-2 flex min-h-24 flex-1 flex-col gap-1 overflow-y-auto px-2"
        :aria-label="$t('scan.findResults')"
      >
        <li v-for="game in games" :key="game.id">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-lg border p-2 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            data-testid="scan-find-result"
            @click="choose(game)"
          >
            <GameCover
              :name="game.name"
              :cover-id="game.coverId"
              size="thumb"
              class="w-10 shrink-0"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ game.name }}</span>
              <span
                v-if="game.year"
                class="block text-xs text-muted-foreground"
                >{{ game.year }}</span
              >
            </span>
          </button>
        </li>
      </ul>
    </div>

    <div v-else class="flex min-h-0 flex-1 flex-col gap-3">
      <p class="font-medium">{{ choosing.name }}</p>
      <p v-if="loadingGame" class="text-sm text-muted-foreground">
        {{ $t('scan.findLoadingGame') }}
      </p>
      <p v-else-if="gameFailed" class="text-sm text-destructive" role="alert">
        {{ $t('scan.findGameFailed') }}
      </p>
      <template v-else-if="platforms.length">
        <p class="text-sm text-muted-foreground">
          {{ $t('scan.findPlatform') }}
        </p>
        <RadioGroup
          v-model="platform"
          class="min-h-0 flex-1 gap-2 overflow-y-auto"
          :aria-label="$t('scan.findPlatform')"
        >
          <div class="flex items-center gap-2">
            <RadioGroupItem id="scan-platform-none" value="none" />
            <Label for="scan-platform-none">{{
              $t('scan.findNoPlatform')
            }}</Label>
          </div>
          <div
            v-for="option in platforms"
            :key="option.id"
            class="flex items-center gap-2"
          >
            <RadioGroupItem
              :id="`scan-platform-${option.id}`"
              :value="String(option.id)"
            />
            <Label :for="`scan-platform-${option.id}`">{{ option.name }}</Label>
          </div>
        </RadioGroup>
      </template>
      <div class="mt-auto flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" @click="choosing = null">
          {{ $t('scan.findOtherGame') }}
        </Button>
        <Button
          type="button"
          :disabled="loadingGame || gameFailed"
          data-testid="scan-find-use"
          @click="confirm"
        >
          {{ $t('scan.findUse') }}
        </Button>
      </div>
    </div>

    <Button
      v-if="!choosing"
      type="button"
      variant="outline"
      @click="emit('back')"
    >
      {{ $t('scan.findBack') }}
    </Button>
  </div>
</template>
