import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateDimensionTrends, SessionWithScores } from '@backend/handlers/analytics';

/**
 * Feature: ai-interview-coach
 * Property 14: Per-dimension trend calculation correctness
 *
 * For any ordered sequence of 2 or more sessions with dimension scores,
 * the trend for each dimension should correctly identify positive deltas
 * as improvement and negative deltas as decline, and the trend values
 * should equal the difference between consecutive session scores for
 * each dimension.
 *
 * Validates: Requirements 9.2
 */

/**
 * Generator for a valid SessionWithScores object.
 * Scores are floating point values in [1, 5] rounded to 2 decimal places.
 */
const arbitrarySessionWithScores: fc.Arbitrary<SessionWithScores> = fc.record({
  sessionId: fc.uuid(),
  completedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(
    (d) => d.toISOString()
  ),
  overallScore: fc.double({ min: 1, max: 5, noNaN: true }).map((v) => Math.round(v * 100) / 100),
  avgContentRelevance: fc.double({ min: 1, max: 5, noNaN: true }).map((v) => Math.round(v * 100) / 100),
  avgStructureOrganization: fc.double({ min: 1, max: 5, noNaN: true }).map((v) => Math.round(v * 100) / 100),
  avgTechnicalAccuracy: fc.double({ min: 1, max: 5, noNaN: true }).map((v) => Math.round(v * 100) / 100),
  avgCommunicationClarity: fc.double({ min: 1, max: 5, noNaN: true }).map((v) => Math.round(v * 100) / 100),
});

/**
 * Generator for an ordered sequence of 2+ sessions.
 */
const arbitrarySessionSequence: fc.Arbitrary<SessionWithScores[]> = fc
  .array(arbitrarySessionWithScores, { minLength: 2, maxLength: 10 })
  .map((sessions) =>
    sessions.sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
  );

describe('Property 14: Per-dimension trend calculation correctness', () => {
  it('scores are correctly mapped from sessions to trend entries', () => {
    fc.assert(
      fc.property(arbitrarySessionSequence, (sessions) => {
        const trends = calculateDimensionTrends(sessions);

        // Assert: trend entries have the same length as input sessions
        expect(trends).toHaveLength(sessions.length);

        // Assert: each trend entry correctly maps the session data
        for (let i = 0; i < sessions.length; i++) {
          expect(trends[i].sessionId).toBe(sessions[i].sessionId);
          expect(trends[i].date).toBe(sessions[i].completedAt);
          expect(trends[i].overallScore).toBe(sessions[i].overallScore);
          expect(trends[i].scores.contentRelevance).toBe(sessions[i].avgContentRelevance);
          expect(trends[i].scores.structureOrganization).toBe(sessions[i].avgStructureOrganization);
          expect(trends[i].scores.technicalAccuracy).toBe(sessions[i].avgTechnicalAccuracy);
          expect(trends[i].scores.communicationClarity).toBe(sessions[i].avgCommunicationClarity);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('positive deltas between consecutive entries indicate improvement', () => {
    fc.assert(
      fc.property(arbitrarySessionSequence, (sessions) => {
        const trends = calculateDimensionTrends(sessions);

        for (let i = 1; i < trends.length; i++) {
          const prev = trends[i - 1];
          const curr = trends[i];

          const dimensions = [
            'contentRelevance',
            'structureOrganization',
            'technicalAccuracy',
            'communicationClarity',
          ] as const;

          for (const dim of dimensions) {
            const delta = curr.scores[dim] - prev.scores[dim];

            if (delta > 0) {
              // Positive delta means improvement (score went up)
              expect(delta).toBeGreaterThan(0);
            } else if (delta < 0) {
              // Negative delta means decline (score went down)
              expect(delta).toBeLessThan(0);
            } else {
              // Zero delta means no change
              expect(delta).toBe(0);
            }
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('trend deltas equal consecutive differences between session scores', () => {
    fc.assert(
      fc.property(arbitrarySessionSequence, (sessions) => {
        const trends = calculateDimensionTrends(sessions);

        for (let i = 1; i < trends.length; i++) {
          const prev = trends[i - 1];
          const curr = trends[i];

          // Delta for each dimension should equal consecutive session score difference
          const expectedContentDelta =
            sessions[i].avgContentRelevance - sessions[i - 1].avgContentRelevance;
          const expectedStructureDelta =
            sessions[i].avgStructureOrganization - sessions[i - 1].avgStructureOrganization;
          const expectedTechnicalDelta =
            sessions[i].avgTechnicalAccuracy - sessions[i - 1].avgTechnicalAccuracy;
          const expectedCommunicationDelta =
            sessions[i].avgCommunicationClarity - sessions[i - 1].avgCommunicationClarity;

          const actualContentDelta = curr.scores.contentRelevance - prev.scores.contentRelevance;
          const actualStructureDelta =
            curr.scores.structureOrganization - prev.scores.structureOrganization;
          const actualTechnicalDelta =
            curr.scores.technicalAccuracy - prev.scores.technicalAccuracy;
          const actualCommunicationDelta =
            curr.scores.communicationClarity - prev.scores.communicationClarity;

          expect(actualContentDelta).toBeCloseTo(expectedContentDelta, 10);
          expect(actualStructureDelta).toBeCloseTo(expectedStructureDelta, 10);
          expect(actualTechnicalDelta).toBeCloseTo(expectedTechnicalDelta, 10);
          expect(actualCommunicationDelta).toBeCloseTo(expectedCommunicationDelta, 10);
        }
      }),
      { numRuns: 100 }
    );
  });
});
