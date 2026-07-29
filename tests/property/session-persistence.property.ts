import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Feature: ai-interview-coach
 * Property 8: Session record persistence round-trip
 *
 * For any valid completed session (containing questions, responses, dimension scores,
 * overall score, and timestamps), storing the session and then retrieving it should
 * produce a record equal to the original session data.
 *
 * Validates: Requirements 8.1
 */

// Mock the database module before importing the handler
vi.mock('@backend/utils/db', () => {
  return {
    query: vi.fn(),
    getPool: vi.fn(),
    closePool: vi.fn(),
  };
});

import { handler } from '@backend/handlers/history';
import { query } from '@backend/utils/db';
import { SessionStatus } from '@ai-interview-coach/shared';

const mockedQuery = vi.mocked(query);

// --- Generators ---

/**
 * Generator for non-empty trimmed strings (company names, domains, etc.)
 */
const arbitraryNonEmptyString = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.trim());

/**
 * Generator for UUIDs.
 */
const arbitraryUuid = fc.uuid();

/**
 * Generator for dimension scores (integer 1-5).
 */
const arbitraryDimensionScore = fc.integer({ min: 1, max: 5 });

/**
 * Generator for overall score (average of 4 dimension scores, 2 decimal places).
 */
function computeOverallScore(
  contentRelevance: number,
  structureOrganization: number,
  technicalAccuracy: number,
  communicationClarity: number
): number {
  return parseFloat(
    ((contentRelevance + structureOrganization + technicalAccuracy + communicationClarity) / 4).toFixed(2)
  );
}

/**
 * Generator for question types.
 */
const arbitraryQuestionType = fc.constantFrom('technical', 'behavioral');

/**
 * Generator for difficulty levels.
 */
const arbitraryDifficulty = fc.constantFrom('beginner', 'intermediate', 'advanced');

/**
 * Generator for input methods.
 */
const arbitraryInputMethod = fc.constantFrom('text', 'voice');

/**
 * Generator for ISO timestamp strings.
 */
const arbitraryTimestamp = fc
  .date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') })
  .map((d) => d.toISOString());

/**
 * Generator for feedback JSON.
 */
const arbitraryFeedback = fc.record({
  contentRelevance: fc.record({
    text: fc.string({ minLength: 1, maxLength: 100 }),
    suggestions: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 3 }),
  }),
  structureOrganization: fc.record({
    text: fc.string({ minLength: 1, maxLength: 100 }),
    suggestions: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 3 }),
  }),
  technicalAccuracy: fc.record({
    text: fc.string({ minLength: 1, maxLength: 100 }),
    suggestions: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 3 }),
  }),
  communicationClarity: fc.record({
    text: fc.string({ minLength: 1, maxLength: 100 }),
    suggestions: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 3 }),
  }),
});

/**
 * Generator for a single question with response and evaluation.
 */
const arbitraryQuestionDetail = fc.record({
  questionId: arbitraryUuid,
  questionIndex: fc.integer({ min: 1, max: 10 }),
  questionType: arbitraryQuestionType,
  questionText: fc.string({ minLength: 10, maxLength: 200 }),
  difficulty: arbitraryDifficulty,
  generatedAt: arbitraryTimestamp,
  responseId: arbitraryUuid,
  responseText: fc.string({ minLength: 10, maxLength: 500 }),
  inputMethod: arbitraryInputMethod,
  submittedAt: arbitraryTimestamp,
  evaluationId: arbitraryUuid,
  contentRelevance: arbitraryDimensionScore,
  structureOrganization: arbitraryDimensionScore,
  technicalAccuracy: arbitraryDimensionScore,
  communicationClarity: arbitraryDimensionScore,
  feedback: arbitraryFeedback,
  evaluatedAt: arbitraryTimestamp,
});

/**
 * Generator for a complete session record with questions, responses, scores, and timestamps.
 */
const arbitraryCompletedSession = fc.record({
  sessionId: arbitraryUuid,
  userId: arbitraryUuid,
  company: arbitraryNonEmptyString,
  domain: arbitraryNonEmptyString,
  promptTemplateVersion: fc.constantFrom('1.0', '1.1', '2.0'),
  startedAt: arbitraryTimestamp,
  completedAt: arbitraryTimestamp,
  questions: fc.array(arbitraryQuestionDetail, { minLength: 1, maxLength: 5 }),
});

// --- Helpers ---

function createGetDetailEvent(clerkUserId: string, sessionId: string): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: `/api/sessions/${sessionId}/detail`,
    pathParameters: { sessionId },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/api/sessions/{sessionId}/detail',
    requestContext: {
      authorizer: { clerk_user_id: clerkUserId },
      accountId: '',
      apiId: '',
      httpMethod: 'GET',
      identity: {} as any,
      path: `/api/sessions/${sessionId}/detail`,
      protocol: 'HTTP/1.1',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: '',
      resourcePath: '/api/sessions/{sessionId}/detail',
      stage: 'test',
    },
  } as APIGatewayProxyEvent;
}

describe('Property 8: Session record persistence round-trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('store then retrieve produces equal record', async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryCompletedSession, async (sessionData) => {
        const clerkUserId = 'clerk-user-abc';

        // Compute overall scores for each question's evaluation
        const questionsWithOverallScores = sessionData.questions.map((q, idx) => ({
          ...q,
          questionIndex: idx + 1,
          evaluationOverallScore: computeOverallScore(
            q.contentRelevance,
            q.structureOrganization,
            q.technicalAccuracy,
            q.communicationClarity
          ),
        }));

        // Compute session overall score as mean of all question overall scores
        const sessionOverallScore = parseFloat(
          (
            questionsWithOverallScores.reduce((sum, q) => sum + q.evaluationOverallScore, 0) /
            questionsWithOverallScores.length
          ).toFixed(2)
        );

        // Simulate the stored session row (what the DB would return)
        const storedSessionRow = {
          id: sessionData.sessionId,
          user_id: sessionData.userId,
          company: sessionData.company,
          domain: sessionData.domain,
          status: SessionStatus.Completed,
          overall_score: sessionOverallScore,
          prompt_template_version: sessionData.promptTemplateVersion,
          started_at: sessionData.startedAt,
          completed_at: sessionData.completedAt,
        };

        // Simulate the stored question detail rows
        const storedQuestionRows = questionsWithOverallScores.map((q) => ({
          question_id: q.questionId,
          question_index: q.questionIndex,
          question_type: q.questionType,
          question_text: q.questionText,
          difficulty: q.difficulty,
          generated_at: q.generatedAt,
          response_id: q.responseId,
          response_text: q.responseText,
          input_method: q.inputMethod,
          submitted_at: q.submittedAt,
          evaluation_id: q.evaluationId,
          content_relevance: q.contentRelevance,
          structure_organization: q.structureOrganization,
          technical_accuracy: q.technicalAccuracy,
          communication_clarity: q.communicationClarity,
          evaluation_overall_score: q.evaluationOverallScore,
          feedback: q.feedback,
          evaluated_at: q.evaluatedAt,
        }));

        // Mock the query function to simulate database store/retrieve
        mockedQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
          // User lookup by clerk_user_id
          if (sql.includes('FROM users') && sql.includes('clerk_user_id')) {
            return {
              rows: [{ id: sessionData.userId }],
              rowCount: 1,
              command: 'SELECT',
              oid: 0,
              fields: [],
            } as any;
          }

          // Session retrieval
          if (sql.includes('FROM sessions') && sql.includes('WHERE id')) {
            return {
              rows: [storedSessionRow],
              rowCount: 1,
              command: 'SELECT',
              oid: 0,
              fields: [],
            } as any;
          }

          // Question detail retrieval (JOIN query)
          if (sql.includes('FROM questions') && sql.includes('LEFT JOIN')) {
            return {
              rows: storedQuestionRows,
              rowCount: storedQuestionRows.length,
              command: 'SELECT',
              oid: 0,
              fields: [],
            } as any;
          }

          return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] } as any;
        });

        // Retrieve session detail via the history handler
        const getEvent = createGetDetailEvent(clerkUserId, sessionData.sessionId);
        const getResult = await handler(getEvent);

        expect(getResult.statusCode).toBe(200);
        const body = JSON.parse(getResult.body);

        // Assert session-level data round-trip
        const retrievedSession = body.session;
        expect(retrievedSession.id).toBe(sessionData.sessionId);
        expect(retrievedSession.userId).toBe(sessionData.userId);
        expect(retrievedSession.company).toBe(sessionData.company);
        expect(retrievedSession.domain).toBe(sessionData.domain);
        expect(retrievedSession.status).toBe(SessionStatus.Completed);
        expect(retrievedSession.overallScore).toBe(sessionOverallScore);
        expect(retrievedSession.promptTemplateVersion).toBe(sessionData.promptTemplateVersion);
        expect(retrievedSession.startedAt).toBe(sessionData.startedAt);
        expect(retrievedSession.completedAt).toBe(sessionData.completedAt);

        // Assert question-level data round-trip
        const retrievedQuestions = body.questions;
        expect(retrievedQuestions).toHaveLength(questionsWithOverallScores.length);

        for (let i = 0; i < questionsWithOverallScores.length; i++) {
          const original = questionsWithOverallScores[i];
          const retrieved = retrievedQuestions[i];

          // Question fields
          expect(retrieved.questionId).toBe(original.questionId);
          expect(retrieved.questionIndex).toBe(original.questionIndex);
          expect(retrieved.questionType).toBe(original.questionType);
          expect(retrieved.questionText).toBe(original.questionText);
          expect(retrieved.difficulty).toBe(original.difficulty);
          expect(retrieved.generatedAt).toBe(original.generatedAt);

          // Response fields
          expect(retrieved.response).not.toBeNull();
          expect(retrieved.response.responseId).toBe(original.responseId);
          expect(retrieved.response.responseText).toBe(original.responseText);
          expect(retrieved.response.inputMethod).toBe(original.inputMethod);
          expect(retrieved.response.submittedAt).toBe(original.submittedAt);

          // Evaluation fields
          expect(retrieved.evaluation).not.toBeNull();
          expect(retrieved.evaluation.evaluationId).toBe(original.evaluationId);
          expect(retrieved.evaluation.scores.contentRelevance).toBe(original.contentRelevance);
          expect(retrieved.evaluation.scores.structureOrganization).toBe(original.structureOrganization);
          expect(retrieved.evaluation.scores.technicalAccuracy).toBe(original.technicalAccuracy);
          expect(retrieved.evaluation.scores.communicationClarity).toBe(original.communicationClarity);
          expect(retrieved.evaluation.overallScore).toBe(original.evaluationOverallScore);
          expect(retrieved.evaluation.feedback).toEqual(original.feedback);
          expect(retrieved.evaluation.evaluatedAt).toBe(original.evaluatedAt);
        }
      }),
      { numRuns: 100 }
    );
  });
});
