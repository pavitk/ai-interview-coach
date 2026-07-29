import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// Mock the db module
vi.mock('@backend/utils/db', () => ({
  query: vi.fn(),
  getPool: vi.fn(),
  closePool: vi.fn(),
}));

import { handler, validateTargetRole } from '@backend/handlers/profile';
import { query } from '@backend/utils/db';
import { ErrorCode } from '@ai-interview-coach/shared';

function createEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/api/profile',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/api/profile',
    requestContext: {
      authorizer: {
        clerk_user_id: 'user_test123',
      },
      accountId: '123456789',
      apiId: 'api123',
      httpMethod: 'GET',
      identity: {} as APIGatewayProxyEvent['requestContext']['identity'],
      path: '/api/profile',
      protocol: 'HTTP/1.1',
      requestId: 'req123',
      requestTimeEpoch: Date.now(),
      resourceId: 'res123',
      resourcePath: '/api/profile',
      stage: 'prod',
    },
    ...overrides,
  } as APIGatewayProxyEvent;
}

describe('Profile Management Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateTargetRole', () => {
    it('should return error for empty string', () => {
      expect(validateTargetRole('')).not.toBeNull();
    });

    it('should return error for whitespace-only string', () => {
      expect(validateTargetRole('   ')).not.toBeNull();
      expect(validateTargetRole('\t\n')).not.toBeNull();
    });

    it('should return null for valid target role', () => {
      expect(validateTargetRole('Software Engineer')).toBeNull();
      expect(validateTargetRole('  Developer  ')).toBeNull();
    });

    it('should return error for non-string values', () => {
      expect(validateTargetRole(null)).not.toBeNull();
      expect(validateTargetRole(undefined)).not.toBeNull();
      expect(validateTargetRole(123)).not.toBeNull();
    });
  });

  describe('GET /api/profile', () => {
    it('should return 200 with profile data when found', async () => {
      const mockRow = {
        id: 'uuid-1',
        clerk_user_id: 'user_test123',
        email: 'test@example.com',
        target_role: 'Software Engineer',
        skills: ['TypeScript', 'React'],
        years_experience: 5,
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-01-01T00:00:00Z'),
      };

      vi.mocked(query).mockResolvedValue({ rows: [mockRow], rowCount: 1 } as never);

      const event = createEvent({ httpMethod: 'GET' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.profile.targetRole).toBe('Software Engineer');
      expect(body.profile.skills).toEqual(['TypeScript', 'React']);
      expect(body.profile.yearsExperience).toBe(5);
    });

    it('should return 404 when profile not found', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

      const event = createEvent({ httpMethod: 'GET' });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.NotFound);
    });

    it('should return 401 when clerk_user_id is missing', async () => {
      const event = createEvent({
        httpMethod: 'GET',
        requestContext: {
          authorizer: {},
        } as APIGatewayProxyEvent['requestContext'],
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.Unauthorized);
    });
  });

  describe('POST /api/profile', () => {
    it('should return 201 when profile is created successfully', async () => {
      const mockRow = {
        id: 'uuid-new',
        clerk_user_id: 'user_test123',
        email: '',
        target_role: 'Backend Developer',
        skills: ['Node.js', 'PostgreSQL'],
        years_experience: 3,
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-01-01T00:00:00Z'),
      };

      vi.mocked(query).mockResolvedValue({ rows: [mockRow], rowCount: 1 } as never);

      const event = createEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          targetRole: 'Backend Developer',
          skills: ['Node.js', 'PostgreSQL'],
          yearsExperience: 3,
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.profile.targetRole).toBe('Backend Developer');
    });

    it('should return 400 when targetRole is empty', async () => {
      const event = createEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          targetRole: '',
          skills: [],
          yearsExperience: 0,
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
    });

    it('should return 400 when targetRole is whitespace only', async () => {
      const event = createEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          targetRole: '   \t  ',
          skills: [],
          yearsExperience: 0,
        }),
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

    it('should return 409 when profile already exists', async () => {
      vi.mocked(query).mockRejectedValue({ code: '23505' });

      const event = createEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          targetRole: 'Engineer',
          skills: [],
          yearsExperience: 1,
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.Conflict);
    });
  });

  describe('PUT /api/profile', () => {
    it('should return 200 when profile is updated', async () => {
      const mockRow = {
        id: 'uuid-1',
        clerk_user_id: 'user_test123',
        email: 'test@example.com',
        target_role: 'Senior Engineer',
        skills: ['TypeScript', 'AWS'],
        years_experience: 7,
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-06-01T00:00:00Z'),
      };

      vi.mocked(query).mockResolvedValue({ rows: [mockRow], rowCount: 1 } as never);

      const event = createEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({
          targetRole: 'Senior Engineer',
          skills: ['TypeScript', 'AWS'],
          yearsExperience: 7,
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.profile.targetRole).toBe('Senior Engineer');
      expect(body.profile.yearsExperience).toBe(7);
    });

    it('should return 400 when targetRole is whitespace on update', async () => {
      const event = createEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({
          targetRole: '   ',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.ValidationFailed);
    });

    it('should return 400 when no valid fields are provided', async () => {
      const event = createEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({}),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.InvalidInput);
    });

    it('should return 404 when profile does not exist for update', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

      const event = createEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({
          targetRole: 'Manager',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(ErrorCode.NotFound);
    });

    it('should allow partial updates (skills only)', async () => {
      const mockRow = {
        id: 'uuid-1',
        clerk_user_id: 'user_test123',
        email: 'test@example.com',
        target_role: 'Engineer',
        skills: ['Python', 'ML'],
        years_experience: 5,
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-06-01T00:00:00Z'),
      };

      vi.mocked(query).mockResolvedValue({ rows: [mockRow], rowCount: 1 } as never);

      const event = createEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({
          skills: ['Python', 'ML'],
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.profile.skills).toEqual(['Python', 'ML']);
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
