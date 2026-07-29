import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getTop3ImprovementAreas, DIMENSION_KEYS, DIMENSION_LABELS } from '@backend/utils/feedback';
import type { EvaluationEntry } from '@backend/utils/feedback';
import type { EvaluationScores, EvaluationFeedback } from '@shared/types/evaluation';

/**
 * Feature: ai-interview-coach
 * Property 12: Top 3 improvement areas are lowest-scoring dimensions
 *
 * For any collection of per-question evaluations within a session,
 * the top 3 improvement areas should correspond to the 3 dimensions
 * with the lowest average scores across all questions in the session.
 *
 * Validates: Requirements 11.3
 */

/**
 * Generator for valid EvaluationScores with each dimension score in [1, 5].
 */
const arbitraryEvaluationScores: fc.Arbitrary<EvaluationScores> = fc
  .tuple(
    fc.integer({ min: 1, max: 5 }),
    fc.integer({ min: 1, max: 5 }),
    fc.integer({ min: 1, max: 5 }),
    fc.integer({ min: 1, max: 5 })
  )
  .map(([cr, so, ta, cc]) => ({
    contentRelevance: cr,
    structureOrganization: so,
    technicalAccuracy: ta,
    communicationClarity: cc,
  }));

/**
 * Generator for valid EvaluationFeedback with non-empty suggestions.
 */
const arbitraryEvaluationFeedback: fc.Arbitrary<EvaluationFeedback> = fc
  .tuple(
    fc.string({ minLength: 1 }),
    fc.string({ minLength: 1 }),
    fc.string({ minLength: 1 }),
    fc.string({ minLength: 1 })
  )
  .map(([t1, t2, t3, t4]) => ({
    contentRelevance: { text: t1, suggestions: [t1] },
    structureOrganization: { text: t2, suggestions: [t2] },
    technicalAccuracy: { text: t3, suggestions: [t3] },
    communicationClarity: { text: t4, suggestions: [t4] },
  }));

/**
 * Generator for a single EvaluationEntry.
 */
const arbitraryEvaluationEntry: fc.Arbitrary<EvaluationEntry> = fc
  .tuple(arbitraryEvaluationScores, arbitraryEvaluationFeedback)
  .map(([scores, feedback]) => ({ scores, feedback }));

/**
 * Generator for a non-empty array of EvaluationEntry objects (1 to 10 entries).
 */
const arbitraryEvaluations: fc.Arbitrary<EvaluationEntry[]> = fc.array(
  arbitraryEvaluationEntry,
  { minLength: 1, maxLength: 10 }
);

describe('Property 12: Top 3 improvement areas are lowest-scoring dimensions', () => {
  it('top 3 areas correspond to 3 dimensions with lowest average scores', () => {
    fc.assert(
      fc.property(arbitraryEvaluations, (evaluations) => {
        const result = getTop3ImprovementAreas(evaluations);

        // Independently compute average scores per dimension
        const averages = DIMENSION_KEYS.map((dim) => {
          const total = evaluations.reduce((sum, entry) => sum + entry.scores[dim], 0);
          const avg = Math.round((total / evaluations.length) * 100) / 100;
          return { dimension: dim, label: DIMENSION_LABELS[dim], averageScore: avg };
        });

        // Sort by average ascending, ties broken by DIMENSION_KEYS order (stable sort)
        averages.sort((a, b) => a.averageScore - b.averageScore);

        const expectedTop3 = averages.slice(0, 3);

        // Assert: result length is 3 (since we have 4 dimensions and non-empty evaluations)
        expect(result).toHaveLength(3);

        // Assert: returned areas match expected lowest 3
        for (let i = 0; i < 3; i++) {
          expect(result[i].dimension).toBe(expectedTop3[i].dimension);
          expect(result[i].label).toBe(expectedTop3[i].label);
          expect(result[i].averageScore).toBeCloseTo(expectedTop3[i].averageScore, 10);
        }
      }),
      { numRuns: 100 }
    );
  });
});
