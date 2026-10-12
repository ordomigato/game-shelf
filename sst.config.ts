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

    // The sign-up and reset-password code email (Cognito sends both from
    // one template). HTML is free with Cognito's own sender.
    const { readFileSync } = await import('node:fs')
    const codeEmail = readFileSync('infra/emails/code.html', 'utf8')

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
          args.verificationMessageTemplate = {
            defaultEmailOption: 'CONFIRM_WITH_CODE',
            emailSubject: 'Your ThisPlayShelf code',
            emailMessage: codeEmail,
          }
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

    const site = new sst.aws.Nuxt('Site', {
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
        // The release tag (v1.2.1) when GitHub Actions deploys a release;
        // "dev" for everything else. Shown in the footer.
        NUXT_PUBLIC_APP_VERSION:
          process.env.GITHUB_REF_TYPE === 'tag'
            ? (process.env.GITHUB_REF_NAME ?? 'dev')
            : 'dev',
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

      // Kill switch: rather go offline than pay. Traffic alarms trip a small
      // function that stops the server (no capacity left) and disables the
      // CloudFront distribution. Normal traffic is around 10 requests an
      // hour; the daily limits keep a month inside the free allowance and
      // the hourly ones catch a flood within minutes. Re-running the latest
      // deploy brings the site back.
      const distribution = site.nodes.cdn!.nodes.distribution
      const server = site.nodes.server!
      const killSwitch = new sst.aws.Function('KillSwitch', {
        handler: 'infra/kill-switch.handler',
        runtime: 'nodejs24.x',
        architecture: 'arm64',
        memory: '128 MB',
        timeout: '30 seconds',
        environment: {
          DISTRIBUTION_ID: distribution.id,
          SERVER_FUNCTION: server.name,
        },
        permissions: [
          {
            actions: [
              'cloudfront:GetDistributionConfig',
              'cloudfront:UpdateDistribution',
            ],
            resources: [distribution.arn],
          },
          {
            actions: ['lambda:PutFunctionConcurrency'],
            resources: [server.arn],
          },
        ],
        logging: { retention: '1 month' },
      })
      const trafficAlarms = new sst.aws.SnsTopic('TrafficAlarms')
      // Wired by hand rather than with trafficAlarms.subscribe(), so a
      // preview (sst diff) shows the subscription before it's deployed.
      new aws.lambda.Permission('KillSwitchInvoke', {
        action: 'lambda:InvokeFunction',
        function: killSwitch.name,
        principal: 'sns.amazonaws.com',
        sourceArn: trafficAlarms.arn,
      })
      new aws.sns.TopicSubscription('KillSwitchTrigger', {
        topic: trafficAlarms.arn,
        protocol: 'lambda',
        endpoint: killSwitch.arn,
      })
      // Also email, so the outage isn't a mystery. The address has to
      // confirm the subscription once (AWS sends a link).
      new aws.sns.TopicSubscription('TrafficAlarmEmail', {
        topic: trafficAlarms.arn,
        protocol: 'email',
        endpoint: budgetEmail.value,
      })

      const limits = [
        {
          name: 'RequestsHour',
          namespace: 'AWS/CloudFront',
          metric: 'Requests',
          period: 3600,
          threshold: 50_000,
        },
        {
          name: 'RequestsDay',
          namespace: 'AWS/CloudFront',
          metric: 'Requests',
          period: 86_400,
          threshold: 300_000,
        },
        {
          name: 'DownloadDay',
          namespace: 'AWS/CloudFront',
          metric: 'BytesDownloaded',
          period: 86_400,
          threshold: 20e9,
        },
        {
          name: 'ServerHour',
          namespace: 'AWS/Lambda',
          metric: 'Invocations',
          period: 3600,
          threshold: 20_000,
        },
        {
          name: 'ServerDay',
          namespace: 'AWS/Lambda',
          metric: 'Invocations',
          period: 86_400,
          threshold: 30_000,
        },
      ]
      for (const limit of limits) {
        new aws.cloudwatch.MetricAlarm(`TrafficAlarm${limit.name}`, {
          alarmDescription: `Kill switch: ${limit.metric} over ${limit.threshold} in ${limit.period / 3600} h`,
          namespace: limit.namespace,
          metricName: limit.metric,
          dimensions:
            limit.namespace === 'AWS/CloudFront'
              ? { DistributionId: distribution.id, Region: 'Global' }
              : { FunctionName: server.name },
          statistic: 'Sum',
          period: limit.period,
          evaluationPeriods: 1,
          threshold: limit.threshold,
          comparisonOperator: 'GreaterThanThreshold',
          treatMissingData: 'notBreaching',
          alarmActions: [trafficAlarms.arn],
        })
      }

      // Alerts: emails only, nothing switches off. The error alarm reads the
      // server's request log; the daily check measures the database,
      // accounts, traffic and the home page (infra/health-check.ts).
      const alerts = new sst.aws.SnsTopic('Alerts')
      new aws.sns.TopicSubscription('AlertsEmail', {
        topic: alerts.arn,
        protocol: 'email',
        endpoint: budgetEmail.value,
      })

      const serverLogs = server.nodes.logGroup.apply((group) => group!.name)
      new aws.cloudwatch.LogMetricFilter('ServerErrors', {
        logGroupName: serverLogs,
        pattern:
          '{ ($.event = "server.error") || ($.event = "http.request" && $.status >= 500) }',
        metricTransformation: {
          name: 'ServerErrors',
          namespace: 'ThisPlayShelf',
          value: '1',
        },
      })
      new aws.cloudwatch.MetricAlarm('ServerErrorsAlarm', {
        alarmDescription:
          'Five or more server errors in 15 minutes. Check the request log.',
        namespace: 'ThisPlayShelf',
        metricName: 'ServerErrors',
        statistic: 'Sum',
        period: 900,
        evaluationPeriods: 1,
        threshold: 5,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        treatMissingData: 'notBreaching',
        alarmActions: [alerts.arn],
      })

      new sst.aws.Cron('HealthCheck', {
        // 14:00 UTC: mid-morning in North America.
        schedule: 'cron(0 14 * * ? *)',
        job: {
          handler: 'infra/health-check.handler',
          runtime: 'nodejs24.x',
          architecture: 'arm64',
          memory: '256 MB',
          timeout: '30 seconds',
          logging: { retention: '1 month' },
          link: [databaseUrl, userPool],
          environment: {
            ALERT_TOPIC_ARN: alerts.arn,
            DISTRIBUTION_ID: distribution.id,
            SITE_URL: 'https://thisplayshelf.com/',
          },
          permissions: [
            { actions: ['sns:Publish'], resources: [alerts.arn] },
            {
              actions: ['cloudwatch:GetMetricStatistics'],
              resources: ['*'],
            },
          ],
        },
      })

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
