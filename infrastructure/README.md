# Infrastructure

AWS CDK infrastructure-as-code for the AI Interview Coach.

## Resources

- **Amazon API Gateway** — REST API with Clerk JWT token authorizer on all protected routes
- **AWS Lambda Functions** (Node.js 20.x, ARM64):
  - ProfileManagement — CRUD for user profiles
  - SessionManagement — Create/manage interview sessions
  - QuestionGeneration — Generate questions via Amazon Bedrock
  - ResponseEvaluation — Evaluate responses via Amazon Bedrock
  - SessionHistory — Retrieve past sessions and feedback
  - ConfidenceQuestionnaire — Pre/post confidence scoring
  - ProgressAnalytics — Aggregate scores and trends
  - ClerkJwtAuthorizer — Validates Clerk JWT tokens
- **AWS WAF WebACL** — SQL injection (AWSManagedRulesSQLiRuleSet), XSS (AWSManagedRulesCommonRuleSet), rate limiting (100 req/5 min per IP)
- **Amazon S3 Bucket** — Frontend static hosting

## API Routes

| Method | Path | Lambda |
|--------|------|--------|
| POST/GET/PUT | /api/profile | ProfileManagement |
| POST | /api/sessions | SessionManagement |
| GET | /api/sessions | SessionHistory |
| GET | /api/sessions/:id | SessionManagement |
| POST | /api/sessions/:id/questions | QuestionGeneration |
| POST | /api/sessions/:id/evaluate | ResponseEvaluation |
| POST | /api/sessions/:id/confidence | ConfidenceQuestionnaire |
| GET | /api/analytics/progress | ProgressAnalytics |

## Environment Variables

All Lambda functions receive:
- `BEDROCK_MODEL_ID` — Amazon Bedrock model identifier
- `DB_CONNECTION_STRING` — PostgreSQL connection string
- `PROMPT_TEMPLATE_VERSION` — Active prompt template version

The authorizer Lambda additionally receives:
- `CLERK_JWKS_URL` — Clerk JWKS endpoint for JWT validation

## Setup

```bash
cd infrastructure
npm install
npx cdk synth          # Synthesize CloudFormation template
npx cdk diff           # Preview changes
npx cdk deploy         # Deploy to AWS
```

## Parameters

The stack accepts the following CloudFormation parameters:

| Parameter | Description | Default |
|-----------|-------------|---------|
| BedrockModelId | Bedrock model ID | anthropic.claude-3-sonnet-20240229-v1:0 |
| DbConnectionString | PostgreSQL connection string | (required) |
| PromptTemplateVersion | Prompt template version | v1.0.0 |
| ClerkJwksUrl | Clerk JWKS URL | (required) |
