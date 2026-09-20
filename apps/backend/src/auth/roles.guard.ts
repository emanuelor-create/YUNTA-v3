import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectRole, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PROJECT_ROLES_KEY } from './project-roles.decorator';
import { PROJECT_SCOPE_KEY, ProjectScopeMeta } from './project-scope.decorator';
import { ROLES_KEY } from './roles.decorator';
import { AuthenticatedRequest } from './types';

/// Dice qué podés hacer: rol global (@Roles) y/o rol de proyecto
/// (@ProjectRoles), leyendo ProjectMember. Corre después de AuthGuard —
/// necesita `request.auth` ya resuelto.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredProjectRoles = this.reflector.getAllAndOverride<ProjectRole[] | undefined>(
      PROJECT_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length && !requiredProjectRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) {
      throw new UnauthorizedException('Falta autenticación');
    }

    const user = await this.prisma.user.findUnique({ where: { id: request.auth.userId } });
    if (!user) {
      throw new ForbiddenException('El token es válido pero no tiene perfil en la aplicación');
    }

    if (requiredProjectRoles?.length) {
      if (user.role === UserRole.ADMIN) {
        return true;
      }

      const scope = this.reflector.getAllAndOverride<ProjectScopeMeta | undefined>(PROJECT_SCOPE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? { resource: 'project' as const, param: request.params.projectId ? 'projectId' : 'id' };

      const projectId = await this.resolveProjectId(request, scope);
      if (!projectId) {
        throw new ForbiddenException('No se pudo determinar el proyecto de la request');
      }

      const membership = await this.prisma.projectMember.findUnique({
        where: { userId_projectId: { userId: request.auth.userId, projectId } },
      });

      if (!membership || !requiredProjectRoles.includes(membership.role)) {
        throw new ForbiddenException('No tenés permisos en este proyecto');
      }

      return true;
    }

    if (requiredRoles?.length && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('No tenés el rol necesario');
    }

    return true;
  }

  private async resolveProjectId(
    request: AuthenticatedRequest,
    scope: ProjectScopeMeta,
  ): Promise<string | null> {
    const value = request.params[scope.param];
    if (!value) return null;

    switch (scope.resource) {
      case 'project':
        return value;
      case 'board': {
        const board = await this.prisma.board.findUnique({ where: { id: value } });
        return board?.projectId ?? null;
      }
      case 'card': {
        const card = await this.prisma.card.findUnique({
          where: { id: value },
          include: { column: { include: { board: true } } },
        });
        return card?.column.board.projectId ?? null;
      }
    }
  }
}
