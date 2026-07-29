import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { retryEvaluation, parseEvaluationResponse } from '@backend/handlers/evaluation';
import type { EvaluationScores, EvaluationFeedback } from '@shared/types/evaluation';

/**
 * Feature: ai-interview-coach
 * Property 6: Retry logic exhausts attempts on invalid responses
 *
 * For any sequence of AI responses where some are invalid JSON and some are valid,
 * the retry logic should:
 * (a) return the first valid response encountered within 3 total attempts,
 * (b) make exactly N calls where N is min(3, index_of_first_valid + 1),
 * (c) fail with an error if all 3 attempts return invalid JSON.
 *
 * Validates: Requirements 6.7
 */

/**
 * Generator for a valid score integer in [1, 5].
 */
const arbitraryScore = fc.integer({ min: 1, max: 5 });

/**
 * Generator for a valid EvaluationScores object.
 */
const arbitraryEvaluationScores = fc.record({
  contentRelevance: arbitraryScore,
  structureOrganization: arbitraryScore,
  technicalAccuracy: arbitraryScore,
  communicationClarity: arbitraryScore,
});

/**
 * Generator for a single dimension feedback entry (for high-scoring dimensions, score > 3).
 */
const arbitraryDimensionFeedbackHighScore = fc.record({
  text: fc.string({ minLength: 1 }),
  suggestions: fc.array(fc.string({ minLength: 0 }), { minLength: 0, maxLength: 3 }),
});

/**
 * Generator for a single dimension feedback entry (for low-scoring dimensions, score ≤ 3).
 * Must have at least one non-empty suggestion (Requirement 11.2).
 */
const arbitraryDimensionFeedbackLowScore = fc
  .tuple(
    fc.string({ minLength: 1 }),
    fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
    fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 2 }),
  )
  .map(([text, requiredSuggestion, rest]) => ({
    text,
    suggestions: [requiredSuggestion, ...rest],
  }));

/**
 * Generator for dimension feedback appropriate for the given score.
 */
function arbitraryDimensionFeedbackForScore(score: number) {
  return score <= 3 ? arbitraryDimensionFeedbackLowScore : arbitraryDimensionFeedbackHighScore;
}

/**
 * Generator for a valid evaluation JSON string.
 * Ensures that low-scoring dimensions (≤ 3) have at least one non-empty suggestion.
 */
const arbitraryValidResponseJSON = arbitraryEvaluationScores.chain((scores) =>
  fc
    .record({
      contentRelevance: arbitraryDimensionFeedbackForScore(scores.contentRelevance),
      structureOrganization: arbitraryDimensionFeedbackForScore(scores.structureOrganization),
      technicalAccuracy: arbitraryDimensionFeedbackForScore(scores.technicalAccuracy),
      communicationClarity: arbitraryDimensionFeedbackForScore(scores.communicationClarity),
    })
    .map((feedback) => JSON.stringify({ scores, feedback }))
);

/**
 * Generator for an invalid evaluation response string.
 * Produces various flavors of invalid responses: malformed JSON, missing fields,
 * out-of-range scores, etc.
 */
const arbitraryInvalidResponse = fc.oneof(
  // Completely invalid JSON
  fc.string().filter((s) => {
    try {
      JSON.parse(s);
      return false;
    } catch {
      return true;
    }
  }),
  // Valid JSON but scores out of range (0 or 6+)
  fc.tuple(
    fc.integer({ min: 6, max: 100 }),
    arbitraryScore,
    arbitraryScore,
    arbitraryScore,
  ).map(([bad, s2, s3, s4]) =>
    JSON.stringify({
      scores: {
        contentRelevance: bad,
        structureOrganization: s2,
        technicalAccuracy: s3,
        communicationClarity: s4,
      },
      feedback: {
        contentRelevance: { text: 'x', suggestions: [] },
        structureOrganization: { text: 'x', suggestions: [] },
        technicalAccuracy: { text: 'x', suggestions: [] },
        communicationClarity: { text: 'x', suggestions: [] },
      },
    })
  ),
  // Valid JSON but missing feedback
  arbitraryEvaluationScores.map((scores) =>
    JSON.stringify({ scores })
  ),
  // Valid JSON but scores below range (0 or negative)
  fc.tuple(
    fc.integer({ min: -10, max: 0 }),
    arbitraryScore,
    arbitraryScore,
    arbitraryScore,
  ).map(([bad, s2, s3, s4]) =>
    JSON.stringify({
      scores: {
        contentRelevance: bad,
        structureOrganization: s2,
        technicalAccuracy: s3,
        communicationClarity: s4,
      },
      feedback: {
        contentRelevance: { text: 'x', suggestions: [] },
        structureOrganization: { text: 'x', suggestions: [] },
        technicalAccuracy: { text: 'x', suggestions: [] },
        communicationClarity: { text: 'x', suggestions: [] },
      },
    })
  ),
);

/**
 * Generates a sequence of exactly 3 responses, each either valid or invalid.
 * Returns the sequence and the index of the first valid response (or -1 if none).
 */
const arbitraryResponseSequence = fc
  .tuple(
    fc.oneof(arbitraryValidResponseJSON, arbitraryInvalidResponse),
    fc.oneof(arbitraryValidResponseJSON, arbitraryInvalidResponse),
    fc.oneof(arbitraryValidResponseJSON, arbitraryInvalidResponse),
  )
  .map((responses) => {
    const firstValidIndex = responses.findIndex(
      (r) => parseEvaluationResponse(r) !== null
    );
    return { responses, firstValidIndex };
  });

/**
 * Generator for sequences where at least one response is valid.
 * The valid response can appear at index 0, 1, or 2.
 */
const arbitrarySequenceWithValid = fc
  .tuple(
    fc.integer({ min: 0, max: 2 }), // index where valid response will be
    arbitraryValidResponseJSON,
    arbitraryInvalidResponse,
    arbitraryInvalidResponse,
  )
  .map(([validIndex, validResp, invalid1, invalid2]) => {
    const responses: string[] = [invalid1, invalid2, invalid1]; // fill with invalids
    responses[validIndex] = validResp;
    // Fill positions before validIndex with invalid responses
    const invalids = [invalid1, invalid2];
    for (let i = 0; i < 3; i++) {
      if (i < validIndex) {
        responses[i] = invalids[i % 2];
      } else if (i > validIndex) {
        responses[i] = invalids[i % 2];
      }
    }
    return { responses, firstValidIndex: validIndex };
  });

/**
 * Generator for sequences where ALL responses are invalid.
 */
const arbitraryAllInvalidSequence = fc
  .tuple(arbitraryInvalidResponse, arbitraryInvalidResponse, arbitraryInvalidResponse)
  .map((responses) => ({ responses, firstValidIndex: -1 }));

describe('Property 6: Retry logic exhausts attempts on invalid responses', () => {
  it('returns first valid response within 3 attempts and makes exactly N calls', async () => {
    await fc.assert(
      fc.asyncProperty(arbitrarySequenceWithValid, async ({ responses, firstValidIndex }) => {
        let callCount = 0;

        const caller = async (): Promise<string> => {
          const response = responses[callCount];
          callCount++;
          return response;
        };

        const result = await retryEvaluation(caller, { maxAttempts: 3, delayMs: 0 });

        // (a) Should return a valid parsed response
        expect(result).not.toBeNull();
        expect(result.scores).toBeDefined();
        expect(result.feedback).toBeDefined();

        // Verify returned result matches parsing the valid response
        const expected = parseEvaluationResponse(responses[firstValidIndex]);
        expect(result.scores).toEqual(expected!.scores);
        expect(result.feedback).toEqual(expected!.feedback);

        // (b) Should make exactly firstValidIndex + 1 calls
        const expectedCalls = firstValidIndex + 1;
        expect(callCount).toBe(expectedCalls);
      }),
      { numRuns: 100 }
    );
  });

  it('fails with error when all 3 attempts return invalid responses', async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryAllInvalidSequence, async ({ responses }) => {
        let callCount = 0;

        const caller = async (): Promise<string> => {
          const response = responses[callCount];
          callCount++;
          return response;
        };

        // (c) Should throw an error when all attempts are invalid
        await expect(
          retryEvaluation(caller, { maxAttempts: 3, delayMs: 0 })
        ).rejects.toThrow();

        // Should have made exactly 3 calls
        expect(callCount).toBe(3);
      }),
      { numRuns: 100 }
    );
  });

  it('makes exactly N calls where N is min(3, index_of_first_valid + 1) for mixed sequences', async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryResponseSequence, async ({ responses, firstValidIndex }) => {
        let callCount = 0;

        const caller = async (): Promise<string> => {
          const response = responses[callCount];
          callCount++;
          return response;
        };

        if (firstValidIndex === -1) {
          // All invalid: should throw and make exactly 3 calls
          await expect(
            retryEvaluation(caller, { maxAttempts: 3, delayMs: 0 })
          ).rejects.toThrow();
          expect(callCount).toBe(3);
        } else {
          // Has valid: should succeed and make exactly firstValidIndex + 1 calls
          const result = await retryEvaluation(caller, { maxAttempts: 3, delayMs: 0 });
          expect(result).not.toBeNull();
          expect(callCount).toBe(firstValidIndex + 1);
        }
      }),
      { numRuns: 100 }
    );
  });
});
