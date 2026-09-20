import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import type { SupabaseJwksService } from './supabase-jwks.service';
import type { AuthenticatedRequest } from './types';

// auth.guard.ts importa SupabaseJwksService como valor (lo necesita
// emitDecoratorMetadata para la inyección de dependencias de Nest), que a su
// vez importa `jose` (ESM puro, Jest no lo transforma). Este test no ejerce
// jose de verdad, así que lo mockeamos para que el módulo cargue.
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

function makeContext(authorization?: string): { context: ExecutionContext; request: Partial<AuthenticatedRequest> } {
  const request: Partial<AuthenticatedRequest> = { headers: { authorization } as any };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('AuthGuard', () => {
  let jwks: { verify: jest.Mock };
  let guard: AuthGuard;

  beforeEach(() => {
    jwks = { verify: jest.fn() };
    guard = new AuthGuard(jwks as unknown as SupabaseJwksService);
  });

  it('rechaza si no hay header Authorization', async () => {
    const { context } = makeContext(undefined);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwks.verify).not.toHaveBeenCalled();
  });

  it('rechaza si el header no tiene el prefijo Bearer', async () => {
    const { context } = makeContext('Token abc123');
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('con un Bearer token válido, deja { userId, email } en request.auth y permite el paso', async () => {
    jwks.verify.mockResolvedValue({ userId: 'user-123', email: 'ana@yunta.test' });
    const { context, request } = makeContext('Bearer a.valid.jwt');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwks.verify).toHaveBeenCalledWith('a.valid.jwt');
    expect(request.auth).toEqual({ userId: 'user-123', email: 'ana@yunta.test' });
  });

  it('propaga el rechazo de SupabaseJwksService si el token es inválido', async () => {
    jwks.verify.mockRejectedValue(new UnauthorizedException('Token inválido o expirado'));
    const { context } = makeContext('Bearer a.tampered.jwt');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
