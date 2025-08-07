<template>
  <footer class="footer">
    <div class="footer-content">
      <div class="footer-brand">
        <h2>GameShelf</h2>
        <p>Your personal game catalog and discovery tool.</p>
      </div>

      <div class="footer-links">
        <a href="#">Home</a>
        <a href="#">Browse</a>
        <a href="#">About</a>
        <a href="#">Contact</a>
      </div>

      <div class="footer-copy">
        © {{ new Date().getFullYear() }} GameShelf. All rights reserved.
      </div>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  background: #1e1e2f;
  color: white;
  padding: 2rem 1rem;
  font-size: 0.9rem;
  border-top: 1px solid #2e2e40;
}

.footer-content {
  max-width: 1200px;
  margin: 0 auto;
  text-align: center;
}

.footer-brand {
  margin-bottom: 1.5rem;
}

.footer-brand h2 {
  margin: 0;
  font-size: 1.5rem;
}

.footer-brand p {
  margin: 0.5rem 0 0;
  font-size: 0.95rem;
  color: #ccc;
}

.footer-links {
  margin: 1.5rem 0;
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.footer-links a {
  color: #ccc;
  text-decoration: none;
  transition: color 0.2s ease;
}

.footer-links a:hover {
  color: white;
}

.footer-copy {
  margin-top: 1.5rem;
  color: #888;
}
</style>
