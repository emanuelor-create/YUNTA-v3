import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { ActivityLogService } from '../activity/activity-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { ProjectRoles } from '../auth/project-roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../auth/types';
import { ProjectSettingsService, UpdateProjectInput } from './project-settings.service';
import { ProjectsService } from './projects.service';

const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_ACTIVITY_LIMIT = 5;

function parseWindowDays(raw?: string): number {
  const match = /^(\d+)d$/.exec(raw ?? '');
  return match ? parseInt(match[1], 10) : DEFAULT_WINDOW_DAYS;
}

@Controller('projects/:id')
@UseGuards(AuthGuard, RolesGuard)
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly settings: ProjectSettingsService,
    private readonly activityLog: ActivityLogService,
  ) {}

  // Header + Personas de Proyecto → Resumen. Cualquier miembro puede verlo.
  @Get()
  get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.projects.get(id, request.auth.userId);
  }

  // Cualquier miembro del proyecto puede ver el informe (es lectura); las
  // mutaciones son las que piden roles más altos.
  @Get('stats')
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR, ProjectRole.VIEWER)
  getStats(@Param('id') id: string, @Query('window') window?: string) {
    return this.projects.getStats(id, parseWindowDays(window));
  }

  // El tablero entero en una llamada: columnas con sus tarjetas en orden. Lo ve
  // cualquier miembro; canEdit / canManage le dicen a la UI qué esconder.
  @Get('board')
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR, ProjectRole.VIEWER)
  getBoard(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.projects.getBoard(id, request.auth.userId);
  }

  @Get('activity')
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR, ProjectRole.VIEWER)
  getActivity(@Param('id') id: string) {
    return this.activityLog.recent(id, DEFAULT_ACTIVITY_LIMIT);
  }

  // Modal de configuración (README §4): solo el OWNER edita, archiva o elimina.
  @Patch()
  @ProjectRoles(ProjectRole.OWNER)
  async update(@Param('id') id: string, @Body() body: UpdateProjectInput, @Req() request: AuthenticatedRequest) {
    await this.settings.update(id, body, request.auth.userId);
    // Se devuelve el detalle completo (no la fila cruda) para que el front
    // pueda reemplazar su cache sin un segundo GET.
    return this.projects.get(id, request.auth.userId);
  }

  @Post('archive')
  @HttpCode(204)
  @ProjectRoles(ProjectRole.OWNER)
  async archive(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    await this.settings.setArchived(id, true, request.auth.userId);
  }

  @Delete('archive')
  @HttpCode(204)
  @ProjectRoles(ProjectRole.OWNER)
  async unarchive(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    await this.settings.setArchived(id, false, request.auth.userId);
  }

  @Delete()
  @HttpCode(204)
  @ProjectRoles(ProjectRole.OWNER)
  async remove(@Param('id') id: string) {
    await this.settings.remove(id);
  }

  // Sin @ProjectRoles: favoritear es personal, no requiere un rol mínimo.
  @Post('favorite')
  async addFavorite(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    await this.projects.setFavorite(request.auth.userId, id, true);
    return { isFavorite: true };
  }

  @Delete('favorite')
  @HttpCode(204)
  async removeFavorite(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    await this.projects.setFavorite(request.auth.userId, id, false);
  }
}
