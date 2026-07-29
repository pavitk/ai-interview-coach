import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseEvaluationResponse } from '@backend/handlers/evaluation';

/**
 * Feature: ai-interview-coach
 * Property 4: Evaluation response parsing and validation
 *
 * For any valid evaluation JSON containing four dimension scores each in [1,5] and
 * textual feedback strings for each dimension, the parser should produce a valid
 * Evaluation object with matching scores and feedback. For any JSON where any score
 * is outside [1,5] or any dimension feedback is missing, the parser should signal
 * a validation error.
 *
 * Validates: Requirements 6.2, 6.3, 11.1
 */

const dimensions = [
  'contentRelevance',
  'structureOrganization',
  'technicalAccuracy',
  'communicationClarity',
] as const;

/**
 * Generator for a valid dimension score (integer in [1,5]).
 */
const arbitraryDimensionScore = fc.integer({ min: 1, max: 5 });

/**
 * Generator for valid evaluation scores object.
 */
const arbitraryValidScores = fc.record({
  contentRelevance: arbitraryDimensionScore,
  structureOrganization: arbitraryDimensionScore,
  technicalAccuracy: arbitraryDimensionScore,
  communicationClarity: arbitraryDimensionScore,
});

/**
 * Generator for a non-empty feedback text string.
 */
const arbitraryFeedbackText = fc.string({ minLength: 1, maxLength: 200 });

/**
 * Generator for a non-empty suggestion string (at least one non-whitespace character).
 */
const arbitraryNonEmptySuggestion = fc.string({ minLength: 1, maxLength: 100 }).filter(
  (s) => s.trim().length > 0
);

/**
 * Generator for an array of suggestion strings (may be empty, for high-scoring dimensions).
 */
const arbitrarySuggestions = fc.array(fc.string({ minLength: 0, maxLength: 100 }), {
  minLength: 0,
  maxLength: 5,
});

/**
 * Generator for suggestions that contain at least one non-empty string
 * (required for dimensions scoring ≤ 3 per Requirement 11.2).
 */
const arbitraryNonEmptySuggestions = fc
  .tuple(
    arbitraryNonEmptySuggestion,
    fc.array(fc.string({ minLength: 0, maxLength: 100 }), { minLength: 0, maxLength: 4 })
  )
  .map(([required, rest]) => [required, ...rest]);

/**
 * Generator for a valid dimension feedback entry given the dimension's score.
 * When score ≤ 3, suggestions must have at least one non-empty string.
 */
function arbitraryDimensionFeedbackForScore(score: number) {
  const suggestions = score <= 3 ? arbitraryNonEmptySuggestions : arbitrarySuggestions;
  return fc.record({
    text: arbitraryFeedbackText,
    suggestions,
  });
}

/**
 * Generator for a complete valid evaluation JSON string.
 * Ensures that dimensions with scores ≤ 3 have at least one non-empty suggestion
 * (Requirement 11.2 compliance).
 */
const arbitraryValidEvaluationJSON = arbitraryValidScores
  .chain((scores) =>
    fc
      .record({
        contentRelevance: arbitraryDimensionFeedbackForScore(scores.contentRelevance),
        structureOrganization: arbitraryDimensionFeedbackForScore(scores.structureOrganization),
        technicalAccuracy: arbitraryDimensionFeedbackForScore(scores.technicalAccuracy),
        communicationClarity: arbitraryDimensionFeedbackForScore(scores.communicationClarity),
      })
      .map((feedback) => ({ scores, feedback }))
  )
  .map((obj) => JSON.stringify(obj));

/**
 * Generator for a score outside the valid range [1,5].
 */
const arbitraryInvalidScore = fc.oneof(
  fc.integer({ min: -100, max: 0 }),
  fc.integer({ min: 6, max: 100 }),
  fc.double({ min: 1.1, max: 4.9 }).filter((n) => !Number.isInteger(n))
);

/**
 * Generator for a valid feedback object that satisfies Requirement 11.2
 * (low-scoring dimensions have non-empty suggestions).
 * Used by invalid-score and missing-feedback generators where we need structurally valid feedback.
 */
const arbitraryValidFeedbackForScores = (scores: {
  contentRelevance: number;
  structureOrganization: number;
  technicalAccuracy: number;
  communicationClarity: number;
}) =>
  fc.record({
    contentRelevance: arbitraryDimensionFeedbackForScore(scores.contentRelevance),
    structureOrganization: arbitraryDimensionFeedbackForScore(scores.structureOrganization),
    technicalAccuracy: arbitraryDimensionFeedbackForScore(scores.technicalAccuracy),
    communicationClarity: arbitraryDimensionFeedbackForScore(scores.communicationClarity),
  });

/**
 * Generator for invalid evaluation JSON with at least one score outside [1,5].
 */
const arbitraryInvalidScoreJSON = fc
  .record({
    scores: arbitraryValidScores,
    invalidDimension: fc.constantFrom(...dimensions),
    invalidValue: arbitraryInvalidScore,
  })
  .chain(({ scores, invalidDimension, invalidValue }) =>
    arbitraryValidFeedbackForScores(scores).map((feedback) => {
      const invalidScores = { ...scores, [invalidDimension]: invalidValue };
      return JSON.stringify({ scores: invalidScores, feedback });
    })
  );

/**
 * Generator for invalid evaluation JSON with missing feedback for a dimension.
 */
const arbitraryMissingFeedbackJSON = fc
  .record({
    scores: arbitraryValidScores,
    missingDimension: fc.constantFrom(...dimensions),
  })
  .chain(({ scores, missingDimension }) =>
    arbitraryValidFeedbackForScores(scores).map((feedback) => {
      const incompleteFeedback: Record<string, unknown> = { ...feedback };
      delete incompleteFeedback[missingDimension];
      return JSON.stringify({ scores, feedback: incompleteFeedback });
    })
  );

describe('Property 4: Evaluation response parsing and validation', () => {
  it('valid evaluation JSON with 4 scores in [1,5] and feedback strings produces valid parse', () => {
    fc.assert(
      fc.property(arbitraryValidEvaluationJSON, (jsonString) => {
        const result = parseEvaluationResponse(jsonString);

        // Should successfully parse
        expect(result).not.toBeNull();

        const parsed = JSON.parse(jsonString);

        // Verify scores match
        expect(result!.scores.contentRelevance).toBe(parsed.scores.contentRelevance);
        expect(result!.scores.structureOrganization).toBe(parsed.scores.structureOrganization);
        expect(result!.scores.technicalAccuracy).toBe(parsed.scores.technicalAccuracy);
        expect(result!.scores.communicationClarity).toBe(parsed.scores.communicationClarity);

        // Verify all scores are integers in [1,5]
        for (const dim of dimensions) {
          const score = result!.scores[dim];
          expect(score).toBeGreaterThanOrEqual(1);
          expect(score).toBeLessThanOrEqual(5);
          expect(Number.isInteger(score)).toBe(true);
        }

        // Verify feedback matches
        for (const dim of dimensions) {
          expect(result!.feedback[dim].text).toBe(parsed.feedback[dim].text);
          expect(result!.feedback[dim].suggestions).toEqual(parsed.feedback[dim].suggestions);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('invalid JSON with scores outside [1,5] produces validation error (null)', () => {
    fc.assert(
      fc.property(arbitraryInvalidScoreJSON, (jsonString) => {
        const result = parseEvaluationResponse(jsonString);

        // Should return null for invalid scores
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('invalid JSON with missing dimension feedback produces validation error (null)', () => {
    fc.assert(
      fc.property(arbitraryMissingFeedbackJSON, (jsonString) => {
        const result = parseEvaluationResponse(jsonString);

        // Should return null for missing feedback
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});
