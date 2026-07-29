import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as jose from 'jose';

// Mock jose module
vi.mock('jose', async () => {
  const actual = await vi.importActual<typeof import('jose')>('jose');
  return {
    ...actual,
    createRemoteJWKSet: vi.fn(),
    jwtVerify: vi.fn(),
  };
});

// Dynamic import so the mock is active before the module loads
const loadHandler = async () => {
  // Clear module cache to ensure fresh state per test
  vi.resetModules();
  vi.mock('jose', async () => {
    const actual = await vi.importActual<typeof import('jose')>('jose');
    return {
      ...actual,
      createRemoteJWKSet: vi.fn(() => vi.fn()),
      jwtVerify: vi.fn(),
    };
  });
  const mod = await import('@backend/handlers/authorizer');
  return mod.handler;
};

describe('API Gateway JWT Authorizer', () => {
  const mockMethodArn =
    'arn:aws:execute-api:us-east-1:123456789:abc123/prod/GET/api/profile';

  beforeEach(() => {
    vi.stubEnv('CLERK_JWKS_URL', 'https://clerk.example.com/.well-known/jwks.json');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('should return Allow policy with clerk_user_id for valid token', async () => {
    const mockPayload = {
      sub: 'user_abc123',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    };

    vi.mocked(jose.createRemoteJWKSet).mockReturnValue(vi.fn() as never);
    vi.mocked(jose.jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256' },
      key: {} as jose.KeyLike,
    } as jose.JWTVerifyResult & jose.ResolveResult<jose.KeyLike>);

    const { handler } = await import('@backend/handlers/authorizer');

    const result = await handler({
      type: 'TOKEN',
      authorizationToken: 'Bearer valid.jwt.token',
      methodArn: mockMethodArn,
    });

    expect(result.principalId).toBe('user_abc123');
    expect(result.policyDocument.Statement[0]!.Effect).toBe('Allow');
    expect(result.context?.clerk_user_id).toBe('user_abc123');
  });

  it('should handle token without Bearer prefix', async () => {
    const mockPayload = {
      sub: 'user_xyz789',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    };

    vi.mocked(jose.createRemoteJWKSet).mockReturnValue(vi.fn() as never);
    vi.mocked(jose.jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256' },
      key: {} as jose.KeyLike,
    } as jose.JWTVerifyResult & jose.ResolveResult<jose.KeyLike>);

    const { handler } = await import('@backend/handlers/authorizer');

    const result = await handler({
      type: 'TOKEN',
      authorizationToken: 'raw.jwt.token',
      methodArn: mockMethodArn,
    });

    expect(result.principalId).toBe('user_xyz789');
    expect(result.policyDocument.Statement[0]!.Effect).toBe('Allow');
  });

  it('should throw Unauthorized for expired token', async () => {
    vi.mocked(jose.createRemoteJWKSet).mockReturnValue(vi.fn() as never);
    vi.mocked(jose.jwtVerify).mockRejectedValue(
      new jose.errors.JWTExpired('token expired')
    );

    const { handler } = await import('@backend/handlers/authorizer');

    await expect(
      handler({
        type: 'TOKEN',
        authorizationToken: 'Bearer expired.jwt.token',
        methodArn: mockMethodArn,
      })
    ).rejects.toThrow('Unauthorized');
  });

  it('should throw Unauthorized for invalid signature', async () => {
    vi.mocked(jose.createRemoteJWKSet).mockReturnValue(vi.fn() as never);
    vi.mocked(jose.jwtVerify).mockRejectedValue(
      new jose.errors.JWSSignatureVerificationFailed('signature verification failed')
    );

    const { handler } = await import('@backend/handlers/authorizer');

    await expect(
      handler({
        type: 'TOKEN',
        authorizationToken: 'Bearer invalid.jwt.token',
        methodArn: mockMethodArn,
      })
    ).rejects.toThrow('Unauthorized');
  });

  it('should throw Unauthorized when token has no sub claim', async () => {
    const mockPayload = {
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      // No sub claim
    };

    vi.mocked(jose.createRemoteJWKSet).mockReturnValue(vi.fn() as never);
    vi.mocked(jose.jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256' },
      key: {} as jose.KeyLike,
    } as jose.JWTVerifyResult & jose.ResolveResult<jose.KeyLike>);

    const { handler } = await import('@backend/handlers/authorizer');

    await expect(
      handler({
        type: 'TOKEN',
        authorizationToken: 'Bearer no-sub.jwt.token',
        methodArn: mockMethodArn,
      })
    ).rejects.toThrow('Unauthorized');
  });

  it('should throw Unauthorized when authorizationToken is empty', async () => {
    const { handler } = await import('@backend/handlers/authorizer');

    await expect(
      handler({
        type: 'TOKEN',
        authorizationToken: '',
        methodArn: mockMethodArn,
      })
    ).rejects.toThrow('Unauthorized');
  });

  it('should use wildcard resource in policy for cross-route caching', async () => {
    const mockPayload = {
      sub: 'user_cache_test',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    };

    vi.mocked(jose.createRemoteJWKSet).mockReturnValue(vi.fn() as never);
    vi.mocked(jose.jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256' },
      key: {} as jose.KeyLike,
    } as jose.JWTVerifyResult & jose.ResolveResult<jose.KeyLike>);

    const { handler } = await import('@backend/handlers/authorizer');

    const result = await handler({
      type: 'TOKEN',
      authorizationToken: 'Bearer valid.jwt.token',
      methodArn: 'arn:aws:execute-api:us-east-1:123456789:abc123/prod/GET/api/profile',
    });

    // Resource should be wildcarded for caching
    expect(result.policyDocument.Statement[0]!.Resource).toContain('/*');
  });
});
