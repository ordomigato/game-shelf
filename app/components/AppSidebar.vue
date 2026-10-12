<script setup lang="ts">
/** The signed-in layout's sidebar on wide screens. Phones get the drawer. */
defineProps<{ shelfPath: string }>()
</script>

<template>
  <aside
    class="sticky top-0 h-dvh w-(--sidebar-width) flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar px-2.5 py-3.5 text-sidebar-foreground"
  >
    <SidebarNav :shelf-path="shelfPath" />
  </aside>
</template>
