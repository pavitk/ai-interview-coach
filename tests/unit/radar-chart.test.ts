import { describe, it, expect } from 'vitest';
import type { EvaluationScores } from '@shared/types/evaluation';

describe('RadarChart', () => {
  describe('Module exports', () => {
    it('should export RadarChart component', async () => {
      const mod = await import('@frontend/components/RadarChart');
      expect(mod.RadarChart).toBeDefined();
      expect(typeof mod.RadarChart).toBe('function');
    });

    it('should export transformScoresToRadarData helper', async () => {
      const mod = await import('@frontend/components/RadarChart');
      expect(mod.transformScoresToRadarData).toBeDefined();
      expect(typeof mod.transformScoresToRadarData).toBe('function');
    });
  });

  describe('transformScoresToRadarData', () => {
    it('should produce exactly 4 data points from evaluation scores', async () => {
      const { transformScoresToRadarData } = await import('@frontend/components/RadarChart');
      const scores: EvaluationScores = {
        contentRelevance: 4,
        structureOrganization: 3,
        technicalAccuracy: 5,
        communicationClarity: 2,
      };

      const data = transformScoresToRadarData(scores);

      expect(data).toHaveLength(4);
    });

    it('should include correct dimension labels', async () => {
      const { transformScoresToRadarData } = await import('@frontend/components/RadarChart');
      const scores: EvaluationScores = {
        contentRelevance: 4,
        structureOrganization: 3,
        technicalAccuracy: 5,
        communicationClarity: 2,
      };

      const data = transformScoresToRadarData(scores);
      const labels = data.map((d) => d.label);

      expect(labels).toContain('Content Relevance');
      expect(labels).toContain('Structure & Organization');
      expect(labels).toContain('Technical Accuracy');
      expect(labels).toContain('Communication Clarity');
    });

    it('should map score values correctly to data points', async () => {
      const { transformScoresToRadarData } = await import('@frontend/components/RadarChart');
      const scores: EvaluationScores = {
        contentRelevance: 4,
        structureOrganization: 3,
        technicalAccuracy: 5,
        communicationClarity: 2,
      };

      const data = transformScoresToRadarData(scores);

      const contentPoint = data.find((d) => d.dimension === 'contentRelevance');
      const structurePoint = data.find((d) => d.dimension === 'structureOrganization');
      const technicalPoint = data.find((d) => d.dimension === 'technicalAccuracy');
      const communicationPoint = data.find((d) => d.dimension === 'communicationClarity');

      expect(contentPoint?.score).toBe(4);
      expect(structurePoint?.score).toBe(3);
      expect(technicalPoint?.score).toBe(5);
      expect(communicationPoint?.score).toBe(2);
    });

    it('should use custom value key when provided', async () => {
      const { transformScoresToRadarData } = await import('@frontend/components/RadarChart');
      const scores: EvaluationScores = {
        contentRelevance: 1,
        structureOrganization: 2,
        technicalAccuracy: 3,
        communicationClarity: 4,
      };

      const data = transformScoresToRadarData(scores, 'session0');

      expect(data[0].session0).toBeDefined();
      expect(data[0].score).toBeUndefined();
    });

    it('should handle minimum scores (all 1s)', async () => {
      const { transformScoresToRadarData } = await import('@frontend/components/RadarChart');
      const scores: EvaluationScores = {
        contentRelevance: 1,
        structureOrganization: 1,
        technicalAccuracy: 1,
        communicationClarity: 1,
      };

      const data = transformScoresToRadarData(scores);

      data.forEach((point) => {
        expect(point.score).toBe(1);
      });
    });

    it('should handle maximum scores (all 5s)', async () => {
      const { transformScoresToRadarData } = await import('@frontend/components/RadarChart');
      const scores: EvaluationScores = {
        contentRelevance: 5,
        structureOrganization: 5,
        technicalAccuracy: 5,
        communicationClarity: 5,
      };

      const data = transformScoresToRadarData(scores);

      data.forEach((point) => {
        expect(point.score).toBe(5);
      });
    });
  });
});
