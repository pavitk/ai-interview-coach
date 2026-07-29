import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class AiInterviewCoachStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly webAcl: wafv2.CfnWebACL;
  public readonly frontendBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── Environment Configuration ────────────────────────────────────────────
    const bedrockModelId = new cdk.CfnParameter(this, 'BedrockModelId', {
      type: 'String',
      default: 'anthropic.claude-3-sonnet-20240229-v1:0',
      description: 'Amazon Bedrock model ID for question generation and evaluation',
    });

    const dbConnectionString = new cdk.CfnParameter(this, 'DbConnectionString', {
      type: 'String',
      noEcho: true,
      description: 'PostgreSQL database connection string',
    });

    const promptTemplateVersion = new cdk.CfnParameter(this, 'PromptTemplateVersion', {
      type: 'String',
      default: 'v1.0.0',
      description: 'Version identifier for the active prompt templates',
    });

    const clerkJwksUrl = new cdk.CfnParameter(this, 'ClerkJwksUrl', {
      type: 'String',
      description: 'Clerk JWKS endpoint URL for JWT validation',
    });

    // ─── S3 Bucket for Frontend Static Hosting ────────────────────────────────
    this.frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: cdk.Fn.sub('ai-interview-coach-frontend-${AWS::AccountId}'),
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'],
          maxAge: 3600,
        },
      ],
    });

    // ─── Lambda Execution Role ────────────────────────────────────────────────
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant Bedrock invoke access
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      })
    );

    // ─── Shared Lambda Environment Variables ──────────────────────────────────
    const sharedEnvironment: Record<string, string> = {
      BEDROCK_MODEL_ID: bedrockModelId.valueAsString,
      DB_CONNECTION_STRING: dbConnectionString.valueAsString,
      PROMPT_TEMPLATE_VERSION: promptTemplateVersion.valueAsString,
      NODE_OPTIONS: '--enable-source-maps',
    };

    // ─── Lambda Functions ─────────────────────────────────────────────────────
    const lambdaDefaults = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      role: lambdaRole,
      environment: sharedEnvironment,
    } as const;

    const profileManagement = new lambda.Function(this, 'ProfileManagement', {
      ...lambdaDefaults,
      functionName: 'ai-coach-profile-management',
      handler: 'handlers/profile.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      description: 'CRUD operations for user profile data',
    });

    const sessionManagement = new lambda.Function(this, 'SessionManagement', {
      ...lambdaDefaults,
      functionName: 'ai-coach-session-management',
      handler: 'handlers/session.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      description: 'Create and manage interview sessions',
    });

    const questionGeneration = new lambda.Function(this, 'QuestionGeneration', {
      ...lambdaDefaults,
      functionName: 'ai-coach-question-generation',
      handler: 'handlers/question.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      description: 'Generate interview questions via Amazon Bedrock',
    });

    const responseEvaluation = new lambda.Function(this, 'ResponseEvaluation', {
      ...lambdaDefaults,
      functionName: 'ai-coach-response-evaluation',
      handler: 'handlers/evaluation.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      description: 'Evaluate interview responses via Amazon Bedrock',
    });

    const sessionHistory = new lambda.Function(this, 'SessionHistory', {
      ...lambdaDefaults,
      functionName: 'ai-coach-session-history',
      handler: 'handlers/history.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      description: 'Retrieve session history and detailed feedback',
    });

    const confidenceQuestionnaire = new lambda.Function(this, 'ConfidenceQuestionnaire', {
      ...lambdaDefaults,
      functionName: 'ai-coach-confidence-questionnaire',
      handler: 'handlers/confidence.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      description: 'Store and compute confidence questionnaire results',
    });

    const progressAnalytics = new lambda.Function(this, 'ProgressAnalytics', {
      ...lambdaDefaults,
      functionName: 'ai-coach-progress-analytics',
      handler: 'handlers/analytics.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      description: 'Aggregate scores and compute performance trends',
    });

    // ─── Clerk JWT Authorizer Lambda ──────────────────────────────────────────
    const clerkAuthorizer = new lambda.Function(this, 'ClerkJwtAuthorizer', {
      ...lambdaDefaults,
      functionName: 'ai-coach-clerk-jwt-authorizer',
      handler: 'handlers/authorizer.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      description: 'Validates Clerk JWT tokens for API Gateway authorization',
      environment: {
        ...sharedEnvironment,
        CLERK_JWKS_URL: clerkJwksUrl.valueAsString,
      },
    });

    // ─── API Gateway ──────────────────────────────────────────────────────────
    this.api = new apigateway.RestApi(this, 'AiInterviewCoachApi', {
      restApiName: 'AI Interview Coach API',
      description: 'API Gateway for AI Interview Coach backend services',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
    });

    // Token-based authorizer using Clerk JWT validation Lambda
    const tokenAuthorizer = new apigateway.TokenAuthorizer(this, 'ClerkTokenAuthorizer', {
      handler: clerkAuthorizer,
      identitySource: 'method.request.header.Authorization',
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // ─── API Routes ───────────────────────────────────────────────────────────
    const apiRoot = this.api.root.addResource('api');

    // /api/profile
    const profileResource = apiRoot.addResource('profile');
    profileResource.addMethod('POST', new apigateway.LambdaIntegration(profileManagement), {
      authorizer: tokenAuthorizer,
    });
    profileResource.addMethod('GET', new apigateway.LambdaIntegration(profileManagement), {
      authorizer: tokenAuthorizer,
    });
    profileResource.addMethod('PUT', new apigateway.LambdaIntegration(profileManagement), {
      authorizer: tokenAuthorizer,
    });

    // /api/sessions
    const sessionsResource = apiRoot.addResource('sessions');
    sessionsResource.addMethod('POST', new apigateway.LambdaIntegration(sessionManagement), {
      authorizer: tokenAuthorizer,
    });
    sessionsResource.addMethod('GET', new apigateway.LambdaIntegration(sessionHistory), {
      authorizer: tokenAuthorizer,
    });

    // /api/sessions/:id
    const sessionByIdResource = sessionsResource.addResource('{sessionId}');
    sessionByIdResource.addMethod('GET', new apigateway.LambdaIntegration(sessionManagement), {
      authorizer: tokenAuthorizer,
    });

    // /api/sessions/:id/questions
    const questionsResource = sessionByIdResource.addResource('questions');
    questionsResource.addMethod('POST', new apigateway.LambdaIntegration(questionGeneration), {
      authorizer: tokenAuthorizer,
    });

    // /api/sessions/:id/evaluate
    const evaluateResource = sessionByIdResource.addResource('evaluate');
    evaluateResource.addMethod('POST', new apigateway.LambdaIntegration(responseEvaluation), {
      authorizer: tokenAuthorizer,
    });

    // /api/sessions/:id/confidence
    const confidenceResource = sessionByIdResource.addResource('confidence');
    confidenceResource.addMethod('POST', new apigateway.LambdaIntegration(confidenceQuestionnaire), {
      authorizer: tokenAuthorizer,
    });

    // /api/analytics/progress
    const analyticsResource = apiRoot.addResource('analytics');
    const progressResource = analyticsResource.addResource('progress');
    progressResource.addMethod('GET', new apigateway.LambdaIntegration(progressAnalytics), {
      authorizer: tokenAuthorizer,
    });

    // ─── WAF WebACL ───────────────────────────────────────────────────────────
    this.webAcl = new wafv2.CfnWebACL(this, 'ApiWafWebAcl', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'AiInterviewCoachWaf',
        sampledRequestsEnabled: true,
      },
      name: 'AiInterviewCoachWebAcl',
      rules: [
        // SQL Injection protection
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'SQLiRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        // XSS and common attack protection
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        // Rate limiting: 100 requests per 5 minutes per IP
        {
          name: 'RateLimitRule',
          priority: 3,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 100,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // Associate WAF WebACL with API Gateway stage
    const wafAssociation = new wafv2.CfnWebACLAssociation(this, 'WafApiGatewayAssociation', {
      resourceArn: this.api.deploymentStage.stageArn,
      webAclArn: this.webAcl.attrArn,
    });
    wafAssociation.addDependency(this.webAcl);

    // ─── Outputs ──────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.frontendBucket.bucketName,
      description: 'S3 bucket name for frontend static hosting',
    });

    new cdk.CfnOutput(this, 'WebAclArn', {
      value: this.webAcl.attrArn,
      description: 'WAF WebACL ARN',
    });
  }
}
