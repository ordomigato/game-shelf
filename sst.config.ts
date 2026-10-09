/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: 'game-shelf',
      removal: input.stage === 'production' ? 'retain' : 'remove',
      protect: input.stage === 'production',
      home: 'aws',
      providers: {
        aws: { region: 'us-east-1', profile: 'gameshelf' },
      },
    }
  },
  async run() {
    const isProduction = $app.stage === 'production'

    const twitchClientId = new sst.Secret('TwitchClientId')
    const twitchClientSecret = new sst.Secret('TwitchClientSecret')

    // One item per game in a user's library. `status` is "owned" or
    // "wishlist", so a game can never be in both.
    const library = new sst.aws.Dynamo('Library', {
      fields: {
        userId: 'string',
        gameId: 'number',
      },
      primaryIndex: { hashKey: 'userId', rangeKey: 'gameId' },
      deletionProtection: isProduction,
    })

    const userPool = new sst.aws.CognitoUserPool('Users', {
      usernames: ['email'],
    })
    const userPoolClient = userPool.addClient('WebClient')

    new sst.aws.Nuxt('Site', {
      link: [
        twitchClientId,
        twitchClientSecret,
        library,
        userPool,
        userPoolClient,
      ],
      environment: {
        NUXT_PUBLIC_COGNITO_USER_POOL_ID: userPool.id,
        NUXT_PUBLIC_COGNITO_CLIENT_ID: userPoolClient.id,
      },
      server: {
        runtime: 'nodejs24.x',
        architecture: 'arm64',
        memory: '512 MB',
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
