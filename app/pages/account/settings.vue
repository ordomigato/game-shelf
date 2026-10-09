<script setup lang="ts">
useHead({ title: 'Settings · GameShelf' })

const auth = useAuth()
const error = ref('')
const deleting = ref(false)

async function deleteAccount() {
  error.value = ''
  deleting.value = true
  try {
    await auth.deleteAccount()
    await navigateTo('/')
  } catch {
    error.value = "We couldn't delete your account. Try again."
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <Card class="border-destructive/40">
    <CardHeader>
      <CardTitle
        ><h2 class="text-lg font-semibold">Delete account</h2></CardTitle
      >
      <CardDescription>
        This deletes your account, your collections and everything in them. It
        can't be undone.
      </CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      <FormMessage v-if="error">{{ error }}</FormMessage>
      <AlertDialog>
        <AlertDialogTrigger as-child>
          <Button variant="destructive" class="self-start"
            >Delete account</Button
          >
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Your account, collections and everything in them will be deleted.
              This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my account</AlertDialogCancel>
            <AlertDialogAction
              class="bg-destructive text-white hover:bg-destructive/90"
              :disabled="deleting"
              @click="deleteAccount"
            >
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CardContent>
  </Card>
</template>
