import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildQuestionPrompt, buildEvaluationPrompt } from '@backend/prompts/templates';
import { SessionContext } from '@ai-interview-coach/shared';

/**
 * Feature: ai-interview-coach
 * Property 3: Prompt construction includes all required components
 *
 * Validates: Requirements 3.3, 4.3, 6.1, 6.5, 13.3, 13.4
 */
describe('Property 3: Prompt construction includes all required components', () => {
  // Generator for valid SessionContext objects
  const arbitrarySessionContext: fc.Arbitrary<SessionContext> = fc.record({
    userProfile: fc.record({
      targetRole: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
      skills: fc
        .array(
          fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          { minLength: 1, maxLength: 10 }
        ),
      yearsExperience: fc.nat({ max: 40 }),
    }),
    company: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
    domain: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
    questionType: fc.constantFrom('technical' as const, 'behavioral' as const),
  });

  describe('Question prompt completeness', () => {
    it('should contain the user targetRole', () => {
      fc.assert(
        fc.property(arbitrarySessionContext, (context) => {
          const prompt = buildQuestionPrompt(context);
          expect(prompt).toContain(context.userProfile.targetRole);
        }),
        { numRuns: 100 }
      );
    });

    it('should contain at least one skill from the user profile', () => {
      fc.assert(
        fc.property(arbitrarySessionContext, (context) => {
          const prompt = buildQuestionPrompt(context);
          const hasAtLeastOneSkill = context.userProfile.skills.some((skill) =>
            prompt.includes(skill)
          );
          expect(hasAtLeastOneSkill).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should contain yearsExperience as a string', () => {
      fc.assert(
        fc.property(arbitrarySessionContext, (context) => {
          const prompt = buildQuestionPrompt(context);
          expect(prompt).toContain(String(context.userProfile.yearsExperience));
        }),
        { numRuns: 100 }
      );
    });

    it('should contain the company name', () => {
      fc.assert(
        fc.property(arbitrarySessionContext, (context) => {
          const prompt = buildQuestionPrompt(context);
          expect(prompt).toContain(context.company);
        }),
        { numRuns: 100 }
      );
    });

    it('should contain the domain', () => {
      fc.assert(
        fc.property(arbitrarySessionContext, (context) => {
          const prompt = buildQuestionPrompt(context);
          expect(prompt).toContain(context.domain);
        }),
        { numRuns: 100 }
      );
    });

    it('should contain at least one few-shot example marker (Q:)', () => {
      fc.assert(
        fc.property(arbitrarySessionContext, (context) => {
          const prompt = buildQuestionPrompt(context);
          expect(prompt).toContain('Q:');
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Evaluation prompt completeness', () => {
    const arbitraryQuestion = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);
    const arbitraryResponse = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

    it('should contain all four evaluation dimension names', () => {
      fc.assert(
        fc.property(arbitraryQuestion, arbitraryResponse, (question, response) => {
          const prompt = buildEvaluationPrompt(question, response);
          expect(prompt).toContain('Content Relevance');
          expect(prompt).toContain('Structure and Organization');
          expect(prompt).toContain('Technical Accuracy');
          expect(prompt).toContain('Communication Clarity');
        }),
        { numRuns: 100 }
      );
    });

    it('should contain rubric level definitions (1 through 5)', () => {
      fc.assert(
        fc.property(arbitraryQuestion, arbitraryResponse, (question, response) => {
          const prompt = buildEvaluationPrompt(question, response);
          expect(prompt).toContain('1:');
          expect(prompt).toContain('2:');
          expect(prompt).toContain('3:');
          expect(prompt).toContain('4:');
          expect(prompt).toContain('5:');
        }),
        { numRuns: 100 }
      );
    });

    it('should contain JSON format instructions with scores and feedback', () => {
      fc.assert(
        fc.property(arbitraryQuestion, arbitraryResponse, (question, response) => {
          const prompt = buildEvaluationPrompt(question, response);
          expect(prompt).toContain('"scores"');
          expect(prompt).toContain('"feedback"');
        }),
        { numRuns: 100 }
      );
    });
  });
});
