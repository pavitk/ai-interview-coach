import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateLowScoreSuggestions, DIMENSION_KEYS } from '@backend/utils/feedback';
import type { EvaluationScores, EvaluationFeedback, DimensionFeedback } from '@shared/types/evaluation';

/**
 * Feature: ai-interview-coach
 * Property 11: Low scores require improvement suggestions
 *
 * For any evaluation result where a dimension score is 3 or below,
 * the feedback for that dimension must contain at least one non-empty
 * improvement suggestion string.
 *
 * Validates: Requirements 11.2
 */

/**
 * Generator for a non-empty suggestion string (at least 1 non-whitespace character).
 */
const arbitraryNonEmptySuggestion: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => s.trim().length > 0);

/**
 * Generator for a non-empty suggestions array (at least one non-empty suggestion).
 */
const arbitraryNonEmptySuggestions: fc.Arbitrary<string[]> = fc
  .array(arbitraryNonEmptySuggestion, { minLength: 1, maxLength: 5 });

/**
 * Generator for dimension feedback with at least one non-empty suggestion.
 */
const arbitraryDimensionFeedbackWithSuggestions: fc.Arbitrary<DimensionFeedback> = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 200 }),
    arbitraryNonEmptySuggestions
  )
  .map(([text, suggestions]) => ({ text, suggestions }));

/**
 * Generator for dimension feedback that may or may not have suggestions (for high-scoring dims).
 */
const arbitraryDimensionFeedback: fc.Arbitrary<DimensionFeedback> = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 200 }),
    fc.array(fc.string({ maxLength: 200 }), { minLength: 0, maxLength: 5 })
  )
  .map(([text, suggestions]) => ({ text, suggestions }));

/**
 * Generator for evaluation scores where at least one dimension is ≤ 3.
 * Each score is an integer in [1, 3] for low-scoring dimensions.
 */
const arbitraryLowScore: fc.Arbitrary<number> = fc.integer({ min: 1, max: 3 });

/**
 * Generator for any valid score in [1, 5].
 */
const arbitraryScore: fc.Arbitrary<number> = fc.integer({ min: 1, max: 5 });

describe('Property 11: Low scores require improvement suggestions', { timeout: 60000 }, () => {
  it('valid: feedback with non-empty suggestions for low-scoring dimensions returns true', () => {
    fc.assert(
      fc.property(
        // Generate 4 scores, ensuring at least one is ≤ 3
        fc.tuple(arbitraryLowScore, arbitraryScore, arbitraryScore, arbitraryScore)
          .chain(([s1, s2, s3, s4]) => {
            // Randomly shuffle which dimension gets the guaranteed low score
            return fc.shuffledSubarray([0, 1, 2, 3], { minLength: 4, maxLength: 4 })
              .map((indices) => {
                const scores = [s1, s2, s3, s4];
                const reordered: number[] = [0, 0, 0, 0];
                indices.forEach((origIdx, newIdx) => {
                  reordered[newIdx] = scores[origIdx];
                });
                return reordered;
              });
          }),
        (scoreArray) => {
          const scores: EvaluationScores = {
            contentRelevance: scoreArray[0],
            structureOrganization: scoreArray[1],
            technicalAccuracy: scoreArray[2],
            communicationClarity: scoreArray[3],
          };

          // Build feedback: low-scoring dimensions get non-empty suggestions
          const feedback: EvaluationFeedback = {
            contentRelevance: {
              text: 'Feedback text',
              suggestions: scores.contentRelevance <= 3
                ? ['Improve your content relevance by adding more specific examples.']
                : [],
            },
            structureOrganization: {
              text: 'Feedback text',
              suggestions: scores.structureOrganization <= 3
                ? ['Consider using the STAR method to structure your response.']
                : [],
            },
            technicalAccuracy: {
              text: 'Feedback text',
              suggestions: scores.technicalAccuracy <= 3
                ? ['Review the core technical concepts related to this topic.']
                : [],
            },
            communicationClarity: {
              text: 'Feedback text',
              suggestions: scores.communicationClarity <= 3
                ? ['Try to be more concise and avoid filler words.']
                : [],
            },
          };

          // Should return true since all low-scoring dimensions have suggestions
          expect(validateLowScoreSuggestions(scores, feedback)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('invalid: feedback missing suggestions for low-scoring dimensions returns false', () => {
    fc.assert(
      fc.property(
        // Generate scores where at least one dimension is ≤ 3
        fc.tuple(arbitraryLowScore, arbitraryScore, arbitraryScore, arbitraryScore),
        ([lowScore, s2, s3, s4]) => {
          const scores: EvaluationScores = {
            contentRelevance: lowScore, // guaranteed ≤ 3
            structureOrganization: s2,
            technicalAccuracy: s3,
            communicationClarity: s4,
          };

          // Deliberately omit suggestions for the low-scoring dimension
          const feedback: EvaluationFeedback = {
            contentRelevance: { text: 'Some feedback', suggestions: [] }, // empty suggestions for low score
            structureOrganization: {
              text: 'Feedback text',
              suggestions: scores.structureOrganization <= 3
                ? ['Some suggestion.']
                : [],
            },
            technicalAccuracy: {
              text: 'Feedback text',
              suggestions: scores.technicalAccuracy <= 3
                ? ['Some suggestion.']
                : [],
            },
            communicationClarity: {
              text: 'Feedback text',
              suggestions: scores.communicationClarity <= 3
                ? ['Some suggestion.']
                : [],
            },
          };

          // Should return false because contentRelevance scored ≤ 3 but has no suggestions
          expect(validateLowScoreSuggestions(scores, feedback)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('invalid: whitespace-only suggestions for low-scoring dimensions returns false', () => {
    fc.assert(
      fc.property(
        arbitraryLowScore,
        fc.array(
          fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r')),
          { minLength: 1, maxLength: 3 }
        ),
        (lowScore, whitespaceSuggestions) => {
          const scores: EvaluationScores = {
            contentRelevance: lowScore, // guaranteed ≤ 3
            structureOrganization: 5,
            technicalAccuracy: 5,
            communicationClarity: 5,
          };

          // Suggestions are all whitespace-only strings
          const feedback: EvaluationFeedback = {
            contentRelevance: { text: 'Feedback', suggestions: whitespaceSuggestions },
            structureOrganization: { text: 'Good', suggestions: [] },
            technicalAccuracy: { text: 'Good', suggestions: [] },
            communicationClarity: { text: 'Good', suggestions: [] },
          };

          // Should return false because whitespace-only strings are not valid suggestions
          expect(validateLowScoreSuggestions(scores, feedback)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('valid: high-scoring dimensions (> 3) do not require suggestions', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 4, max: 5 }),
          fc.integer({ min: 4, max: 5 }),
          fc.integer({ min: 4, max: 5 }),
          fc.integer({ min: 4, max: 5 })
        ),
        ([s1, s2, s3, s4]) => {
          const scores: EvaluationScores = {
            contentRelevance: s1,
            structureOrganization: s2,
            technicalAccuracy: s3,
            communicationClarity: s4,
          };

          // No suggestions needed for high-scoring dimensions
          const feedback: EvaluationFeedback = {
            contentRelevance: { text: 'Great', suggestions: [] },
            structureOrganization: { text: 'Excellent', suggestions: [] },
            technicalAccuracy: { text: 'Accurate', suggestions: [] },
            communicationClarity: { text: 'Clear', suggestions: [] },
          };

          // Should return true since no dimensions scored ≤ 3
          expect(validateLowScoreSuggestions(scores, feedback)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
