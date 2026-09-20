import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateUserDto, UsersService } from './users.service';

interface SetPasswordBody {
  password?: string;
}

/// Administración de usuarios (BACKEND.md §3.3): pantalla exclusiva de
/// ADMIN, no está scopeada a un proyecto — por eso @Roles y no @ProjectRoles.
@Controller('users')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    if (role !== undefined && !Object.values(UserRole).includes(role as UserRole)) {
      throw new BadRequestException(`role inválido: ${role}`);
    }
    if (status !== undefined && !Object.values(UserStatus).includes(status as UserStatus)) {
      throw new BadRequestException(`status inválido: ${status}`);
    }

    return this.users.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      q,
      role: role as UserRole | undefined,
      status: status as UserStatus | undefined,
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.users.update(id, body);
  }

  @Post(':id/reset-password')
  async resetPassword(@Param('id') id: string) {
    await this.users.sendResetPasswordEmail(id);
    return { sent: true };
  }

  @Put(':id/password')
  async setPassword(@Param('id') id: string, @Body() body: SetPasswordBody) {
    if (!body.password) {
      throw new BadRequestException('password es requerido');
    }
    await this.users.setPassword(id, body.password);
    return { updated: true };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.users.softDelete(id);
  }
}
