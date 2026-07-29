import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// Mock the db module
vi.mock('@backend/utils/db', () => ({
  query: vi.fn(),
  getPool: vi.fn(),
  closePool: vi.fn(),
}));

import { handler } from '@backend/handlers/session';
import { query } from '@backend/utils/db';
import { ErrorCode, SessionStatus } from '@ai-interview-coach/shared';

const MOCK_USER_ID = 'uuid-user-1';
const MOCK_CLERK_USER_ID = 'user_clerk123';
const MOCK_SESSION_ID = 'uuid-session-1';

function createEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/api/sessions',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/api/sessions',
    requestContext: {
      authorizer: {
        clerk_user_id: MOCK_CLERK_USER_ID,
      },
      accountId: '123456789',
      apiId: 'api123',
      httpMethod: 'GET',
      identity: {} as APIGatewayProxyEvent['requestContext']['identity'],
      path: '/api/sessions',
      protocol: 'HTTP/1.1',
      requestId: 'req123',
      requestTimeEpoch: Date.now(),
      resourceId: 'res123',
      resourcePath: '/api/sessions',
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

describe('Session Management Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PROMPT_TEMPLATE_VERSION = '2.0';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.PROMPT_TEMPLATE_VERSION;
  });

  describe('POST /api/sessions', () => {
    it('should return 201 when session is created successfully', async () => {
      const mockRow = {
        id: MOCK_SESSION_ID,
        user_id: MOCK_USER_ID,
        company: 'Google',
        domain: 'Backend Engineering',
        status: 'in_progress',
        overall_score: null,
        prompt_template_version: '2.0',
        started_at: new Date('2024-01-15T10:00:00Z'),
        completed_at: null,
      };

      // First call: user lookup; Second call: insert session
      mockUserLookup();
      vi.mocked(query).mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

      const event = createEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          company: 'Google',
          domain: 'Backend Engineering',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.session.company).toBe('Google');
      expect(body.session.domain).toBe('Backend Engineering');
      expect(body.session.status).toBe(SessionStatus.InProgress);
      expect(body.session.promptTemplateVersion).toBe('2.0');
      expect(body.session.completedAt).toBeNull();
    });

    it('should return 400 when company is missing', async () => {
      const event = createEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ domain: 'Frontend' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
      expect(body.error.message).toContain('company');
    });

    it('should return 400 when domain is missing', async () => {
      const event = createEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ company: 'Amazon' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
      expect(body.error.message).toContain('domain');
    });

    it('should return 400 when company is empty string', async () => {
      const event = createEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ company: '  ', domain: 'Engineering' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
    });

    it('should return 400 for invalid JSON body', async () => {
      const event = createEvent({
        httpMethod: 'POST',
        body: 'not valid json{',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.InvalidInput);
    });

    it('should return 401 when clerk_user_id is missing', async () => {
      const event = createEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ company: 'Meta', domain: 'ML' }),
        requestContext: {
          authorizer: {},
        } as APIGatewayProxyEvent['requestContext'],
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.Unauthorized);
    });

    it('should return 404 when user profile not found', async () => {
      mockUserLookup(null);

      const event = createEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ company: 'Meta', domain: 'ML' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.NotFound);
    });

    it('should use default prompt_template_version when env var not set', async () => {
      delete process.env.PROMPT_TEMPLATE_VERSION;

      const mockRow = {
        id: MOCK_SESSION_ID,
        user_id: MOCK_USER_ID,
        company: 'Startup',
        domain: 'Fullstack',
        status: 'in_progress',
        overall_score: null,
        prompt_template_version: '1.0',
        started_at: new Date('2024-01-15T10:00:00Z'),
        completed_at: null,
      };

      mockUserLookup();
      vi.mocked(query).mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

      const event = createEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ company: 'Startup', domain: 'Fullstack' }),
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(201);

      // Verify the INSERT was called with '1.0' as default
      const insertCall = vi.mocked(query).mock.calls[1];
      expect(insertCall[1]).toContain('1.0');
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('should return 200 with session data when found and authorized', async () => {
      const mockRow = {
        id: MOCK_SESSION_ID,
        user_id: MOCK_USER_ID,
        company: 'Amazon',
        domain: 'System Design',
        status: 'in_progress',
        overall_score: null,
        prompt_template_version: '2.0',
        started_at: new Date('2024-02-01T14:00:00Z'),
        completed_at: null,
      };

      mockUserLookup();
      vi.mocked(query).mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

      const event = createEvent({
        httpMethod: 'GET',
        pathParameters: { sessionId: MOCK_SESSION_ID },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.session.id).toBe(MOCK_SESSION_ID);
      expect(body.session.company).toBe('Amazon');
      expect(body.session.domain).toBe('System Design');
    });

    it('should return 404 when session not found', async () => {
      mockUserLookup();
      vi.mocked(query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

      const event = createEvent({
        httpMethod: 'GET',
        pathParameters: { sessionId: 'non-existent-id' },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.NotFound);
    });

    it('should return 403 when session belongs to another user', async () => {
      const mockRow = {
        id: MOCK_SESSION_ID,
        user_id: 'different-user-id',
        company: 'Netflix',
        domain: 'Streaming',
        status: 'in_progress',
        overall_score: null,
        prompt_template_version: '2.0',
        started_at: new Date('2024-02-01T14:00:00Z'),
        completed_at: null,
      };

      mockUserLookup();
      vi.mocked(query).mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

      const event = createEvent({
        httpMethod: 'GET',
        pathParameters: { sessionId: MOCK_SESSION_ID },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.Forbidden);
    });

    it('should return 400 when session ID is missing from path', async () => {
      const event = createEvent({
        httpMethod: 'GET',
        pathParameters: null,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.InvalidInput);
    });
  });

  describe('PATCH /api/sessions/:id', () => {
    it('should return 200 when session is completed', async () => {
      const existingRow = {
        id: MOCK_SESSION_ID,
        user_id: MOCK_USER_ID,
        status: 'in_progress',
      };

      const updatedRow = {
        id: MOCK_SESSION_ID,
        user_id: MOCK_USER_ID,
        company: 'Google',
        domain: 'Backend',
        status: 'completed',
        overall_score: null,
        prompt_template_version: '2.0',
        started_at: new Date('2024-01-15T10:00:00Z'),
        completed_at: new Date('2024-01-15T11:00:00Z'),
      };

      // user lookup, then existing session fetch, then update
      mockUserLookup();
      vi.mocked(query).mockResolvedValueOnce({ rows: [existingRow], rowCount: 1 } as never);
      vi.mocked(query).mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 } as never);

      const event = createEvent({
        httpMethod: 'PATCH',
        pathParameters: { sessionId: MOCK_SESSION_ID },
        body: JSON.stringify({ status: 'completed' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.session.status).toBe(SessionStatus.Completed);
      expect(body.session.completedAt).not.toBeNull();
    });

    it('should return 200 when session is abandoned', async () => {
      const existingRow = {
        id: MOCK_SESSION_ID,
        user_id: MOCK_USER_ID,
        status: 'in_progress',
      };

      const updatedRow = {
        id: MOCK_SESSION_ID,
        user_id: MOCK_USER_ID,
        company: 'Meta',
        domain: 'Frontend',
        status: 'abandoned',
        overall_score: null,
        prompt_template_version: '2.0',
        started_at: new Date('2024-01-15T10:00:00Z'),
        completed_at: new Date('2024-01-15T10:30:00Z'),
      };

      mockUserLookup();
      vi.mocked(query).mockResolvedValueOnce({ rows: [existingRow], rowCount: 1 } as never);
      vi.mocked(query).mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 } as never);

      const event = createEvent({
        httpMethod: 'PATCH',
        pathParameters: { sessionId: MOCK_SESSION_ID },
        body: JSON.stringify({ status: 'abandoned' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.session.status).toBe(SessionStatus.Abandoned);
    });

    it('should return 400 when status is invalid', async () => {
      const event = createEvent({
        httpMethod: 'PATCH',
        pathParameters: { sessionId: MOCK_SESSION_ID },
        body: JSON.stringify({ status: 'in_progress' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
    });

    it('should return 400 when status is missing', async () => {
      const event = createEvent({
        httpMethod: 'PATCH',
        pathParameters: { sessionId: MOCK_SESSION_ID },
        body: JSON.stringify({}),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
    });

    it('should return 404 when session not found for update', async () => {
      mockUserLookup();
      vi.mocked(query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

      const event = createEvent({
        httpMethod: 'PATCH',
        pathParameters: { sessionId: 'non-existent' },
        body: JSON.stringify({ status: 'completed' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.NotFound);
    });

    it('should return 403 when session belongs to another user', async () => {
      const existingRow = {
        id: MOCK_SESSION_ID,
        user_id: 'other-user-id',
        status: 'in_progress',
      };

      mockUserLookup();
      vi.mocked(query).mockResolvedValueOnce({ rows: [existingRow], rowCount: 1 } as never);

      const event = createEvent({
        httpMethod: 'PATCH',
        pathParameters: { sessionId: MOCK_SESSION_ID },
        body: JSON.stringify({ status: 'completed' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.Forbidden);
    });

    it('should return 400 for invalid JSON body', async () => {
      const event = createEvent({
        httpMethod: 'PATCH',
        pathParameters: { sessionId: MOCK_SESSION_ID },
        body: '{invalid json',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.InvalidInput);
    });
  });

  describe('Unsupported methods', () => {
    it('should return 405 for DELETE method', async () => {
      const event = createEvent({ httpMethod: 'DELETE' });
      const result = await handler(event);

      expect(result.statusCode).toBe(405);
    });
  });
});
