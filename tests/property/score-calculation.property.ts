import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateOverallScore } from '@backend/handlers/evaluation';
import type { EvaluationScores } from '@shared/types/evaluation';

/**
 * Feature: ai-interview-coach
 * Property 5: Overall score is arithmetic mean of dimension scores
 *
 * For any four integer scores each in [1,5], the computed overall score should equal
 * (contentRelevance + structureOrganization + technicalAccuracy + communicationClarity) / 4,
 * with floating point precision to 2 decimal places.
 *
 * Validates: Requirements 6.4
 */

/**
 * Generator for a single dimension score: integer in [1, 5].
 */
const arbitraryDimensionScore = fc.integer({ min: 1, max: 5 });

/**
 * Generator for evaluation scores: 4 integer scores each in [1, 5].
 */
const arbitraryEvaluationScores: fc.Arbitrary<EvaluationScores> = fc.record({
  contentRelevance: arbitraryDimensionScore,
  structureOrganization: arbitraryDimensionScore,
  technicalAccuracy: arbitraryDimensionScore,
  communicationClarity: arbitraryDimensionScore,
});

describe('Property 5: Overall score is arithmetic mean of dimension scores', () => {
  it('overall_score equals (sum of scores) / 4 with precision to 2 decimal places', () => {
    fc.assert(
      fc.property(arbitraryEvaluationScores, (scores) => {
        const result = calculateOverallScore(scores);

        // Calculate expected arithmetic mean
        const sum =
          scores.contentRelevance +
          scores.structureOrganization +
          scores.technicalAccuracy +
          scores.communicationClarity;
        const expectedMean = Math.round((sum / 4) * 100) / 100;

        // Assert overall score equals arithmetic mean with 2 decimal place precision
        expect(result).toBeCloseTo(expectedMean, 2);

        // Assert the result is within valid range [1.0, 5.0]
        expect(result).toBeGreaterThanOrEqual(1.0);
        expect(result).toBeLessThanOrEqual(5.0);
      }),
      { numRuns: 100 }
    );
  });
});
