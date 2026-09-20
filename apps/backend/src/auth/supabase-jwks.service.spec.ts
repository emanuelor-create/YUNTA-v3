import { UnauthorizedException } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { SupabaseJwksService } from './supabase-jwks.service';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'FAKE_JWKS'),
  jwtVerify: jest.fn(),
}));

const mockedJwtVerify = jwtVerify as jest.Mock;

describe('SupabaseJwksService', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, SUPABASE_URL: 'https://project-ref.supabase.co' };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('falla al construirse si falta SUPABASE_URL', () => {
    delete process.env.SUPABASE_URL;
    expect(() => new SupabaseJwksService()).toThrow('SUPABASE_URL');
  });

  it('devuelve { userId, email } cuando el JWT es válido', async () => {
    const service = new SupabaseJwksService();

    mockedJwtVerify.mockResolvedValue({
      payload: { sub: 'user-123', email: 'ana@yunta.test' },
    });

    const result = await service.verify('a.valid.jwt');

    expect(result).toEqual({ userId: 'user-123', email: 'ana@yunta.test' });
    expect(mockedJwtVerify).toHaveBeenCalledWith('a.valid.jwt', 'FAKE_JWKS', {
      issuer: 'https://project-ref.supabase.co/auth/v1',
    });
  });

  it('rechaza con 401 si la firma no valida', async () => {
    const service = new SupabaseJwksService();

    mockedJwtVerify.mockRejectedValue(new Error('signature verification failed'));

    await expect(service.verify('a.tampered.jwt')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza con 401 si al token le faltan los claims sub/email', async () => {
    const service = new SupabaseJwksService();

    mockedJwtVerify.mockResolvedValue({ payload: { sub: 'user-123' } });

    await expect(service.verify('a.valid.jwt.without.email')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
