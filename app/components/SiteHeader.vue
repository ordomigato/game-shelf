<template>
  <header
    class="border-b-4 border-shelf bg-masthead text-masthead-foreground shadow-[0_2px_0_var(--shelf-edge)]"
  >
    <div
      class="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6"
    >
      <NuxtLink to="/" class="font-heading text-2xl font-bold tracking-tight">
        GameShelf
      </NuxtLink>
      <div class="flex items-center gap-1">
        <ThemeSwitcher />
        <UserMenu />
      </div>
    </div>
  </header>
</template>
