import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateAverageScore, calculateConfidenceImprovement } from '@backend/handlers/confidence';
import type { ConfidenceResponse } from '@shared/types/confidence';

/**
 * Feature: ai-interview-coach
 * Property 10: Confidence improvement equals post minus pre average
 *
 * For any pre-session and post-session arrays of 4 scores each in [1,5],
 * the confidence improvement must equal (average of post) - (average of pre).
 *
 * Validates: Requirements 10.3
 */

/**
 * Generator for a single confidence response with score in [1,5].
 */
const arbitraryConfidenceResponse = (index: number): fc.Arbitrary<ConfidenceResponse> =>
  fc.integer({ min: 1, max: 5 }).map((score) => ({
    statementIndex: index,
    score,
  }));

/**
 * Generator for an array of exactly 4 confidence responses with scores in [1,5].
 */
const arbitraryResponses: fc.Arbitrary<ConfidenceResponse[]> = fc.tuple(
  arbitraryConfidenceResponse(0),
  arbitraryConfidenceResponse(1),
  arbitraryConfidenceResponse(2),
  arbitraryConfidenceResponse(3)
).map(([r0, r1, r2, r3]) => [r0, r1, r2, r3]);

describe('Property 10: Confidence improvement equals post minus pre average', () => {
  it('improvement equals (average of post) - (average of pre)', () => {
    fc.assert(
      fc.property(
        arbitraryResponses,
        arbitraryResponses,
        (preResponses, postResponses) => {
          // Calculate averages using the handler functions
          const preAverage = calculateAverageScore(preResponses);
          const postAverage = calculateAverageScore(postResponses);

          // Calculate improvement using the handler function
          const improvement = calculateConfidenceImprovement(preAverage, postAverage);

          // Independently compute expected values
          const expectedPreAverage =
            preResponses.reduce((sum, r) => sum + r.score, 0) / 4;
          const expectedPostAverage =
            postResponses.reduce((sum, r) => sum + r.score, 0) / 4;
          const expectedImprovement = expectedPostAverage - expectedPreAverage;

          // Assert: improvement equals (average of post) - (average of pre)
          expect(improvement).toBeCloseTo(expectedImprovement, 10);
          expect(preAverage).toBeCloseTo(expectedPreAverage, 10);
          expect(postAverage).toBeCloseTo(expectedPostAverage, 10);
        }
      ),
      { numRuns: 100 }
    );
  });
});
