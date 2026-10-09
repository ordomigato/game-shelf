<template>
  <div class="flex min-h-dvh flex-col">
    <SiteHeader />
    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>
