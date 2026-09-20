import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { ProjectRoles } from '../auth/project-roles.decorator';
import { ProjectScope } from '../auth/project-scope.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../auth/types';
import { CardsService } from './cards.service';

interface CreateCardBody {
  title?: string;
  /// Sin columnId va a la primera.
  columnId?: string;
}

/// "Agregar tarjeta" al pie de una columna. Vive en `boards/:boardId/cards`
/// (la tarjeta nace en un tablero) pero lo sirve el módulo de tarjetas.
@Controller('boards/:boardId/cards')
@UseGuards(AuthGuard, RolesGuard)
@ProjectScope('board', 'boardId')
export class BoardCardsController {
  constructor(private readonly cards: CardsService) {}

  @Post()
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR)
  create(@Param('boardId') boardId: string, @Body() body: CreateCardBody, @Req() request: AuthenticatedRequest) {
    return this.cards.create(boardId, body ?? {}, request.auth.userId);
  }
}
