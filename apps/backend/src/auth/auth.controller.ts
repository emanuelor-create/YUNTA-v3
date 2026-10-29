import { BadRequestException, Body, Controller, Get, NotFoundException, Patch, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from './auth.guard';
import { AuthenticatedRequest } from './types';

const MAX_NAME_LENGTH = 80;

interface UpdateMeBody {
  name?: unknown;
}

/// La sesión de quien llama: GET devuelve su perfil y PATCH le deja cambiar lo
/// suyo (hoy, el nombre). El email y el rol no: el email vive en Supabase Auth
/// y el rol lo decide un administrador desde Usuarios.
@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(AuthGuard)
  @Get('me')
  async me(@Req() request: AuthenticatedRequest) {
    const profile = await this.prisma.user.findUnique({ where: { id: request.auth.userId } });
    return { ...request.auth, profile };
  }

  /// "Mi perfil": cambiar el propio nombre. Cualquier usuario, sobre sí mismo.
  @UseGuards(AuthGuard)
  @Patch('me')
  async updateMe(@Req() request: AuthenticatedRequest, @Body() body: UpdateMeBody) {
    if (body.name === undefined) throw new BadRequestException('Mandá name');
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    if (name.length < 2) throw new BadRequestException('El nombre tiene que tener al menos 2 caracteres');
    if (name.length > MAX_NAME_LENGTH) throw new BadRequestException(`El nombre puede tener hasta ${MAX_NAME_LENGTH} caracteres`);

    const existing = await this.prisma.user.findUnique({ where: { id: request.auth.userId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Tu usuario no tiene perfil');

    const profile = await this.prisma.user.update({ where: { id: request.auth.userId }, data: { name } });
    return { ...request.auth, profile };
  }
}
