# Implementation Plan: AI Interview Coach

## Overview

This implementation plan converts the AI Interview Coach design into incremental coding tasks. The system uses a React frontend (TypeScript, hosted on S3), AWS Lambda backend (Node.js/TypeScript), Amazon Bedrock for AI operations, PostgreSQL for persistence, Clerk for authentication, and AWS WAF for security. Tasks are ordered to build foundational infrastructure first, then core features, then analytics and polish.

## Tasks

- [x] 1. Project scaffolding and infrastructure setup
  - [x] 1.1 Initialize monorepo structure with frontend and backend packages
    - Create directory structure: `frontend/` (React app), `backend/` (Lambda functions), `shared/` (types/interfaces), `infrastructure/` (IaC), `tests/`
    - Initialize package.json with TypeScript, ESLint, and shared dependencies
    - Configure TypeScript with strict mode and path aliases
    - Set up Vitest as the test runner with fast-check integration
    - _Requirements: N/A (scaffolding)_

  - [x] 1.2 Define shared TypeScript interfaces and types
    - Create `shared/types/profile.ts` (UserProfile, ProfileRequest, ProfileResponse)
    - Create `shared/types/session.ts` (Session, SessionStatus enum, SessionContext)
    - Create `shared/types/question.ts` (Question, QuestionType enum, Difficulty enum)
    - Create `shared/types/evaluation.ts` (EvaluationScores, EvaluationFeedback, EvaluationResponse)
    - Create `shared/types/confidence.ts` (ConfidenceQuestionnaire, ConfidenceType enum)
    - Create `shared/types/errors.ts` (ErrorResponse, ErrorCode enum)
    - _Requirements: 6.3, 6.4, 10.1, 10.2_

  - [x] 1.3 Set up infrastructure-as-code for AWS resources
    - Create CDK or SAM template for: API Gateway, Lambda functions, WAF WebACL, S3 bucket
    - Configure API Gateway with Clerk JWT authorizer
    - Define WAF rules for SQL injection, XSS, and rate limiting
    - Configure Lambda environment variables for Bedrock model ID, DB connection, prompt template version
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 2. Database schema and migrations
  - [x] 2.1 Create PostgreSQL migration scripts for all entities
    - Create `users` table with clerk_user_id (unique), email, target_role, skills (text[]), years_experience, timestamps
    - Create `sessions` table with user_id FK, company, domain, status enum, overall_score, prompt_template_version, timestamps
    - Create `questions` table with session_id FK, question_index, question_type enum, question_text, difficulty enum, generated_at
    - Create `responses` table with question_id FK (unique), response_text, input_method, submitted_at
    - Create `evaluations` table with response_id FK (unique), four dimension scores with CHECK(1-5), overall_score, feedback JSONB, prompt_template_version, evaluated_at
    - Create `confidence_questionnaires` table with session_id FK, type enum, responses JSONB, average_score, submitted_at
    - Create `prompt_templates` table with name, version, template_text, purpose, temperature CHECK(0.0-1.0), created_at
    - Add indexes on user_id, session_id, clerk_user_id
    - _Requirements: 2.1, 6.2, 8.1, 10.4, 13.1, 13.2_

  - [x] 2.2 Implement database connection utility with retry logic
    - Create `backend/src/utils/db.ts` with connection pooling (pg library)
    - Implement retry with exponential backoff (3 attempts: 1s, 2s, 4s)
    - Add connection timeout configuration (5s per attempt for writes, 3s for reads)
    - _Requirements: 8.1_

- [x] 3. Authentication integration
  - [x] 3.1 Configure Clerk authentication in the React frontend
    - Install `@clerk/clerk-react` and configure ClerkProvider in app root
    - Create `AuthProvider` component wrapping the application
    - Implement sign-up, sign-in, and sign-out flows using Clerk components
    - Add route guards for authenticated pages
    - Attach JWT tokens to all API requests via Clerk's `useAuth` hook
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.2 Implement API Gateway JWT authorizer for Clerk tokens
    - Create Lambda authorizer function that validates Clerk JWTs
    - Extract clerk_user_id from token claims for downstream Lambda context
    - Return 401 for invalid/expired tokens
    - Configure API Gateway to use this authorizer on all protected routes
    - _Requirements: 1.5_

- [x] 4. Profile management
  - [x] 4.1 Implement Profile Management Lambda function
    - Create `backend/src/handlers/profile.ts` with POST, GET, PUT handlers
    - POST: Create new user profile linked to clerk_user_id from JWT
    - GET: Retrieve profile by clerk_user_id
    - PUT: Update profile fields (target_role, skills, years_experience)
    - Validate target_role is non-empty and non-whitespace
    - Return appropriate error responses for validation failures
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 4.2 Write property test for profile data round-trip
    - **Property 1: Profile data round-trip**
    - Generate arbitrary valid profiles (non-empty target role, string[] skills, integer experience ≥ 0)
    - Assert: store then retrieve produces object equal to original
    - **Validates: Requirements 2.1, 2.2**

  - [x] 4.3 Write property test for target role validation
    - **Property 2: Target role validation rejects empty/whitespace input**
    - Generate empty strings and whitespace-only strings; assert rejection
    - Generate strings with at least one non-whitespace character; assert acceptance
    - **Validates: Requirements 2.4**

  - [x] 4.4 Implement ProfileForm React component
    - Create `frontend/src/components/ProfileForm.tsx`
    - Form fields: target role (text, required), skills (tag input), years of experience (number)
    - Client-side validation: non-empty target role before submission
    - Submit to POST/PUT `/api/profile` endpoint
    - Display success/error feedback
    - _Requirements: 2.1, 2.3, 2.4_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Company/role selection and session management
  - [x] 6.1 Implement Session Management Lambda function
    - Create `backend/src/handlers/session.ts`
    - POST `/api/sessions`: Create new session with company, domain, user_id, status='in_progress', prompt_template_version
    - GET `/api/sessions/:id`: Retrieve session by ID with authorization check
    - PATCH `/api/sessions/:id`: Update session status (complete/abandon)
    - Associate company and domain context with all subsequent requests in the session
    - _Requirements: 3.2, 3.3, 8.1_

  - [x] 6.2 Implement CompanySelector React component
    - Create `frontend/src/components/CompanySelector.tsx`
    - Display list of available companies and domains
    - Store selection in session context state
    - Trigger session creation on confirmation
    - _Requirements: 3.1, 3.2_

- [x] 7. Prompt engineering and question generation
  - [x] 7.1 Create prompt template store and builder utility
    - Create `backend/src/prompts/templates.ts` with versioned prompt templates
    - Implement `buildQuestionPrompt(context: SessionContext): string` function
    - Include: user target_role, skills, years_experience, company, domain, question_type, few-shot examples
    - Implement `buildEvaluationPrompt(question: string, response: string): string` function
    - Include: complete rubric with level definitions (1-5 for each dimension), JSON output format instructions
    - Store temperature settings per template type (generation: 0.7, evaluation: 0.2)
    - _Requirements: 4.3, 6.5, 6.6, 13.1, 13.3, 13.4_

  - [x] 7.2 Write property test for prompt construction completeness
    - **Property 3: Prompt construction includes all required components**
    - Generate arbitrary valid session contexts (profile, company, domain, question type, few-shot examples)
    - Assert: built prompt contains target_role, skills, experience, company, domain, at least one few-shot example, all four dimension names, rubric level definitions, JSON format instructions
    - **Validates: Requirements 3.3, 4.3, 6.1, 6.5, 13.3, 13.4**

  - [x] 7.3 Implement Question Generation Lambda function
    - Create `backend/src/handlers/question.ts`
    - POST `/api/sessions/:id/questions`: Generate question via Bedrock
    - Build prompt using prompt template builder with session context
    - Call Amazon Bedrock with appropriate model and temperature
    - Parse response and store question in database
    - Implement retry logic (2 retries, 1s delay, 10s timeout per attempt)
    - Return error message on failure after retries exhausted
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 8. Response input and evaluation
  - [x] 8.1 Implement TextInput and VoiceInput React components
    - Create `frontend/src/components/TextInput.tsx` with textarea for typed responses
    - Create `frontend/src/components/VoiceInput.tsx` using Web Speech API
    - Detect Web Speech API support on mount; disable voice if unsupported with info message
    - Display transcribed text for review before submission
    - Submit response text to evaluation endpoint
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 8.2 Implement Response Evaluation Lambda function
    - Create `backend/src/handlers/evaluation.ts`
    - POST `/api/sessions/:id/evaluate`: Evaluate user response via Bedrock
    - Store user response in `responses` table with input_method
    - Build evaluation prompt with rubric, question, and user response
    - Call Bedrock with low temperature (0.1-0.3)
    - Parse JSON response into EvaluationScores and EvaluationFeedback
    - Calculate overall_score as arithmetic mean of 4 dimension scores
    - Store evaluation in database with prompt_template_version
    - Implement retry logic for invalid JSON responses (up to 2 additional times, 3 total)
    - Log prompt_template_version used
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 13.2, 13.4_

  - [x] 8.3 Write property test for evaluation response parsing
    - **Property 4: Evaluation response parsing and validation**
    - Generate valid evaluation JSON with 4 scores in [1,5] and feedback strings; assert valid parse
    - Generate invalid JSON (scores outside [1,5] or missing feedback); assert validation error
    - **Validates: Requirements 6.2, 6.3, 11.1**

  - [x] 8.4 Write property test for overall score calculation
    - **Property 5: Overall score is arithmetic mean of dimension scores**
    - Generate 4 integer scores each in [1,5]
    - Assert: overall_score equals (sum of scores) / 4 with precision to 2 decimal places
    - **Validates: Requirements 6.4**

  - [x] 8.5 Write property test for retry logic
    - **Property 6: Retry logic exhausts attempts on invalid responses**
    - Generate sequences of valid/invalid AI responses
    - Assert: returns first valid response within 3 attempts, makes exactly N calls, fails on all-invalid
    - **Validates: Requirements 6.7**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Radar chart visualization
  - [x] 10.1 Implement RadarChart React component
    - Create `frontend/src/components/RadarChart.tsx` using a charting library (e.g., recharts or chart.js)
    - Accept evaluation scores as props
    - Render 4-axis radar chart with dimension labels and score values
    - Support overlay mode for comparing multiple sessions
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 10.2 Write property test for radar chart data transformation
    - **Property 7: Radar chart data contains all dimension labels and values**
    - Generate valid evaluations with 4 dimension scores
    - Assert: transformation produces exactly 4 data points with correct labels and values
    - **Validates: Requirements 7.2**

  - [x] 10.3 Implement EvaluationDisplay component
    - Create `frontend/src/components/EvaluationDisplay.tsx`
    - Display per-question dimension scores with textual feedback
    - Group feedback by question with scores and improvement suggestions clearly separated
    - Integrate RadarChart for visual summary
    - _Requirements: 7.1, 11.4_

- [x] 11. Structured feedback and improvement suggestions
  - [x] 11.1 Implement feedback generation logic in evaluation handler
    - Ensure AI prompt mandates at least one improvement suggestion per dimension scoring ≤ 3
    - Parse and validate that low-scoring dimensions have non-empty suggestions
    - Generate session summary with aggregated feedback and top 3 improvement areas (lowest average scores)
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 11.2 Write property test for low-score improvement suggestions
    - **Property 11: Low scores require improvement suggestions**
    - Generate evaluations with dimensions scoring ≤ 3
    - Assert: feedback for those dimensions contains at least one non-empty suggestion
    - **Validates: Requirements 11.2**

  - [x] 11.3 Write property test for top 3 improvement areas
    - **Property 12: Top 3 improvement areas are lowest-scoring dimensions**
    - Generate collections of per-question evaluations
    - Assert: top 3 areas correspond to 3 dimensions with lowest average scores
    - **Validates: Requirements 11.3**

- [x] 12. Session history and progress tracking
  - [x] 12.1 Implement Session History Lambda function
    - Create `backend/src/handlers/history.ts`
    - GET `/api/sessions`: Return chronologically ordered list (most recent first) with summary scores
    - GET `/api/sessions/:id/detail`: Return full session detail with per-question feedback
    - Include date, company, domain, overall_score in list responses
    - _Requirements: 8.1, 8.2_

  - [x] 12.2 Write property test for session record persistence
    - **Property 8: Session record persistence round-trip**
    - Generate valid completed sessions with questions, responses, scores, timestamps
    - Assert: store then retrieve produces equal record
    - **Validates: Requirements 8.1**

  - [x] 12.3 Write property test for session history ordering
    - **Property 9: Session history returns chronologically ordered results**
    - Generate sets of sessions with distinct timestamps
    - Assert: returned list ordered by completion date (most recent first), valid total order
    - **Validates: Requirements 8.2**

  - [x] 12.4 Implement SessionHistory React component
    - Create `frontend/src/components/SessionHistory.tsx`
    - Display session list with date, company, domain, overall_score
    - Enable drill-down to detailed per-question feedback
    - _Requirements: 8.3, 8.4_

- [x] 13. Confidence questionnaires
  - [x] 13.1 Implement Confidence Questionnaire Lambda function
    - Create `backend/src/handlers/confidence.ts`
    - POST `/api/sessions/:id/confidence`: Store pre/post questionnaire responses
    - Validate: type is 'pre' or 'post', responses array has 4 items, each score 1-5
    - Calculate average_score for the questionnaire
    - Calculate confidence improvement (post average - pre average) when both exist
    - Store linked to session in database
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 13.2 Write property test for confidence improvement calculation
    - **Property 10: Confidence improvement equals post minus pre average**
    - Generate pre-session and post-session arrays of 4 scores each in [1,5]
    - Assert: improvement equals (average of post) - (average of pre)
    - **Validates: Requirements 10.3**

  - [x] 13.3 Implement ConfidenceQuestionnaire React component
    - Create `frontend/src/components/ConfidenceQuestionnaire.tsx`
    - Present 4 Likert scale statements
    - Submit to confidence endpoint with type ('pre'/'post')
    - Display at session start (pre) and session completion (post)
    - _Requirements: 10.1, 10.2_

- [x] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Performance comparison and analytics
  - [x] 15.1 Implement Progress Analytics Lambda function
    - Create `backend/src/handlers/analytics.ts`
    - GET `/api/analytics/progress`: Aggregate scores across sessions, compute trends
    - Calculate per-dimension score trends across sessions
    - Implement session comparison: compute per-dimension differences between two sessions
    - Return confidence improvement scores alongside performance metrics
    - _Requirements: 9.1, 9.2, 9.3, 10.5_

  - [x] 15.2 Write property test for session comparison
    - **Property 13: Session comparison produces correct per-dimension differences**
    - Generate two evaluation score sets (4 dimensions each in [1,5])
    - Assert: each dimension difference equals (session2 score - session1 score)
    - **Validates: Requirements 9.3**

  - [x] 15.3 Write property test for per-dimension trend calculation
    - **Property 14: Per-dimension trend calculation correctness**
    - Generate ordered sequence of 2+ sessions with dimension scores
    - Assert: positive deltas identified as improvement, negative as decline, values equal consecutive differences
    - **Validates: Requirements 9.2**

  - [x] 15.4 Implement ProgressDashboard React component
    - Create `frontend/src/components/ProgressDashboard.tsx`
    - Display overall_score trend over time (line chart)
    - Display per-dimension score trends
    - Show radar chart overlays for session comparison
    - Display confidence improvement score
    - Enable side-by-side comparison of two selected sessions
    - _Requirements: 9.1, 9.2, 9.3, 10.5_

- [x] 16. Security and WAF configuration
  - [x] 16.1 Implement AWS WAF rules and API Gateway integration
    - Configure WAF WebACL with SQL injection rule set (AWSManagedRulesSQLiRuleSet)
    - Configure WAF WebACL with XSS rule set (AWSManagedRulesCommonRuleSet)
    - Configure rate limiting rule (e.g., 100 requests per 5 minutes per IP for AI endpoints)
    - Associate WAF WebACL with API Gateway stage
    - Return 403 Forbidden for blocked requests
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 17. Integration wiring and InterviewSession component
  - [x] 17.1 Implement InterviewSession orchestration component
    - Create `frontend/src/components/InterviewSession.tsx`
    - Orchestrate full session flow: company selection → pre-confidence questionnaire → question generation → response input → evaluation → post-confidence questionnaire
    - Wire together CompanySelector, ConfidenceQuestionnaire, TextInput, VoiceInput, EvaluationDisplay, RadarChart
    - Handle session state transitions (in_progress → completed/abandoned)
    - Display loading states during AI generation and evaluation
    - Handle errors with retry options
    - _Requirements: 3.1, 3.2, 4.1, 5.1, 5.2, 6.1, 7.1, 10.1, 10.2_

  - [x] 17.2 Wire frontend routing and navigation
    - Set up React Router with routes: /login, /profile, /session/new, /session/:id, /history, /progress
    - Integrate route guards for authenticated routes
    - Add navigation bar with links to key sections
    - _Requirements: 1.1, 1.2, 1.4_

- [x] 18. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation language is TypeScript throughout (React frontend + Node.js Lambda backend)
- fast-check is used for all property-based tests; Vitest for the test runner
- All Lambda functions use the shared types from `shared/types/`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "3.2"] },
    { "id": 3, "tasks": ["4.1", "6.1", "6.2"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "8.1"] },
    { "id": 6, "tasks": ["8.2", "13.1"] },
    { "id": 7, "tasks": ["8.3", "8.4", "8.5", "10.1", "11.1", "13.2", "13.3"] },
    { "id": 8, "tasks": ["10.2", "10.3", "11.2", "11.3", "12.1"] },
    { "id": 9, "tasks": ["12.2", "12.3", "12.4", "15.1"] },
    { "id": 10, "tasks": ["15.2", "15.3", "15.4", "16.1"] },
    { "id": 11, "tasks": ["17.1", "17.2"] }
  ]
}
```
