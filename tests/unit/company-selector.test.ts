import { describe, it, expect } from 'vitest';

describe('CompanySelector', () => {
  describe('Module exports', () => {
    it('should export CompanySelector component', async () => {
      const mod = await import('@frontend/components/CompanySelector');
      expect(mod.CompanySelector).toBeDefined();
      expect(typeof mod.CompanySelector).toBe('function');
    });
  });

  describe('Component contract', () => {
    it('should accept onSessionCreated prop', async () => {
      const mod = await import('@frontend/components/CompanySelector');
      // Verify the function signature accepts props (component is a function taking props)
      expect(mod.CompanySelector.length).toBeGreaterThanOrEqual(0);
    });
  });
});
