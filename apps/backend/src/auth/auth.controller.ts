import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from './auth.guard';
import { AuthenticatedRequest } from './types';

/// Endpoint mínimo para probar el circuito completo: front pide sesión a
/// Supabase, manda el JWT, y esto confirma que el AuthGuard lo validó y
/// devuelve el perfil asociado.
@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(AuthGuard)
  @Get('me')
  async me(@Req() request: AuthenticatedRequest) {
    const profile = await this.prisma.user.findUnique({ where: { id: request.auth.userId } });
    return { ...request.auth, profile };
  }
}
