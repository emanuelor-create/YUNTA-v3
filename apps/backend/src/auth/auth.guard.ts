import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseJwksService } from './supabase-jwks.service';
import { AuthenticatedRequest } from './types';

/// Dice quién sos: valida el JWT y deja { userId, email } en el request.
/// No resuelve permisos — eso es responsabilidad de RolesGuard.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwks: SupabaseJwksService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Falta el header Authorization: Bearer <token>');
    }

    request.auth = await this.jwks.verify(token);
    return true;
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}
