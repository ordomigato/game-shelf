<template>
  <footer class="border-t border-border py-6 text-sm text-muted-foreground">
    <div
      class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6"
    >
      <p>GameShelf</p>
      <i18n-t keypath="footer.igdbCredit" tag="p">
        <template #igdb>
          <a
            href="https://www.igdb.com"
            class="underline underline-offset-4 hover:text-foreground"
            target="_blank"
            rel="noopener"
            >IGDB</a
          >
        </template>
      </i18n-t>
    </div>
  </footer>
</template>
