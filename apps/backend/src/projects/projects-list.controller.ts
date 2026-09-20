import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../auth/types';
import { CreateProjectInput, ProjectCreationService } from './project-creation.service';
import { ProjectsService } from './projects.service';

/// Separado de ProjectsController (que vive en `projects/:id`): una ruta de
/// colección en `/projects` no matchea ese prefijo con :id.
@Controller('projects')
@UseGuards(AuthGuard, RolesGuard)
export class ProjectsListController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly creation: ProjectCreationService,
  ) {}

  // Sin @ProjectRoles: el filtro "soy miembro" lo resuelve la consulta
  // misma, no hace falta un guard de autorización por proyecto acá.
  @Get()
  list(@Req() request: AuthenticatedRequest, @Query('archived') archived?: string) {
    return this.projects.list(request.auth.userId, archived === 'true');
  }

  // Crear proyectos es de ADMIN y PM (README, Usuarios: "PM crea proyectos");
  // un DEVELOPER trabaja los que ya existen. El creador queda OWNER.
  @Post()
  @Roles(UserRole.ADMIN, UserRole.PM)
  create(@Body() body: CreateProjectInput, @Req() request: AuthenticatedRequest) {
    return this.creation.create(body ?? {}, request.auth.userId);
  }
}
