import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { transformScoresToRadarData } from '@frontend/components/RadarChart';
import type { EvaluationScores } from '@shared/types/evaluation';

/**
 * Feature: ai-interview-coach
 * Property 7: Radar chart data contains all dimension labels and values
 *
 * For any valid evaluation with four dimension scores, the radar chart data transformation
 * should produce exactly 4 data points, each containing the dimension name label and
 * the corresponding numeric score value.
 *
 * Validates: Requirements 7.2
 */

/** Expected dimension keys in order. */
const EXPECTED_DIMENSIONS: (keyof EvaluationScores)[] = [
  'contentRelevance',
  'structureOrganization',
  'technicalAccuracy',
  'communicationClarity',
];

/** Expected human-readable labels for each dimension. */
const EXPECTED_LABELS: Record<keyof EvaluationScores, string> = {
  contentRelevance: 'Content Relevance',
  structureOrganization: 'Structure & Organization',
  technicalAccuracy: 'Technical Accuracy',
  communicationClarity: 'Communication Clarity',
};

/**
 * Generator for a single dimension score: integer in [1, 5].
 */
const arbitraryDimensionScore = fc.integer({ min: 1, max: 5 });

/**
 * Generator for valid evaluation scores: 4 integer scores each in [1, 5].
 */
const arbitraryEvaluationScores: fc.Arbitrary<EvaluationScores> = fc.record({
  contentRelevance: arbitraryDimensionScore,
  structureOrganization: arbitraryDimensionScore,
  technicalAccuracy: arbitraryDimensionScore,
  communicationClarity: arbitraryDimensionScore,
});

describe('Property 7: Radar chart data contains all dimension labels and values', () => {
  it('transformation produces exactly 4 data points with correct labels and values', () => {
    fc.assert(
      fc.property(arbitraryEvaluationScores, (scores) => {
        const result = transformScoresToRadarData(scores);

        // Assert exactly 4 data points
        expect(result).toHaveLength(4);

        // Assert each data point has the correct dimension key, label, and score value
        EXPECTED_DIMENSIONS.forEach((dimensionKey, index) => {
          const point = result[index];

          expect(point.dimension).toBe(dimensionKey);
          expect(point.label).toBe(EXPECTED_LABELS[dimensionKey]);
          expect(point['score']).toBe(scores[dimensionKey]);
        });
      }),
      { numRuns: 100 }
    );
  });

  it('transformation with custom valueKey produces data points with that key', () => {
    fc.assert(
      fc.property(
        arbitraryEvaluationScores,
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0 && s !== 'dimension' && s !== 'label'),
        (scores, valueKey) => {
          const result = transformScoresToRadarData(scores, valueKey);

          // Assert exactly 4 data points
          expect(result).toHaveLength(4);

          // Assert each data point uses the custom valueKey
          EXPECTED_DIMENSIONS.forEach((dimensionKey, index) => {
            const point = result[index];

            expect(point.dimension).toBe(dimensionKey);
            expect(point.label).toBe(EXPECTED_LABELS[dimensionKey]);
            expect(point[valueKey]).toBe(scores[dimensionKey]);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
