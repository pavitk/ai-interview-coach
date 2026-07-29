import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
describe('Smoke test - project setup', () => {
    it('should run a basic unit test', () => {
        expect(1 + 1).toBe(2);
    });
    it('should run a property-based test with fast-check', () => {
        fc.assert(fc.property(fc.integer(), fc.integer(), (a, b) => {
            expect(a + b).toBe(b + a);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=smoke.test.js.map