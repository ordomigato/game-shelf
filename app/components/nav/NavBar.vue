<template>
  <header class="navbar">
    <div class="navbar-container">
      <div class="logo">GameShelf</div>

      <nav :class="['nav-links', { open: isMenuOpen }]">
        <a href="#">Home</a>
        <a href="#">Browse</a>
        <a href="#">About</a>
        <a href="#">Contact</a>
      </nav>

      <button class="menu-toggle" @click="isMenuOpen = !isMenuOpen" aria-label="Toggle Menu">
        <span :class="{ open: isMenuOpen }"></span>
        <span :class="{ open: isMenuOpen }"></span>
        <span :class="{ open: isMenuOpen }"></span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue'
const isMenuOpen = ref(false)
</script>

<style scoped>
.navbar {
  width: 100%;
  position: fixed;
  top: 0;
  z-index: 100;
  background: #1e1e2f;
  color: white;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}

.navbar-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.logo {
  font-size: 1.5rem;
  font-weight: bold;
}

.nav-links {
  display: flex;
  gap: 1.5rem;
}

.nav-links a {
  text-decoration: none;
  color: white;
  font-size: 1rem;
  position: relative;
}

.nav-links a:hover::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: -4px;
  width: 100%;
  height: 2px;
  background: white;
}

/* Hamburger for mobile */
.menu-toggle {
  display: none;
  flex-direction: column;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
}

.menu-toggle span {
  width: 25px;
  height: 3px;
  background: white;
  display: block;
  transition: all 0.3s ease;
}

.menu-toggle span.open:nth-child(1) {
  transform: rotate(45deg) translateY(8px);
}
.menu-toggle span.open:nth-child(2) {
  opacity: 0;
}
.menu-toggle span.open:nth-child(3) {
  transform: rotate(-45deg) translateY(-8px);
}

/* Responsive behavior */
@media (max-width: 768px) {
  .nav-links {
    position: absolute;
    top: 100%;
    right: 0;
    flex-direction: column;
    background: #1e1e2f;
    width: 200px;
    padding: 1rem;
    display: none;
  }

  .nav-links.open {
    display: flex;
  }

  .menu-toggle {
    display: flex;
  }
}
</style>
