/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: 'game-shelf',
      removal: input.stage === 'production' ? 'retain' : 'remove',
      protect: input.stage === 'production',
      home: 'aws',
      providers: {
        aws: {
          region: 'us-east-1',
          // GitHub Actions signs in with its own short-lived credentials.
          profile: process.env.GITHUB_ACTIONS
            ? undefined
            : (process.env.AWS_PROFILE ?? 'gameshelf'),
        },
      },
    }
  },
  async run() {
    const isProduction = $app.stage === 'production'

    const twitchClientId = new sst.Secret('TwitchClientId')
    const twitchClientSecret = new sst.Secret('TwitchClientSecret')
    // Neon Postgres connection string. Each stage points at its own Neon
    // branch.
    const databaseUrl = new sst.Secret('DatabaseUrl')

    const userPool = new sst.aws.CognitoUserPool('Users', {
      usernames: ['email'],
      transform: {
        userPool: (args) => {
          args.passwordPolicy = {
            minimumLength: 8,
            requireLowercase: true,
            requireUppercase: true,
            requireNumbers: true,
            requireSymbols: false,
            temporaryPasswordValidityDays: 7,
          }
          args.deletionProtection = isProduction ? 'ACTIVE' : 'INACTIVE'
        },
      },
    })

    // The site signs in with its own forms over SRP, so the hosted-UI OAuth
    // flows SST enables by default are switched off.
    const userPoolClient = userPool.addClient('WebClient', {
      transform: {
        client: (args) => {
          args.explicitAuthFlows = [
            'ALLOW_USER_SRP_AUTH',
            'ALLOW_REFRESH_TOKEN_AUTH',
          ]
          args.allowedOauthFlows = []
          args.allowedOauthFlowsUserPoolClient = false
          args.allowedOauthScopes = []
          args.callbackUrls = []
          args.preventUserExistenceErrors = 'ENABLED'
          args.enableTokenRevocation = true
          args.accessTokenValidity = 60
          args.idTokenValidity = 60
          args.refreshTokenValidity = 30
          args.tokenValidityUnits = {
            accessToken: 'minutes',
            idToken: 'minutes',
            refreshToken: 'days',
          }
        },
      },
    })

    new sst.aws.Nuxt('Site', {
      // DNS lives at Namecheap, so SST doesn't create records (dns: false).
      // The certificate was validated there by hand. www is served by the
      // same distribution and the app redirects it (server/middleware):
      // SST's `redirects` would add a second distribution, outside the
      // flat-rate plan.
      domain: isProduction
        ? {
            name: 'thisplayshelf.com',
            aliases: ['www.thisplayshelf.com'],
            dns: false,
            cert: 'arn:aws:acm:us-east-1:787391403512:certificate/fafff0b1-9eef-45a4-bc73-16fca71c90ff',
          }
        : undefined,
      link: [
        twitchClientId,
        twitchClientSecret,
        databaseUrl,
        userPool,
        userPoolClient,
      ],
      environment: {
        NUXT_PUBLIC_COGNITO_USER_POOL_ID: userPool.id,
        NUXT_PUBLIC_COGNITO_CLIENT_ID: userPoolClient.id,
        // Canonical links and link previews name the real domain.
        ...(isProduction && {
          NUXT_PUBLIC_SITE_URL: 'https://thisplayshelf.com',
        }),
      },
      server: {
        runtime: 'nodejs24.x',
        architecture: 'arm64',
        // More memory also means more CPU, which speeds up cold starts.
        memory: '1024 MB',
      },
      transform: {
        server: (args) => {
          args.logging = { retention: '1 week' }
          if (isProduction) {
            args.concurrency = { reserved: 5 }
          }
        },
      },
    })

    if (isProduction) {
      const budgetEmail = new sst.Secret('BudgetAlertEmail')

      // Budgets are account-wide, so only the production stage owns one.
      new aws.budgets.Budget('MonthlyBudget', {
        budgetType: 'COST',
        limitAmount: '5',
        limitUnit: 'USD',
        timeUnit: 'MONTHLY',
        notifications: [
          {
            comparisonOperator: 'GREATER_THAN',
            threshold: 1,
            thresholdType: 'ABSOLUTE_VALUE',
            notificationType: 'ACTUAL',
            subscriberEmailAddresses: [budgetEmail.value],
          },
          {
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
            notificationType: 'FORECASTED',
            subscriberEmailAddresses: [budgetEmail.value],
          },
        ],
      })
    }
  },
})
