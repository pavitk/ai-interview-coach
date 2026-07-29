# Requirements Document

## Introduction

This document defines the requirements for an AI-powered Interview Learning Support System. The system generates company-specific interview questions and provides structured, multi-dimensional feedback using Amazon Bedrock LLMs, controlled prompt engineering, and rubric-based evaluation. The platform follows a serverless cloud-native architecture (React frontend on S3, API Gateway, Lambda, PostgreSQL) with Clerk authentication. Users practice mock interviews tailored to specific companies and roles, receive scored feedback across four dimensions visualized via radar charts, and track progress over time.

## Glossary

- **System**: The AI Interview Coach application as a whole
- **Frontend**: The React-based web application hosted on Amazon S3
- **Auth_Service**: Clerk Authentication service handling user identity, registration, login, and session management
- **API_Gateway**: Amazon API Gateway managing request routing between Frontend and backend Lambda functions
- **Backend**: AWS Lambda functions handling business logic, workflow orchestration, and data access
- **AI_Engine**: Amazon Bedrock LLM integration responsible for question generation and response evaluation
- **Database**: PostgreSQL relational database storing user data, sessions, and analytics
- **Evaluation_Rubric**: The structured scoring criteria defining 4 dimensions rated 1-5
- **Radar_Chart**: A multi-axis chart visualizing user performance across evaluation dimensions
- **Likert_Scale**: A 5-point agreement scale (1=strongly disagree to 5=strongly agree) used for confidence questionnaires
- **Session**: A single mock interview practice consisting of one or more questions and responses
- **User**: A registered individual using the system for interview preparation
- **Overall_Score**: The arithmetic mean of the four dimension scores: (Content_Relevance + Structure_Organization + Technical_Accuracy + Communication_Clarity) / 4

## Requirements

### Requirement 1: User Registration and Authentication

**User Story:** As a user, I want to register and log in securely, so that my interview data and progress are protected and persistent across sessions.

#### Acceptance Criteria

1. WHEN a new user submits a registration form with valid email and password, THE Auth_Service SHALL create a new user account and return an authentication token
2. WHEN a registered user submits valid login credentials, THE Auth_Service SHALL authenticate the user and establish a secure session
3. WHEN a user submits invalid login credentials, THE Auth_Service SHALL deny access and display an error message indicating invalid credentials
4. WHEN an authenticated user requests logout, THE Auth_Service SHALL terminate the session and invalidate the authentication token
5. IF an unauthenticated request reaches the API_Gateway, THEN THE API_Gateway SHALL reject the request with a 401 Unauthorized status

### Requirement 2: User Profile Management

**User Story:** As a user, I want to manage my profile with role, skills, and experience information, so that the system can generate personalized interview questions.

#### Acceptance Criteria

1. WHEN an authenticated user submits profile information including target role, skills list, and years of experience, THE Backend SHALL store the profile data in the Database
2. WHEN an authenticated user requests their profile, THE Backend SHALL retrieve and return the stored profile data
3. WHEN an authenticated user updates their profile fields, THE Backend SHALL persist the updated values in the Database
4. THE Frontend SHALL validate that the target role field is non-empty before submitting profile data to the Backend

### Requirement 3: Company and Role Selection

**User Story:** As a user, I want to select a target company and domain for my interview practice, so that the system generates questions aligned with that company's interview patterns.

#### Acceptance Criteria

1. WHEN an authenticated user requests the company selection interface, THE Frontend SHALL display a list of available companies and associated domains
2. WHEN a user selects a company and domain, THE Backend SHALL store the selection as the active interview context for that session
3. THE Backend SHALL associate the selected company and domain with all subsequent question generation requests within the same session

### Requirement 4: AI-Generated Interview Questions

**User Story:** As a user, I want to receive interview questions tailored to my selected company, role, and profile, so that I can practice with relevant scenarios.

#### Acceptance Criteria

1. WHEN a user initiates a mock interview session with a selected company, domain, and profile, THE AI_Engine SHALL generate interview questions tailored to the company interview patterns and user profile
2. THE AI_Engine SHALL generate both technical and behavioral question types within a single session
3. THE Backend SHALL include the user profile context, company-specific data, and few-shot examples in the prompt sent to the AI_Engine
4. WHEN the AI_Engine generates a question, THE Backend SHALL return the question text to the Frontend within 10 seconds
5. IF the AI_Engine fails to generate a question, THEN THE Backend SHALL return an error message to the Frontend indicating temporary unavailability

### Requirement 5: Text and Voice Response Input

**User Story:** As a user, I want to respond to interview questions via text or voice, so that I can practice in a way that simulates real interview conditions.

#### Acceptance Criteria

1. WHEN a user types a text response and submits it, THE Frontend SHALL send the response text to the Backend for evaluation
2. WHEN a user activates voice input mode, THE Frontend SHALL use the browser Web Speech API to capture and transcribe speech into text
3. WHEN voice transcription completes, THE Frontend SHALL display the transcribed text for user review before submission
4. IF the browser does not support the Web Speech API, THEN THE Frontend SHALL disable the voice input option and display a message indicating voice input is unavailable

### Requirement 6: AI-Based Response Evaluation

**User Story:** As a user, I want my interview responses evaluated across structured dimensions, so that I receive specific, actionable feedback.

#### Acceptance Criteria

1. WHEN a user submits a response to an interview question, THE AI_Engine SHALL evaluate the response across four dimensions: Content Relevance, Structure and Organization, Technical Accuracy, and Communication Clarity
2. THE AI_Engine SHALL assign a score from 1 to 5 for each evaluation dimension using the predefined Evaluation_Rubric
3. THE AI_Engine SHALL return a structured JSON output containing numerical scores and textual feedback for each dimension
4. THE Backend SHALL calculate the Overall_Score as the arithmetic mean of the four dimension scores
5. THE Backend SHALL include the Evaluation_Rubric definitions and scoring level descriptions in the evaluation prompt sent to the AI_Engine
6. THE Backend SHALL use a low temperature setting (0.1-0.3) for evaluation prompts to reduce scoring variability
7. IF the AI_Engine returns a response that does not conform to the expected JSON structure, THEN THE Backend SHALL retry the evaluation request up to 2 additional times

### Requirement 7: Radar Chart Performance Visualization

**User Story:** As a user, I want to see my performance displayed as a radar chart, so that I can quickly identify strengths and weaknesses across evaluation dimensions.

#### Acceptance Criteria

1. WHEN a session evaluation is complete, THE Frontend SHALL render a radar chart displaying the four dimension scores for that session
2. THE Frontend SHALL label each axis of the radar chart with the corresponding dimension name and score value
3. WHEN a user views session history, THE Frontend SHALL provide an option to overlay radar charts from multiple sessions for comparison

### Requirement 8: Session History and Progress Tracking

**User Story:** As a user, I want to view my past interview sessions and track performance over time, so that I can measure improvement.

#### Acceptance Criteria

1. WHEN a session completes, THE Backend SHALL store the session record including questions, responses, dimension scores, and Overall_Score in the Database
2. WHEN a user requests session history, THE Backend SHALL return a chronologically ordered list of past sessions with summary scores
3. THE Frontend SHALL display session history with date, company, domain, and Overall_Score for each session
4. WHEN a user selects a past session, THE Frontend SHALL display the detailed feedback including per-question scores and textual feedback

### Requirement 9: Performance Comparison Across Sessions

**User Story:** As a user, I want to compare my performance across multiple sessions, so that I can see trends and areas of consistent improvement or weakness.

#### Acceptance Criteria

1. WHEN a user has completed two or more sessions, THE Frontend SHALL display a progress trend showing Overall_Score over time
2. THE Frontend SHALL display per-dimension score trends across sessions to highlight areas of improvement or decline
3. WHEN a user selects two sessions for comparison, THE Frontend SHALL display the radar charts side-by-side with numerical differences for each dimension

### Requirement 10: Pre/Post Confidence Questionnaire

**User Story:** As a user, I want to complete confidence questionnaires before and after practice sessions, so that I can measure how the system impacts my interview readiness.

#### Acceptance Criteria

1. WHEN a user starts their first session, THE Frontend SHALL present a pre-session confidence questionnaire with 4 statements rated on the Likert_Scale
2. WHEN a user completes a practice session, THE Frontend SHALL present a post-session confidence questionnaire with the same 4 statements rated on the Likert_Scale
3. THE Backend SHALL calculate confidence improvement as the difference between average post-session and pre-session scores
4. THE Backend SHALL store both pre-session and post-session questionnaire responses in the Database linked to the corresponding session
5. WHEN a user views their progress dashboard, THE Frontend SHALL display the confidence improvement score alongside performance metrics

### Requirement 11: Structured Feedback with Improvement Suggestions

**User Story:** As a user, I want detailed written feedback with specific improvement suggestions for each response, so that I know exactly what to work on.

#### Acceptance Criteria

1. WHEN the AI_Engine evaluates a user response, THE AI_Engine SHALL generate textual feedback for each evaluation dimension explaining the rationale for the assigned score
2. THE AI_Engine SHALL include at least one specific improvement suggestion per dimension where the score is 3 or below
3. WHEN a session completes, THE Backend SHALL generate a session summary containing aggregated feedback and top 3 prioritized improvement areas
4. THE Frontend SHALL display dimension-level feedback grouped by question, with scores and improvement suggestions clearly separated

### Requirement 12: Security and Request Filtering

**User Story:** As a system administrator, I want all incoming requests filtered for malicious content, so that the system is protected from common web attacks.

#### Acceptance Criteria

1. THE API_Gateway SHALL route all incoming requests through AWS WAF before processing
2. WHEN AWS WAF detects a request matching SQL injection or cross-site scripting patterns, THE API_Gateway SHALL block the request and return a 403 Forbidden status
3. THE API_Gateway SHALL enforce rate limiting to prevent abuse of AI generation endpoints

### Requirement 13: Prompt Engineering Reproducibility

**User Story:** As a researcher, I want the prompt templates and evaluation rubrics to be version-controlled and fixed per experiment, so that evaluation results are reproducible across sessions and users.

#### Acceptance Criteria

1. THE Backend SHALL use fixed prompt templates for question generation and response evaluation, stored as versioned configuration
2. THE Backend SHALL log the prompt template version used for each session evaluation in the Database
3. THE Backend SHALL include the complete Evaluation_Rubric text with level definitions (1-5) in every evaluation prompt
4. WHEN evaluating responses, THE Backend SHALL enforce structured JSON output format in the prompt to ensure parseable and consistent AI responses
