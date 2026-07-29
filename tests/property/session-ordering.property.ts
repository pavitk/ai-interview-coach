import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Feature: ai-interview-coach
 * Property 9: Session history returns chronologically ordered results
 *
 * For any set of completed sessions with distinct timestamps, requesting session
 * history should return the sessions ordered by completion date (most recent first),
 * and the ordering should be a valid total order (transitive, antisymmetric).
 *
 * Validates: Requirements 8.2
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
 * Generator for non-empty trimmed strings.
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
 * Generator for distinct timestamps. Generates an array of unique Date objects
 * then converts to ISO strings.
 */
function arbitraryDistinctTimestamps(count: number) {
  return fc
    .uniqueArray(
      fc.integer({ min: 1704067200000, max: 1767225600000 }), // 2024-01-01 to 2025-12-31
      { minLength: count, maxLength: count, comparator: (a, b) => a === b }
    )
    .map((timestamps) => timestamps.map((ts) => new Date(ts).toISOString()));
}

/**
 * Generator for a session summary row as the DB would return it.
 */
function arbitrarySessionRow(completedAt: string) {
  return fc.record({
    id: arbitraryUuid,
    user_id: fc.constant('user-123'),
    company: arbitraryNonEmptyString,
    domain: arbitraryNonEmptyString,
    status: fc.constant(SessionStatus.Completed),
    overall_score: fc.double({ min: 1.0, max: 5.0, noNaN: true }),
    prompt_template_version: fc.constantFrom('1.0', '1.1', '2.0'),
    started_at: fc.constant(new Date(Date.parse(completedAt) - 3600000).toISOString()),
    completed_at: fc.constant(completedAt),
  });
}

/**
 * Generator for a set of session rows with distinct completedAt timestamps,
 * pre-sorted by the DB (most recent first) as the real SQL query would return them.
 */
const arbitrarySessionSet = fc
  .integer({ min: 2, max: 15 })
  .chain((count) =>
    arbitraryDistinctTimestamps(count).chain((timestamps) => {
      // Sort timestamps descending (most recent first) - as the DB ORDER BY would do
      const sortedTimestamps = [...timestamps].sort(
        (a, b) => Date.parse(b) - Date.parse(a)
      );
      // Generate a session row for each timestamp
      return fc.tuple(
        ...sortedTimestamps.map((ts) => arbitrarySessionRow(ts))
      );
    })
  );

// --- Helpers ---

function createListSessionsEvent(clerkUserId: string): APIGatewayProxyEvent {
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
      authorizer: { clerk_user_id: clerkUserId },
      accountId: '',
      apiId: '',
      httpMethod: 'GET',
      identity: {} as any,
      path: '/api/sessions',
      protocol: 'HTTP/1.1',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: '',
      resourcePath: '/api/sessions',
      stage: 'test',
    },
  } as APIGatewayProxyEvent;
}

describe('Property 9: Session history returns chronologically ordered results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returned list is ordered by completion date (most recent first) and forms a valid total order', async () => {
    await fc.assert(
      fc.asyncProperty(arbitrarySessionSet, async (sessionRows) => {
        const clerkUserId = 'clerk-user-test';
        const userId = 'user-123';

        // Mock the query function
        mockedQuery.mockImplementation(async (sql: string) => {
          // User lookup by clerk_user_id
          if (sql.includes('FROM users') && sql.includes('clerk_user_id')) {
            return {
              rows: [{ id: userId }],
              rowCount: 1,
              command: 'SELECT',
              oid: 0,
              fields: [],
            } as any;
          }

          // Session list query - return rows pre-sorted as DB would
          if (sql.includes('FROM sessions') && sql.includes('ORDER BY')) {
            return {
              rows: sessionRows,
              rowCount: sessionRows.length,
              command: 'SELECT',
              oid: 0,
              fields: [],
            } as any;
          }

          return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] } as any;
        });

        // Call the handler
        const event = createListSessionsEvent(clerkUserId);
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        const sessions = body.sessions;

        // Verify we got all sessions back
        expect(sessions).toHaveLength(sessionRows.length);

        // Property: sessions are ordered by completedAt descending (most recent first)
        for (let i = 0; i < sessions.length - 1; i++) {
          const currentCompletedAt = Date.parse(sessions[i].completedAt);
          const nextCompletedAt = Date.parse(sessions[i + 1].completedAt);

          // Most recent first: current >= next
          expect(currentCompletedAt).toBeGreaterThan(nextCompletedAt);
        }

        // Property: Valid total order - antisymmetric
        // If a >= b and b >= a then a === b (guaranteed by distinct timestamps and strict ordering)
        // With distinct timestamps, we have strict ordering so a > b for all adjacent pairs

        // Property: Valid total order - transitive
        // If sessions[i] > sessions[j] and sessions[j] > sessions[k] then sessions[i] > sessions[k]
        // Verify transitivity by checking non-adjacent pairs
        for (let i = 0; i < sessions.length; i++) {
          for (let j = i + 1; j < sessions.length; j++) {
            const iTime = Date.parse(sessions[i].completedAt);
            const jTime = Date.parse(sessions[j].completedAt);
            expect(iTime).toBeGreaterThan(jTime);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
