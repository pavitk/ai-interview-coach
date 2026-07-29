import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { compareSessionScores } from '@backend/handlers/analytics';
import type { EvaluationScores } from '@shared/types/evaluation';

/**
 * Feature: ai-interview-coach
 * Property 13: Session comparison produces correct per-dimension differences
 *
 * For any two evaluation score sets (each with 4 dimension scores in [1,5]),
 * the comparison function should produce differences where each dimension
 * difference equals (session2 score - session1 score) for that dimension.
 *
 * Validates: Requirements 9.3
 */

/**
 * Generator for a valid EvaluationScores object with each dimension score in [1,5].
 */
const arbitraryEvaluationScores: fc.Arbitrary<EvaluationScores> = fc.record({
  contentRelevance: fc.integer({ min: 1, max: 5 }),
  structureOrganization: fc.integer({ min: 1, max: 5 }),
  technicalAccuracy: fc.integer({ min: 1, max: 5 }),
  communicationClarity: fc.integer({ min: 1, max: 5 }),
});

describe('Property 13: Session comparison produces correct per-dimension differences', () => {
  it('each dimension difference equals (session2 score - session1 score)', () => {
    fc.assert(
      fc.property(
        arbitraryEvaluationScores,
        arbitraryEvaluationScores,
        (session1Scores, session2Scores) => {
          const differences = compareSessionScores(session1Scores, session2Scores);

          // Assert: each dimension difference equals session2 - session1
          expect(differences.contentRelevance).toBe(
            session2Scores.contentRelevance - session1Scores.contentRelevance
          );
          expect(differences.structureOrganization).toBe(
            session2Scores.structureOrganization - session1Scores.structureOrganization
          );
          expect(differences.technicalAccuracy).toBe(
            session2Scores.technicalAccuracy - session1Scores.technicalAccuracy
          );
          expect(differences.communicationClarity).toBe(
            session2Scores.communicationClarity - session1Scores.communicationClarity
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
