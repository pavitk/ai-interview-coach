import { describe, it, expect } from 'vitest';
import {
  buildQuestionPrompt,
  buildEvaluationPrompt,
  TEMPLATE_VERSION,
  TEMPERATURE_SETTINGS,
} from '../../backend/src/prompts/templates';
import { SessionContext } from '@ai-interview-coach/shared';

describe('Prompt Template Store', () => {
  describe('TEMPLATE_VERSION', () => {
    it('should be a semantic version string', () => {
      expect(TEMPLATE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('TEMPERATURE_SETTINGS', () => {
    it('should have generation temperature of 0.7', () => {
      expect(TEMPERATURE_SETTINGS.generation).toBe(0.7);
    });

    it('should have evaluation temperature of 0.2', () => {
      expect(TEMPERATURE_SETTINGS.evaluation).toBe(0.2);
    });
  });

  describe('buildQuestionPrompt', () => {
    const baseContext: SessionContext = {
      userProfile: {
        targetRole: 'Senior Software Engineer',
        skills: ['TypeScript', 'AWS', 'System Design'],
        yearsExperience: 5,
      },
      company: 'Amazon',
      domain: 'Cloud Computing',
      questionType: 'technical',
    };

    it('should include the target role', () => {
      const prompt = buildQuestionPrompt(baseContext);
      expect(prompt).toContain('Senior Software Engineer');
    });

    it('should include the company name', () => {
      const prompt = buildQuestionPrompt(baseContext);
      expect(prompt).toContain('Amazon');
    });

    it('should include skills list', () => {
      const prompt = buildQuestionPrompt(baseContext);
      expect(prompt).toContain('TypeScript');
      expect(prompt).toContain('AWS');
      expect(prompt).toContain('System Design');
    });

    it('should include years of experience', () => {
      const prompt = buildQuestionPrompt(baseContext);
      expect(prompt).toContain('5');
    });

    it('should include the domain', () => {
      const prompt = buildQuestionPrompt(baseContext);
      expect(prompt).toContain('Cloud Computing');
    });

    it('should include the question type', () => {
      const prompt = buildQuestionPrompt(baseContext);
      expect(prompt).toContain('technical');
    });

    it('should include few-shot examples', () => {
      const prompt = buildQuestionPrompt(baseContext);
      expect(prompt).toContain('FEW-SHOT EXAMPLES:');
      expect(prompt).toContain('Q:');
    });

    it('should use behavioral examples for behavioral question type', () => {
      const behavioralContext: SessionContext = {
        ...baseContext,
        questionType: 'behavioral',
      };
      const prompt = buildQuestionPrompt(behavioralContext);
      expect(prompt).toContain('behavioral');
      expect(prompt).toContain('Tell me about a time');
    });

    it('should assign intermediate difficulty for 5 years experience', () => {
      const prompt = buildQuestionPrompt(baseContext);
      expect(prompt).toContain('intermediate');
    });

    it('should assign beginner difficulty for less than 3 years experience', () => {
      const juniorContext: SessionContext = {
        ...baseContext,
        userProfile: { ...baseContext.userProfile, yearsExperience: 1 },
      };
      const prompt = buildQuestionPrompt(juniorContext);
      expect(prompt).toContain('beginner');
    });

    it('should assign advanced difficulty for 8+ years experience', () => {
      const seniorContext: SessionContext = {
        ...baseContext,
        userProfile: { ...baseContext.userProfile, yearsExperience: 10 },
      };
      const prompt = buildQuestionPrompt(seniorContext);
      expect(prompt).toContain('advanced');
    });
  });

  describe('buildEvaluationPrompt', () => {
    const question = 'How would you design a URL shortener?';
    const response = 'I would use a hash-based approach with a distributed database...';

    it('should include the question text', () => {
      const prompt = buildEvaluationPrompt(question, response);
      expect(prompt).toContain(question);
    });

    it('should include the response text', () => {
      const prompt = buildEvaluationPrompt(question, response);
      expect(prompt).toContain(response);
    });

    it('should include all four evaluation dimensions', () => {
      const prompt = buildEvaluationPrompt(question, response);
      expect(prompt).toContain('Content Relevance');
      expect(prompt).toContain('Structure and Organization');
      expect(prompt).toContain('Technical Accuracy');
      expect(prompt).toContain('Communication Clarity');
    });

    it('should include level definitions for scores 1 through 5', () => {
      const prompt = buildEvaluationPrompt(question, response);
      // Each dimension should have 5 levels defined
      expect(prompt).toContain('1:');
      expect(prompt).toContain('2:');
      expect(prompt).toContain('3:');
      expect(prompt).toContain('4:');
      expect(prompt).toContain('5:');
    });

    it('should include JSON output format instructions', () => {
      const prompt = buildEvaluationPrompt(question, response);
      expect(prompt).toContain('"scores"');
      expect(prompt).toContain('"feedback"');
      expect(prompt).toContain('"contentRelevance"');
      expect(prompt).toContain('"structureOrganization"');
      expect(prompt).toContain('"technicalAccuracy"');
      expect(prompt).toContain('"communicationClarity"');
    });

    it('should instruct improvement suggestions for scores <= 3', () => {
      const prompt = buildEvaluationPrompt(question, response);
      expect(prompt).toContain('3 or below');
      expect(prompt).toContain('improvement suggestion');
    });

    it('should include rubric level definitions with descriptive text', () => {
      const prompt = buildEvaluationPrompt(question, response);
      // Check that rubric definitions are substantial (not just numbers)
      expect(prompt).toContain('completely off-topic');
      expect(prompt).toContain('disorganized');
      expect(prompt).toContain('significant technical errors');
      expect(prompt).toContain('unclear and confusing');
    });
  });
});
