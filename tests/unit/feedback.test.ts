import { describe, it, expect } from 'vitest';
import {
  validateLowScoreSuggestions,
  generateSessionSummary,
  getTop3ImprovementAreas,
  EvaluationEntry,
  DIMENSION_KEYS,
} from '@backend/utils/feedback';
import { EvaluationScores, EvaluationFeedback } from '@ai-interview-coach/shared';

/**
 * Unit tests for feedback utility functions.
 * Requirements: 11.1, 11.2, 11.3
 */

describe('validateLowScoreSuggestions', () => {
  it('returns true when all dimensions score > 3 (no suggestions needed)', () => {
    const scores: EvaluationScores = {
      contentRelevance: 4,
      structureOrganization: 5,
      technicalAccuracy: 4,
      communicationClarity: 5,
    };
    const feedback: EvaluationFeedback = {
      contentRelevance: { text: 'Good', suggestions: [] },
      structureOrganization: { text: 'Great', suggestions: [] },
      technicalAccuracy: { text: 'Solid', suggestions: [] },
      communicationClarity: { text: 'Clear', suggestions: [] },
    };

    expect(validateLowScoreSuggestions(scores, feedback)).toBe(true);
  });

  it('returns true when score = 3 has a non-empty suggestion', () => {
    const scores: EvaluationScores = {
      contentRelevance: 3,
      structureOrganization: 4,
      technicalAccuracy: 5,
      communicationClarity: 4,
    };
    const feedback: EvaluationFeedback = {
      contentRelevance: { text: 'Adequate', suggestions: ['Add more examples'] },
      structureOrganization: { text: 'Good', suggestions: [] },
      technicalAccuracy: { text: 'Great', suggestions: [] },
      communicationClarity: { text: 'Clear', suggestions: [] },
    };

    expect(validateLowScoreSuggestions(scores, feedback)).toBe(true);
  });

  it('returns false when score ≤ 3 has no suggestions', () => {
    const scores: EvaluationScores = {
      contentRelevance: 2,
      structureOrganization: 4,
      technicalAccuracy: 5,
      communicationClarity: 4,
    };
    const feedback: EvaluationFeedback = {
      contentRelevance: { text: 'Weak', suggestions: [] },
      structureOrganization: { text: 'Good', suggestions: [] },
      technicalAccuracy: { text: 'Great', suggestions: [] },
      communicationClarity: { text: 'Clear', suggestions: [] },
    };

    expect(validateLowScoreSuggestions(scores, feedback)).toBe(false);
  });

  it('returns false when score ≤ 3 has only empty/whitespace suggestions', () => {
    const scores: EvaluationScores = {
      contentRelevance: 1,
      structureOrganization: 4,
      technicalAccuracy: 5,
      communicationClarity: 4,
    };
    const feedback: EvaluationFeedback = {
      contentRelevance: { text: 'Poor', suggestions: ['', '   ', '\t\n'] },
      structureOrganization: { text: 'Good', suggestions: [] },
      technicalAccuracy: { text: 'Great', suggestions: [] },
      communicationClarity: { text: 'Clear', suggestions: [] },
    };

    expect(validateLowScoreSuggestions(scores, feedback)).toBe(false);
  });

  it('returns false when multiple dimensions score ≤ 3 and one is missing suggestions', () => {
    const scores: EvaluationScores = {
      contentRelevance: 2,
      structureOrganization: 3,
      technicalAccuracy: 1,
      communicationClarity: 4,
    };
    const feedback: EvaluationFeedback = {
      contentRelevance: { text: 'Weak', suggestions: ['Improve relevance'] },
      structureOrganization: { text: 'OK', suggestions: ['Add structure'] },
      technicalAccuracy: { text: 'Bad', suggestions: [] }, // Missing!
      communicationClarity: { text: 'Clear', suggestions: [] },
    };

    expect(validateLowScoreSuggestions(scores, feedback)).toBe(false);
  });

  it('returns true when all low-scoring dimensions have valid suggestions', () => {
    const scores: EvaluationScores = {
      contentRelevance: 1,
      structureOrganization: 2,
      technicalAccuracy: 3,
      communicationClarity: 1,
    };
    const feedback: EvaluationFeedback = {
      contentRelevance: { text: 'Poor', suggestions: ['Be more specific'] },
      structureOrganization: { text: 'Weak', suggestions: ['Use STAR method'] },
      technicalAccuracy: { text: 'OK', suggestions: ['Mention trade-offs'] },
      communicationClarity: { text: 'Poor', suggestions: ['Speak more clearly'] },
    };

    expect(validateLowScoreSuggestions(scores, feedback)).toBe(true);
  });
});

describe('getTop3ImprovementAreas', () => {
  it('returns empty array for no evaluations', () => {
    expect(getTop3ImprovementAreas([])).toEqual([]);
  });

  it('identifies the 3 lowest-scoring dimensions from a single evaluation', () => {
    const evaluations: EvaluationEntry[] = [
      {
        scores: {
          contentRelevance: 5,
          structureOrganization: 2,
          technicalAccuracy: 3,
          communicationClarity: 1,
        },
        feedback: {
          contentRelevance: { text: 'Great', suggestions: [] },
          structureOrganization: { text: 'Weak', suggestions: ['Improve'] },
          technicalAccuracy: { text: 'OK', suggestions: ['Fix'] },
          communicationClarity: { text: 'Poor', suggestions: ['Clarity'] },
        },
      },
    ];

    const result = getTop3ImprovementAreas(evaluations);
    expect(result).toHaveLength(3);
    // Lowest: communicationClarity=1, structureOrganization=2, technicalAccuracy=3
    expect(result[0].dimension).toBe('communicationClarity');
    expect(result[0].averageScore).toBe(1);
    expect(result[1].dimension).toBe('structureOrganization');
    expect(result[1].averageScore).toBe(2);
    expect(result[2].dimension).toBe('technicalAccuracy');
    expect(result[2].averageScore).toBe(3);
  });

  it('computes averages correctly across multiple evaluations', () => {
    const evaluations: EvaluationEntry[] = [
      {
        scores: {
          contentRelevance: 4,
          structureOrganization: 2,
          technicalAccuracy: 5,
          communicationClarity: 3,
        },
        feedback: {
          contentRelevance: { text: '', suggestions: [] },
          structureOrganization: { text: '', suggestions: ['a'] },
          technicalAccuracy: { text: '', suggestions: [] },
          communicationClarity: { text: '', suggestions: ['b'] },
        },
      },
      {
        scores: {
          contentRelevance: 2,
          structureOrganization: 4,
          technicalAccuracy: 3,
          communicationClarity: 1,
        },
        feedback: {
          contentRelevance: { text: '', suggestions: ['c'] },
          structureOrganization: { text: '', suggestions: [] },
          technicalAccuracy: { text: '', suggestions: ['d'] },
          communicationClarity: { text: '', suggestions: ['e'] },
        },
      },
    ];

    const result = getTop3ImprovementAreas(evaluations);
    expect(result).toHaveLength(3);
    // Averages: contentRelevance=3, structureOrganization=3, technicalAccuracy=4, communicationClarity=2
    // Sorted: communicationClarity=2, contentRelevance=3, structureOrganization=3
    expect(result[0].dimension).toBe('communicationClarity');
    expect(result[0].averageScore).toBe(2);
    // Ties broken by DIMENSION_KEYS order: contentRelevance comes before structureOrganization
    expect(result[1].dimension).toBe('contentRelevance');
    expect(result[1].averageScore).toBe(3);
    expect(result[2].dimension).toBe('structureOrganization');
    expect(result[2].averageScore).toBe(3);
  });
});

describe('generateSessionSummary', () => {
  it('returns null for empty evaluations', () => {
    expect(generateSessionSummary([])).toBeNull();
  });

  it('generates correct summary for a single evaluation', () => {
    const evaluations: EvaluationEntry[] = [
      {
        scores: {
          contentRelevance: 4,
          structureOrganization: 3,
          technicalAccuracy: 2,
          communicationClarity: 5,
        },
        feedback: {
          contentRelevance: { text: 'Good', suggestions: [] },
          structureOrganization: { text: 'OK', suggestions: ['Improve structure'] },
          technicalAccuracy: { text: 'Weak', suggestions: ['Study more', 'Practice'] },
          communicationClarity: { text: 'Excellent', suggestions: [] },
        },
      },
    ];

    const summary = generateSessionSummary(evaluations);
    expect(summary).not.toBeNull();
    expect(summary!.totalEvaluations).toBe(1);
    expect(summary!.averageScores.contentRelevance).toBe(4);
    expect(summary!.averageScores.structureOrganization).toBe(3);
    expect(summary!.averageScores.technicalAccuracy).toBe(2);
    expect(summary!.averageScores.communicationClarity).toBe(5);
    expect(summary!.overallAverage).toBe(3.5);
    expect(summary!.topImprovementAreas).toHaveLength(3);
    expect(summary!.topImprovementAreas[0].dimension).toBe('technicalAccuracy');
    expect(summary!.aggregatedSuggestions.technicalAccuracy).toEqual(['Study more', 'Practice']);
    expect(summary!.aggregatedSuggestions.structureOrganization).toEqual(['Improve structure']);
    expect(summary!.aggregatedSuggestions.contentRelevance).toEqual([]);
  });

  it('deduplicates suggestions across multiple evaluations', () => {
    const evaluations: EvaluationEntry[] = [
      {
        scores: {
          contentRelevance: 2,
          structureOrganization: 4,
          technicalAccuracy: 4,
          communicationClarity: 4,
        },
        feedback: {
          contentRelevance: { text: 'Weak', suggestions: ['Be specific', 'Add examples'] },
          structureOrganization: { text: 'Good', suggestions: [] },
          technicalAccuracy: { text: 'Good', suggestions: [] },
          communicationClarity: { text: 'Good', suggestions: [] },
        },
      },
      {
        scores: {
          contentRelevance: 3,
          structureOrganization: 4,
          technicalAccuracy: 4,
          communicationClarity: 4,
        },
        feedback: {
          contentRelevance: { text: 'OK', suggestions: ['Be specific', 'Use STAR method'] },
          structureOrganization: { text: 'Good', suggestions: [] },
          technicalAccuracy: { text: 'Good', suggestions: [] },
          communicationClarity: { text: 'Good', suggestions: [] },
        },
      },
    ];

    const summary = generateSessionSummary(evaluations);
    expect(summary).not.toBeNull();
    // 'Be specific' should appear only once (deduplicated)
    expect(summary!.aggregatedSuggestions.contentRelevance).toContain('Be specific');
    expect(summary!.aggregatedSuggestions.contentRelevance).toContain('Add examples');
    expect(summary!.aggregatedSuggestions.contentRelevance).toContain('Use STAR method');
    expect(summary!.aggregatedSuggestions.contentRelevance).toHaveLength(3);
  });

  it('computes correct overall average', () => {
    const evaluations: EvaluationEntry[] = [
      {
        scores: {
          contentRelevance: 3,
          structureOrganization: 3,
          technicalAccuracy: 3,
          communicationClarity: 3,
        },
        feedback: {
          contentRelevance: { text: '', suggestions: ['a'] },
          structureOrganization: { text: '', suggestions: ['b'] },
          technicalAccuracy: { text: '', suggestions: ['c'] },
          communicationClarity: { text: '', suggestions: ['d'] },
        },
      },
    ];

    const summary = generateSessionSummary(evaluations);
    expect(summary!.overallAverage).toBe(3);
  });
});
