<template>
  <section class="hero">
    <div class="hero-content">
      <h1 class="hero-title">Welcome to GameShelf</h1>
      <p class="hero-subtitle">Explore and catalog your favorite games</p>
      <div class="hero-input-container">
        <BaseInput
          class="w-100"
          v-model="search"
          id="search-bar"
          type="text"
          placeholder="ex. Super Mario Bros, Metal Gear Solid"
        />
        <BaseButton @click="handleClick">Search Games</BaseButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">

const search = ref('')

function handleSearch() {
  alert('Searching...')
}
function handleClick() {
  // Navigate, scroll, or emit an event
  alert('Button clicked!')
}
</script>

<style scoped>
.hero {
  height: 100vh;
  background: linear-gradient(135deg, #1e1e2f, #2c3e50);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  text-align: center;
  padding: 2rem;
}

.hero-content {
  max-width: 600px;
}

.hero-title {
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.hero-subtitle {
  font-size: 1.2rem;
  margin-bottom: 2rem;
}

.hero-input-container {
  display: flex;
  width: 100%;
  gap: 0.5rem;
  justify-content: center;
}
</style>
