import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AuthenticatedUser } from './types';

/// Valida el JWT de Supabase contra su JWKS (jamás decodifica sin chequear
/// firma). Requiere que el proyecto de Supabase tenga claves asimétricas
/// (Project Settings → API → JWT Keys); si el proyecto sigue en el secreto
/// HS256 legacy, el JWKS devuelve un set vacío y toda verificación falla.
@Injectable()
export class SupabaseJwksService {
  private readonly jwks: JWTVerifyGetKey;
  private readonly issuer: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL no está definida');
    }
    this.issuer = `${supabaseUrl}/auth/v1`;
    this.jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer }));
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new UnauthorizedException('Token sin los claims esperados (sub, email)');
    }

    return { userId: payload.sub, email: payload.email };
  }
}
