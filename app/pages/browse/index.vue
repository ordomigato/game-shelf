<script setup lang="ts">
import { fetchIgdbGames } from '@/composables/useIgdb'

const games = ref<any[] | null>(null)
const error = ref<any>(null)
const pending = ref(true)

onMounted(async () => {
  try {
    games.value = await fetchIgdbGames(`
      fields name,cover.image_id,first_release_date,rating;
      sort popularity desc;
      limit 10;
    `)
  } catch (err) {
    error.value = err
  } finally {
    pending.value = false
  }
})
</script>

<template>
  <div>
    <h1>Top Games</h1>
    <div v-if="pending">Loading games...</div>
    <div v-else-if="error">Error: {{ error.message }}</div>
    <ul v-else>
      <li v-for="game in games" :key="game.id">
        <img
          v-if="game.cover"
          :src="`https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`"
          :alt="game.name"
        />
        {{ game.name }} – {{ Math.round(game.rating || 0) }}%
      </li>
    </ul>
  </div>
</template>
