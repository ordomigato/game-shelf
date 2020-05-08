// Redirect to home page if user is not signed in trying to access /library
export default function({store, route, redirect}) {
  const user = store.state.users.user;
  const blockedRoute = /\/library\/*/g;

  if( !user && route.path.match(blockedRoute)) {
    redirect('/')
  }
}