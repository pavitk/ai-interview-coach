import { describe, it, expect } from 'vitest';
import { ApiError } from '@frontend/auth/apiClient';

describe('Auth Module', () => {
  describe('ApiError', () => {
    it('should create an error with status and body', () => {
      const error = new ApiError(401, { message: 'Unauthorized' });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ApiError');
      expect(error.status).toBe(401);
      expect(error.body).toEqual({ message: 'Unauthorized' });
      expect(error.message).toBe('API error: 401');
    });

    it('should handle different HTTP status codes', () => {
      const forbidden = new ApiError(403, { error: 'Forbidden' });
      expect(forbidden.status).toBe(403);

      const notFound = new ApiError(404, { error: 'Not found' });
      expect(notFound.status).toBe(404);

      const serverError = new ApiError(500, { error: 'Internal error' });
      expect(serverError.status).toBe(500);
    });
  });

  describe('Module exports', () => {
    it('should export AuthProvider', async () => {
      const mod = await import('@frontend/auth');
      expect(mod.AuthProvider).toBeDefined();
      expect(typeof mod.AuthProvider).toBe('function');
    });

    it('should export RouteGuard', async () => {
      const mod = await import('@frontend/auth');
      expect(mod.RouteGuard).toBeDefined();
      expect(typeof mod.RouteGuard).toBe('function');
    });

    it('should export SignInPage', async () => {
      const mod = await import('@frontend/auth');
      expect(mod.SignInPage).toBeDefined();
      expect(typeof mod.SignInPage).toBe('function');
    });

    it('should export SignUpPage', async () => {
      const mod = await import('@frontend/auth');
      expect(mod.SignUpPage).toBeDefined();
      expect(typeof mod.SignUpPage).toBe('function');
    });

    it('should export UserButton', async () => {
      const mod = await import('@frontend/auth');
      expect(mod.UserButton).toBeDefined();
      expect(typeof mod.UserButton).toBe('function');
    });

    it('should export useAuthenticatedFetch hook', async () => {
      const mod = await import('@frontend/auth');
      expect(mod.useAuthenticatedFetch).toBeDefined();
      expect(typeof mod.useAuthenticatedFetch).toBe('function');
    });

    it('should export useApiClient hook', async () => {
      const mod = await import('@frontend/auth');
      expect(mod.useApiClient).toBeDefined();
      expect(typeof mod.useApiClient).toBe('function');
    });

    it('should export ApiError class', async () => {
      const mod = await import('@frontend/auth');
      expect(mod.ApiError).toBeDefined();
      expect(typeof mod.ApiError).toBe('function');
    });
  });
});
