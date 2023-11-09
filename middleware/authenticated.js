export default function(context) {
  // If the user is not authenticated
  if (!context.store.state.users.user && context.route.path[0] !== '/') {
    return context.redirect('/')
  }
}
