import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// Mock the db module
vi.mock('@backend/utils/db', () => ({
  query: vi.fn(),
  getPool: vi.fn(),
  closePool: vi.fn(),
}));

// Mock the Bedrock client - use hoisted mock variable
const mockSend = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  InvokeModelCommand: vi.fn().mockImplementation((params) => params),
}));

import { handler } from '@backend/handlers/question';
import { query } from '@backend/utils/db';
import { ErrorCode } from '@ai-interview-coach/shared';

const MOCK_USER_ID = 'uuid-user-1';
const MOCK_CLERK_USER_ID = 'user_clerk123';
const MOCK_SESSION_ID = 'uuid-session-1';
const MOCK_QUESTION_ID = 'uuid-question-1';

function createEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    body: JSON.stringify({
      questionIndex: 0,
      questionType: 'technical',
    }),
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: `/api/sessions/${MOCK_SESSION_ID}/questions`,
    pathParameters: { sessionId: MOCK_SESSION_ID },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/api/sessions/{sessionId}/questions',
    requestContext: {
      authorizer: {
        clerk_user_id: MOCK_CLERK_USER_ID,
      },
      accountId: '123456789',
      apiId: 'api123',
      httpMethod: 'POST',
      identity: {} as APIGatewayProxyEvent['requestContext']['identity'],
      path: `/api/sessions/${MOCK_SESSION_ID}/questions`,
      protocol: 'HTTP/1.1',
      requestId: 'req123',
      requestTimeEpoch: Date.now(),
      resourceId: 'res123',
      resourcePath: '/api/sessions/{sessionId}/questions',
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

function mockSessionLookup(session: object | null = null) {
  const defaultSession = {
    id: MOCK_SESSION_ID,
    user_id: MOCK_USER_ID,
    company: 'Google',
    domain: 'Backend Engineering',
    status: 'in_progress',
  };
  vi.mocked(query).mockResolvedValueOnce({
    rows: session !== null ? [session] : [defaultSession],
    rowCount: 1,
  } as never);
}

function mockProfileLookup(profile: object | null = null) {
  const defaultProfile = {
    target_role: 'Senior Software Engineer',
    skills: ['TypeScript', 'Node.js', 'AWS'],
    years_experience: 5,
  };
  vi.mocked(query).mockResolvedValueOnce({
    rows: profile !== null ? [profile] : [defaultProfile],
    rowCount: 1,
  } as never);
}

function mockQuestionInsert() {
  vi.mocked(query).mockResolvedValueOnce({
    rows: [
      {
        id: MOCK_QUESTION_ID,
        session_id: MOCK_SESSION_ID,
        question_index: 0,
        question_type: 'technical',
        question_text: 'How would you design a distributed cache?',
        difficulty: 'intermediate',
        generated_at: new Date('2024-01-15T10:00:00Z'),
      },
    ],
    rowCount: 1,
  } as never);
}

function mockBedrockResponse(text: string = 'How would you design a distributed cache?') {
  const responseBody = {
    content: [{ text }],
  };
  mockSend.mockResolvedValueOnce({
    body: new TextEncoder().encode(JSON.stringify(responseBody)),
  });
}

function mockBedrockError(error: Error = new Error('Bedrock timeout')) {
  mockSend.mockRejectedValueOnce(error);
}

describe('Question Generation Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BEDROCK_MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BEDROCK_MODEL_ID;
  });

  describe('POST /api/sessions/:id/questions', () => {
    it('should return 201 with generated question on success', async () => {
      mockUserLookup();
      mockSessionLookup();
      mockProfileLookup();
      mockBedrockResponse('How would you design a distributed cache?');
      mockQuestionInsert();

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.question).toBeDefined();
      expect(body.question.id).toBe(MOCK_QUESTION_ID);
      expect(body.question.sessionId).toBe(MOCK_SESSION_ID);
      expect(body.question.questionType).toBe('technical');
      expect(body.question.questionText).toBe('How would you design a distributed cache?');
      expect(body.question.difficulty).toBe('intermediate');
      expect(body.question.questionIndex).toBe(0);
    });

    it('should return 401 when clerk_user_id is missing', async () => {
      const event = createEvent({
        requestContext: {
          authorizer: {},
        } as APIGatewayProxyEvent['requestContext'],
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.Unauthorized);
    });

    it('should return 400 when session ID is missing', async () => {
      const event = createEvent({
        pathParameters: null,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.InvalidInput);
      expect(body.error.message).toContain('Session ID');
    });

    it('should return 400 for invalid JSON body', async () => {
      const event = createEvent({
        body: '{invalid json',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.InvalidInput);
    });

    it('should return 400 when questionIndex is missing', async () => {
      const event = createEvent({
        body: JSON.stringify({ questionType: 'technical' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
      expect(body.error.message).toContain('questionIndex');
    });

    it('should return 400 when questionIndex is negative', async () => {
      const event = createEvent({
        body: JSON.stringify({ questionIndex: -1, questionType: 'technical' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
    });

    it('should return 400 when questionType is invalid', async () => {
      const event = createEvent({
        body: JSON.stringify({ questionIndex: 0, questionType: 'invalid' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
      expect(body.error.message).toContain('questionType');
    });

    it('should return 400 when questionType is missing', async () => {
      const event = createEvent({
        body: JSON.stringify({ questionIndex: 0 }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
    });

    it('should return 404 when user profile not found', async () => {
      mockUserLookup(null);

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.NotFound);
    });

    it('should return 404 when session not found', async () => {
      mockUserLookup();
      vi.mocked(query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.NotFound);
      expect(body.error.message).toContain('Session not found');
    });

    it('should return 403 when session belongs to another user', async () => {
      mockUserLookup();
      mockSessionLookup({
        id: MOCK_SESSION_ID,
        user_id: 'different-user-id',
        company: 'Google',
        domain: 'Backend',
        status: 'in_progress',
      });

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.Forbidden);
    });

    it('should return 503 when Bedrock fails after all retries', async () => {
      mockUserLookup();
      mockSessionLookup();
      mockProfileLookup();
      // Mock 3 Bedrock failures (initial + 2 retries)
      mockBedrockError(new Error('Bedrock timeout'));
      mockBedrockError(new Error('Bedrock timeout'));
      mockBedrockError(new Error('Bedrock timeout'));

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(503);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.AiServiceUnavailable);
      expect(body.error.retryable).toBe(true);
    });

    it('should succeed on retry when first attempt fails', async () => {
      mockUserLookup();
      mockSessionLookup();
      mockProfileLookup();
      // First attempt fails, second succeeds
      mockBedrockError(new Error('Bedrock timeout'));
      mockBedrockResponse('What is your approach to system design?');

      // Mock the DB insert
      vi.mocked(query).mockResolvedValueOnce({
        rows: [
          {
            id: MOCK_QUESTION_ID,
            session_id: MOCK_SESSION_ID,
            question_index: 0,
            question_type: 'technical',
            question_text: 'What is your approach to system design?',
            difficulty: 'intermediate',
            generated_at: new Date('2024-01-15T10:00:00Z'),
          },
        ],
        rowCount: 1,
      } as never);

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.question.questionText).toBe('What is your approach to system design?');
    });

    it('should determine beginner difficulty for < 3 years experience', async () => {
      mockUserLookup();
      mockSessionLookup();
      mockProfileLookup({
        target_role: 'Junior Developer',
        skills: ['JavaScript'],
        years_experience: 1,
      });
      mockBedrockResponse('What is closure in JavaScript?');

      vi.mocked(query).mockResolvedValueOnce({
        rows: [
          {
            id: MOCK_QUESTION_ID,
            session_id: MOCK_SESSION_ID,
            question_index: 0,
            question_type: 'technical',
            question_text: 'What is closure in JavaScript?',
            difficulty: 'beginner',
            generated_at: new Date('2024-01-15T10:00:00Z'),
          },
        ],
        rowCount: 1,
      } as never);

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.question.difficulty).toBe('beginner');
    });

    it('should determine advanced difficulty for >= 8 years experience', async () => {
      mockUserLookup();
      mockSessionLookup();
      mockProfileLookup({
        target_role: 'Staff Engineer',
        skills: ['System Design', 'Distributed Systems'],
        years_experience: 10,
      });
      mockBedrockResponse('Design a globally distributed consensus system.');

      vi.mocked(query).mockResolvedValueOnce({
        rows: [
          {
            id: MOCK_QUESTION_ID,
            session_id: MOCK_SESSION_ID,
            question_index: 0,
            question_type: 'technical',
            question_text: 'Design a globally distributed consensus system.',
            difficulty: 'advanced',
            generated_at: new Date('2024-01-15T10:00:00Z'),
          },
        ],
        rowCount: 1,
      } as never);

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.question.difficulty).toBe('advanced');
    });

    it('should accept behavioral question type', async () => {
      mockUserLookup();
      mockSessionLookup();
      mockProfileLookup();
      mockBedrockResponse('Tell me about a time you resolved a conflict.');

      vi.mocked(query).mockResolvedValueOnce({
        rows: [
          {
            id: MOCK_QUESTION_ID,
            session_id: MOCK_SESSION_ID,
            question_index: 1,
            question_type: 'behavioral',
            question_text: 'Tell me about a time you resolved a conflict.',
            difficulty: 'intermediate',
            generated_at: new Date('2024-01-15T10:00:00Z'),
          },
        ],
        rowCount: 1,
      } as never);

      const event = createEvent({
        body: JSON.stringify({ questionIndex: 1, questionType: 'behavioral' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.question.questionType).toBe('behavioral');
    });

    it('should return 405 for non-POST methods', async () => {
      const event = createEvent({ httpMethod: 'GET' });
      const result = await handler(event);

      expect(result.statusCode).toBe(405);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.InvalidInput);
    });
  });
});
