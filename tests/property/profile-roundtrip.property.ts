import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Feature: ai-interview-coach
 * Property 1: Profile data round-trip
 *
 * For any valid user profile (containing non-empty target role, arbitrary skills list,
 * and years of experience ≥ 0), storing the profile and then retrieving it should
 * produce an object equal to the original profile data.
 *
 * Validates: Requirements 2.1, 2.2
 */

// Mock the database module before importing the handler
vi.mock('@backend/utils/db', () => {
  return {
    query: vi.fn(),
    getPool: vi.fn(),
    closePool: vi.fn(),
  };
});

import { handler } from '@backend/handlers/profile';
import { query } from '@backend/utils/db';

const mockedQuery = vi.mocked(query);

/**
 * Generator for non-empty target role strings (at least one non-whitespace character).
 */
const arbitraryTargetRole = fc
  .string({ minLength: 1 })
  .filter((s) => s.trim().length > 0);

/**
 * Generator for skills arrays (array of strings).
 */
const arbitrarySkills = fc.array(fc.string(), { maxLength: 10 });

/**
 * Generator for years of experience (integer >= 0).
 */
const arbitraryYearsExperience = fc.nat({ max: 50 });

/**
 * Generator for a valid profile input.
 */
const arbitraryProfile = fc.record({
  targetRole: arbitraryTargetRole,
  skills: arbitrarySkills,
  yearsExperience: arbitraryYearsExperience,
});

/**
 * Helper to create an APIGatewayProxyEvent for POST requests.
 */
function createPostEvent(body: object, clerkUserId: string): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/api/profile',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      authorizer: { clerk_user_id: clerkUserId },
      accountId: '',
      apiId: '',
      httpMethod: 'POST',
      identity: {} as any,
      path: '/api/profile',
      protocol: 'HTTP/1.1',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: '',
      resourcePath: '/api/profile',
      stage: 'test',
    },
  } as APIGatewayProxyEvent;
}

/**
 * Helper to create an APIGatewayProxyEvent for GET requests.
 */
function createGetEvent(clerkUserId: string): APIGatewayProxyEvent {
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
    resource: '',
    requestContext: {
      authorizer: { clerk_user_id: clerkUserId },
      accountId: '',
      apiId: '',
      httpMethod: 'GET',
      identity: {} as any,
      path: '/api/profile',
      protocol: 'HTTP/1.1',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: '',
      resourcePath: '/api/profile',
      stage: 'test',
    },
  } as APIGatewayProxyEvent;
}

describe('Property 1: Profile data round-trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('store then retrieve produces object equal to original', async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryProfile, async (profileInput) => {
        // In-memory store to simulate database for this iteration
        let storedRow: any = null;
        const clerkUserId = 'test-user-123';
        const profileId = 'generated-uuid-001';
        const now = new Date().toISOString();

        // Mock the query function to simulate database behavior
        mockedQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
          if (sql.includes('INSERT INTO users')) {
            storedRow = {
              id: profileId,
              clerk_user_id: params![0] as string,
              email: params![1] as string,
              target_role: params![2] as string,
              skills: params![3] as string[],
              years_experience: params![4] as number,
              created_at: now,
              updated_at: now,
            };
            return { rows: [storedRow], rowCount: 1, command: 'INSERT', oid: 0, fields: [] } as any;
          }

          if (sql.includes('SELECT') && sql.includes('FROM users')) {
            return { rows: storedRow ? [storedRow] : [], rowCount: storedRow ? 1 : 0, command: 'SELECT', oid: 0, fields: [] } as any;
          }

          return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as any;
        });

        // Step 1: Store profile via POST
        const postEvent = createPostEvent(profileInput, clerkUserId);
        const postResult = await handler(postEvent);

        expect(postResult.statusCode).toBe(201);
        const postBody = JSON.parse(postResult.body);
        expect(postBody.profile).toBeDefined();

        // Step 2: Retrieve profile via GET
        const getEvent = createGetEvent(clerkUserId);
        const getResult = await handler(getEvent);

        expect(getResult.statusCode).toBe(200);
        const getBody = JSON.parse(getResult.body);
        expect(getBody.profile).toBeDefined();

        const storedProfile = postBody.profile;
        const retrievedProfile = getBody.profile;

        // Assert round-trip: targetRole is trimmed, skills and yearsExperience preserved
        expect(retrievedProfile.targetRole).toBe(profileInput.targetRole.trim());
        expect(storedProfile.targetRole).toBe(retrievedProfile.targetRole);
        expect(retrievedProfile.skills).toEqual(profileInput.skills);
        expect(storedProfile.skills).toEqual(retrievedProfile.skills);
        expect(retrievedProfile.yearsExperience).toBe(profileInput.yearsExperience);
        expect(storedProfile.yearsExperience).toBe(retrievedProfile.yearsExperience);

        // Full profile object equality between store and retrieve
        expect(retrievedProfile).toEqual(storedProfile);
      }),
      { numRuns: 100 }
    );
  });
});
