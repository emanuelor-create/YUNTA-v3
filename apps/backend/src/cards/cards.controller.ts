import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CardPriority, ProjectRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { ProjectRoles } from '../auth/project-roles.decorator';
import { ProjectScope } from '../auth/project-scope.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../auth/types';
import { CardsService } from './cards.service';

interface MoveCardBody {
  columnId?: string;
  /// Índice destino dentro de la columna (0 = arriba). Sin él, al final.
  position?: number;
}

interface UpdateCardBody {
  title?: string;
  description?: string | null;
}

interface UpdateProgressBody {
  progress?: number;
}

interface UpdateStoryPointsBody {
  /// 1, 2, 3, 5, 8, 13 o null (sin estimar); undefined (campo ausente) es un error.
  storyPoints?: number | null;
  /// Justificación de dejar la tarjeta en 13. Ausente = no tocarla.
  note?: string | null;
}

interface UpdatePriorityBody {
  /// null la deja "sin clasificar"; undefined (campo ausente) es un error.
  priority?: CardPriority | null;
}

@Controller('cards')
@UseGuards(AuthGuard, RolesGuard)
@ProjectScope('card', 'id')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  /// Todo el modal de detalle en una llamada. Cualquier miembro puede verlo.
  @Get(':id')
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR, ProjectRole.VIEWER)
  getDetail(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.cards.getDetail(id, request.auth.userId);
  }

  @Patch(':id')
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR)
  updateDetails(@Param('id') id: string, @Body() body: UpdateCardBody, @Req() request: AuthenticatedRequest) {
    if (body.title === undefined && body.description === undefined) {
      throw new BadRequestException('Mandá al menos title o description');
    }
    return this.cards.updateDetails(id, body, request.auth.userId);
  }

  /// Mismo camino que usa el drag & drop del tablero y el selector de
  /// "estado" del modal de detalle (BACKEND.md, nota crítica de la sección 6
  /// del README de diseño): un solo endpoint para cambiar de columna.
  @Patch(':id/move')
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR)
  move(@Param('id') id: string, @Body() body: MoveCardBody, @Req() request: AuthenticatedRequest) {
    if (!body.columnId) {
      throw new BadRequestException('columnId es requerido');
    }
    return this.cards.move(id, body.columnId, request.auth.userId, body.position);
  }

  /// Etapa de avance (0/25/50/75/100). El service ya aplicaba la tabla de
  /// casos de BACKEND.md §2 (100 mueve a la última columna y cierra); faltaba
  /// la ruta — la usa el checkbox de "Tu día" del Dashboard.
  @Patch(':id/progress')
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR)
  updateProgress(@Param('id') id: string, @Body() body: UpdateProgressBody, @Req() request: AuthenticatedRequest) {
    if (typeof body.progress !== 'number') {
      throw new BadRequestException('progress es requerido');
    }
    return this.cards.updateProgress(id, body.progress, request.auth.userId);
  }

  /// Divide una tarjeta en subtareas (mínimo dos). La original pasa a contenedor.
  @Post(':id/divide')
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR)
  divide(@Param('id') id: string, @Body() body: { subtasks?: unknown }, @Req() request: AuthenticatedRequest) {
    return this.cards.divide(id, body ?? {}, request.auth.userId);
  }

  @Patch(':id/story-points')
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR)
  updateStoryPoints(@Param('id') id: string, @Body() body: UpdateStoryPointsBody, @Req() request: AuthenticatedRequest) {
    if (body.storyPoints === undefined) {
      throw new BadRequestException('storyPoints es requerido (usá null para dejarla sin estimar)');
    }
    return this.cards.updateStoryPoints(id, body.storyPoints, request.auth.userId, body.note);
  }

  @Patch(':id/priority')
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR)
  updatePriority(@Param('id') id: string, @Body() body: UpdatePriorityBody, @Req() request: AuthenticatedRequest) {
    if (body.priority === undefined) {
      throw new BadRequestException('priority es requerido (usá null para dejarla sin clasificar)');
    }
    return this.cards.updatePriority(id, body.priority, request.auth.userId);
  }

  @Post(':id/assignees/:userId')
  @HttpCode(201)
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR)
  async addAssignee(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.cards.addAssignee(id, userId, request.auth.userId);
    return { cardId: id, userId };
  }

  @Delete(':id/assignees/:userId')
  @HttpCode(204)
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR)
  async removeAssignee(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.cards.removeAssignee(id, userId, request.auth.userId);
  }
}
