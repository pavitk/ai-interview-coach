import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateTargetRole } from '@backend/handlers/profile';

/**
 * Feature: ai-interview-coach
 * Property 2: Target role validation rejects empty/whitespace input
 *
 * Validates: Requirements 2.4
 */
describe('Property 2: Target role validation rejects empty/whitespace input', () => {
  it('should reject empty strings', () => {
    fc.assert(
      fc.property(fc.constant(''), (emptyStr) => {
        const result = validateTargetRole(emptyStr);
        expect(result).not.toBeNull();
        expect(typeof result).toBe('string');
      }),
      { numRuns: 100 }
    );
  });

  it('should reject whitespace-only strings', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r')).filter((s) => s.length > 0),
        (whitespaceStr) => {
          const result = validateTargetRole(whitespaceStr);
          expect(result).not.toBeNull();
          expect(typeof result).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept strings with at least one non-whitespace character', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (validStr) => {
          const result = validateTargetRole(validStr);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
