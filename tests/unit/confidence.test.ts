import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// Mock the db module
vi.mock('@backend/utils/db', () => ({
  query: vi.fn(),
  getPool: vi.fn(),
  closePool: vi.fn(),
}));

import { handler, calculateAverageScore, calculateConfidenceImprovement } from '@backend/handlers/confidence';
import { query } from '@backend/utils/db';
import { ConfidenceType, ErrorCode } from '@ai-interview-coach/shared';

const MOCK_USER_ID = 'uuid-user-1';
const MOCK_CLERK_USER_ID = 'user_clerk123';
const MOCK_SESSION_ID = 'uuid-session-1';
const MOCK_QUESTIONNAIRE_ID = 'uuid-questionnaire-1';

function createEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: `/api/sessions/${MOCK_SESSION_ID}/confidence`,
    pathParameters: { sessionId: MOCK_SESSION_ID },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/api/sessions/{sessionId}/confidence',
    requestContext: {
      authorizer: {
        clerk_user_id: MOCK_CLERK_USER_ID,
      },
      accountId: '123456789',
      apiId: 'api123',
      httpMethod: 'POST',
      identity: {} as APIGatewayProxyEvent['requestContext']['identity'],
      path: `/api/sessions/${MOCK_SESSION_ID}/confidence`,
      protocol: 'HTTP/1.1',
      requestId: 'req123',
      requestTimeEpoch: Date.now(),
      resourceId: 'res123',
      resourcePath: '/api/sessions/{sessionId}/confidence',
      stage: 'prod',
    },
    ...overrides,
  } as APIGatewayProxyEvent;
}

function mockUserLookup(userId: string | null = MOCK_USER_ID) {
  vi.mocked(query).mockResolvedValueOnce({
    rows: userId ? [{ id: userId }] : [],
    rowCount: userId ? 1 : 0,
  } as never);
}

function mockSessionLookup(session: { id: string; user_id: string } | null = { id: MOCK_SESSION_ID, user_id: MOCK_USER_ID }) {
  vi.mocked(query).mockResolvedValueOnce({
    rows: session ? [session] : [],
    rowCount: session ? 1 : 0,
  } as never);
}

function validPreBody() {
  return JSON.stringify({
    type: 'pre',
    responses: [
      { statementIndex: 1, score: 3 },
      { statementIndex: 2, score: 4 },
      { statementIndex: 3, score: 2 },
      { statementIndex: 4, score: 5 },
    ],
  });
}

function validPostBody() {
  return JSON.stringify({
    type: 'post',
    responses: [
      { statementIndex: 1, score: 4 },
      { statementIndex: 2, score: 5 },
      { statementIndex: 3, score: 3 },
      { statementIndex: 4, score: 5 },
    ],
  });
}

describe('Confidence Questionnaire Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('calculateAverageScore', () => {
    it('should calculate the average of 4 scores', () => {
      const responses = [
        { statementIndex: 1, score: 3 },
        { statementIndex: 2, score: 4 },
        { statementIndex: 3, score: 2 },
        { statementIndex: 4, score: 5 },
      ];
      // (3 + 4 + 2 + 5) / 4 = 14 / 4 = 3.5
      expect(calculateAverageScore(responses)).toBe(3.5);
    });

    it('should handle all scores being the same', () => {
      const responses = [
        { statementIndex: 1, score: 4 },
        { statementIndex: 2, score: 4 },
        { statementIndex: 3, score: 4 },
        { statementIndex: 4, score: 4 },
      ];
      expect(calculateAverageScore(responses)).toBe(4);
    });

    it('should handle minimum scores', () => {
      const responses = [
        { statementIndex: 1, score: 1 },
        { statementIndex: 2, score: 1 },
        { statementIndex: 3, score: 1 },
        { statementIndex: 4, score: 1 },
      ];
      expect(calculateAverageScore(responses)).toBe(1);
    });

    it('should handle maximum scores', () => {
      const responses = [
        { statementIndex: 1, score: 5 },
        { statementIndex: 2, score: 5 },
        { statementIndex: 3, score: 5 },
        { statementIndex: 4, score: 5 },
      ];
      expect(calculateAverageScore(responses)).toBe(5);
    });
  });

  describe('calculateConfidenceImprovement', () => {
    it('should calculate positive improvement', () => {
      expect(calculateConfidenceImprovement(3.0, 4.5)).toBe(1.5);
    });

    it('should calculate negative improvement (decline)', () => {
      expect(calculateConfidenceImprovement(4.0, 3.0)).toBe(-1.0);
    });

    it('should return zero when no change', () => {
      expect(calculateConfidenceImprovement(3.5, 3.5)).toBe(0);
    });
  });

  describe('POST /api/sessions/:id/confidence', () => {
    it('should return 201 when pre-questionnaire is stored successfully', async () => {
      const mockRow = {
        id: MOCK_QUESTIONNAIRE_ID,
        session_id: MOCK_SESSION_ID,
        type: 'pre',
        responses: [
          { statementIndex: 1, score: 3 },
          { statementIndex: 2, score: 4 },
          { statementIndex: 3, score: 2 },
          { statementIndex: 4, score: 5 },
        ],
        average_score: 3.5,
        submitted_at: new Date('2024-01-15T10:00:00Z'),
      };

      // user lookup, session lookup, insert
      mockUserLookup();
      mockSessionLookup();
      vi.mocked(query).mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

      const event = createEvent({ body: validPreBody() });
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.questionnaire.id).toBe(MOCK_QUESTIONNAIRE_ID);
      expect(body.questionnaire.sessionId).toBe(MOCK_SESSION_ID);
      expect(body.questionnaire.type).toBe('pre');
      expect(body.questionnaire.averageScore).toBe(3.5);
      expect(body.confidenceImprovement).toBeUndefined();
    });

    it('should return 201 with confidenceImprovement when post-questionnaire is stored and pre exists', async () => {
      const mockRow = {
        id: MOCK_QUESTIONNAIRE_ID,
        session_id: MOCK_SESSION_ID,
        type: 'post',
        responses: [
          { statementIndex: 1, score: 4 },
          { statementIndex: 2, score: 5 },
          { statementIndex: 3, score: 3 },
          { statementIndex: 4, score: 5 },
        ],
        average_score: 4.25,
        submitted_at: new Date('2024-01-15T11:00:00Z'),
      };

      // user lookup, session lookup, insert, pre questionnaire lookup
      mockUserLookup();
      mockSessionLookup();
      vi.mocked(query).mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);
      vi.mocked(query).mockResolvedValueOnce({ rows: [{ average_score: 3.5 }], rowCount: 1 } as never);

      const event = createEvent({ body: validPostBody() });
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.questionnaire.type).toBe('post');
      expect(body.questionnaire.averageScore).toBe(4.25);
      // improvement = 4.25 - 3.5 = 0.75
      expect(body.confidenceImprovement).toBe(0.75);
    });

    it('should return 201 without confidenceImprovement when post-questionnaire has no pre', async () => {
      const mockRow = {
        id: MOCK_QUESTIONNAIRE_ID,
        session_id: MOCK_SESSION_ID,
        type: 'post',
        responses: [
          { statementIndex: 1, score: 4 },
          { statementIndex: 2, score: 5 },
          { statementIndex: 3, score: 3 },
          { statementIndex: 4, score: 5 },
        ],
        average_score: 4.25,
        submitted_at: new Date('2024-01-15T11:00:00Z'),
      };

      // user lookup, session lookup, insert, pre questionnaire lookup (not found)
      mockUserLookup();
      mockSessionLookup();
      vi.mocked(query).mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);
      vi.mocked(query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

      const event = createEvent({ body: validPostBody() });
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.questionnaire.type).toBe('post');
      expect(body.confidenceImprovement).toBeUndefined();
    });

    it('should return 401 when clerk_user_id is missing', async () => {
      const event = createEvent({
        body: validPreBody(),
        requestContext: {
          authorizer: {},
        } as APIGatewayProxyEvent['requestContext'],
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.Unauthorized);
    });

    it('should return 400 when session ID is missing from path', async () => {
      const event = createEvent({
        body: validPreBody(),
        pathParameters: null,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.InvalidInput);
    });

    it('should return 400 for invalid JSON body', async () => {
      const event = createEvent({
        body: 'not valid json{',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.InvalidInput);
    });

    it('should return 400 when type is invalid', async () => {
      const event = createEvent({
        body: JSON.stringify({
          type: 'invalid',
          responses: [
            { statementIndex: 1, score: 3 },
            { statementIndex: 2, score: 4 },
            { statementIndex: 3, score: 2 },
            { statementIndex: 4, score: 5 },
          ],
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
      expect(body.error.message).toContain('type');
    });

    it('should return 400 when responses array has wrong length', async () => {
      const event = createEvent({
        body: JSON.stringify({
          type: 'pre',
          responses: [
            { statementIndex: 1, score: 3 },
            { statementIndex: 2, score: 4 },
          ],
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
      expect(body.error.message).toContain('4 items');
    });

    it('should return 400 when a score is out of range', async () => {
      const event = createEvent({
        body: JSON.stringify({
          type: 'pre',
          responses: [
            { statementIndex: 1, score: 3 },
            { statementIndex: 2, score: 6 },
            { statementIndex: 3, score: 2 },
            { statementIndex: 4, score: 5 },
          ],
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
      expect(body.error.message).toContain('score');
    });

    it('should return 400 when a score is not an integer', async () => {
      const event = createEvent({
        body: JSON.stringify({
          type: 'pre',
          responses: [
            { statementIndex: 1, score: 3.5 },
            { statementIndex: 2, score: 4 },
            { statementIndex: 3, score: 2 },
            { statementIndex: 4, score: 5 },
          ],
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
    });

    it('should return 400 when responses is not an array', async () => {
      const event = createEvent({
        body: JSON.stringify({
          type: 'pre',
          responses: 'not an array',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
    });

    it('should return 404 when user profile not found', async () => {
      mockUserLookup(null);

      const event = createEvent({ body: validPreBody() });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.NotFound);
    });

    it('should return 404 when session not found', async () => {
      mockUserLookup();
      mockSessionLookup(null);

      const event = createEvent({ body: validPreBody() });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.NotFound);
      expect(body.error.message).toContain('Session not found');
    });

    it('should return 403 when session belongs to another user', async () => {
      mockUserLookup();
      mockSessionLookup({ id: MOCK_SESSION_ID, user_id: 'other-user-id' });

      const event = createEvent({ body: validPreBody() });
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.Forbidden);
    });

    it('should return 405 for non-POST methods', async () => {
      const event = createEvent({ httpMethod: 'GET' });
      const result = await handler(event);

      expect(result.statusCode).toBe(405);
    });

    it('should return 500 when database insert fails', async () => {
      mockUserLookup();
      mockSessionLookup();
      vi.mocked(query).mockRejectedValueOnce(new Error('DB connection failed'));

      const event = createEvent({ body: validPreBody() });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.DatabaseError);
      expect(body.error.retryable).toBe(true);
    });

    it('should handle responses stored as JSON string in database row', async () => {
      const mockRow = {
        id: MOCK_QUESTIONNAIRE_ID,
        session_id: MOCK_SESSION_ID,
        type: 'pre',
        responses: JSON.stringify([
          { statementIndex: 1, score: 3 },
          { statementIndex: 2, score: 4 },
          { statementIndex: 3, score: 2 },
          { statementIndex: 4, score: 5 },
        ]),
        average_score: '3.50',
        submitted_at: '2024-01-15T10:00:00.000Z',
      };

      mockUserLookup();
      mockSessionLookup();
      vi.mocked(query).mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

      const event = createEvent({ body: validPreBody() });
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.questionnaire.averageScore).toBe(3.5);
      expect(body.questionnaire.responses).toHaveLength(4);
    });
  });
});
