export default {
  mode: 'universal',
  /*
   ** Headers of the page
   */
  head: {
    title: process.env.npm_package_name || '',
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      {
        hid: 'description',
        name: 'description',
        content: process.env.npm_package_description || ''
      }
    ],
    link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }]
  },
  /*
   ** Customize the progress-bar color
   */
  loading: { color: '#fff', height: '4px', duration: 5000 },
  /*
   ** Global CSS
   */
  css: [
    '~assets/css/global.css',
    'swiper/css/swiper.css'
  ],
  /*
   ** Plugins to load before mounting the App
   */
  plugins: [
    '~/plugins/gameLibraryMixins.js',
    { src: '@/plugins/vue-awesome-swiper', ssr: false },
  ],
    /*
   ** Router settings
   */
  router: {
    middleware: ['authenticated']
  },
  /*
   ** Nuxt.js dev-modules
   */
  buildModules: [
    '@nuxt/typescript-build',
    // Doc: https://github.com/nuxt-community/nuxt-tailwindcss
    '@nuxtjs/tailwindcss'
  ],
  /*
   ** Nuxt.js modules
   */
  modules: [
    'nuxt-lazy-load',
    '@nuxtjs/dotenv',
    ['@nuxtjs/firebase',
      {
        config: {
          apiKey: "AIzaSyBb-NGwBZ6JlSW_BqxGEtflw1DdBBHvvRw",
          authDomain: "gameshelf-510ba.firebaseapp.com",
          databaseURL: "https://gameshelf-510ba.firebaseio.com",
          projectId: "gameshelf-510ba",
          storageBucket: "gameshelf-510ba.appspot.com",
          messagingSenderId: "769359361119",
          appId: "1:769359361119:web:3c334d177018ba0882d7ea",
          measurementId: "G-CCCTVVRWFM"
        },
        services: {
          auth: {
            initialize: {
              onAuthStateChangedAction: 'users/onAuthStateChangedAction'
            },
          },
          firestore: true,
          storage: true,
          functions: true,
        }
      }
    ],
    ['@nuxtjs/axios', { proxy: true }],
    ['nuxt-fontawesome', {
      component: 'fa', 
      imports: [
        //import whole set
        {
          set: '@fortawesome/free-solid-svg-icons',
          icons: ['fas']
        },
        {
          set: '@fortawesome/free-regular-svg-icons',
          icons: ['far']
        },
      ]
    }]
  ],
  /*
   ** Axios module configuration
   ** See https://axios.nuxtjs.org/options
   */
  axios: {
    baseURL: process.env.baseUrl || 'https://game-shelf-app.herokuapp.com/',
  },
  proxy: {
    '/games/': 'https://api-v3.igdb.com',
  },
  /*
   ** Build configuration
   */
  build: {
    /*
     ** You can extend webpack config here
     */
    extend(config, ctx) {}
  },
  env: {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000'
  },
  purgeCSS: {
    whitelistPatterns: [/(^|\.)fa-/, /-fa($|\.)/]
  },
}
