import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { ProjectRoles } from '../auth/project-roles.decorator';
import { ProjectScope } from '../auth/project-scope.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../auth/types';
import { ColumnsService } from './columns.service';

interface AddColumnBody {
  name?: string;
}

interface UpdateColumnBody {
  name?: string;
  position?: number;
}

/// CRUD de columnas de un tablero. Es, a la vez, el CRUD de estados
/// (BACKEND.md §1 y §3.6): agregar una columna agrega un estado.
@Controller('boards/:boardId/columns')
@UseGuards(AuthGuard, RolesGuard)
@ProjectScope('board', 'boardId')
export class BoardsController {
  constructor(private readonly columns: ColumnsService) {}

  @Post()
  @ProjectRoles(ProjectRole.OWNER)
  addColumn(@Param('boardId') boardId: string, @Body() body: AddColumnBody, @Req() request: AuthenticatedRequest) {
    const name = body.name?.trim();
    if (!name) {
      throw new BadRequestException('name es requerido');
    }
    return this.columns.addColumn(boardId, name, request.auth.userId);
  }

  @Patch(':columnId')
  @ProjectRoles(ProjectRole.OWNER)
  updateColumn(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Body() body: UpdateColumnBody,
    @Req() request: AuthenticatedRequest,
  ) {
    if (body.name === undefined && body.position === undefined) {
      throw new BadRequestException('Mandá al menos name o position');
    }
    if (body.name !== undefined && !body.name.trim()) {
      throw new BadRequestException('name no puede quedar vacío');
    }
    if (body.position !== undefined && (!Number.isInteger(body.position) || body.position < 0)) {
      throw new BadRequestException('position tiene que ser un entero >= 0');
    }
    return this.columns.updateColumn(
      boardId,
      columnId,
      { name: body.name?.trim(), position: body.position },
      request.auth.userId,
    );
  }

  @Delete(':columnId')
  @HttpCode(204)
  @ProjectRoles(ProjectRole.OWNER)
  async deleteColumn(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.columns.deleteColumn(boardId, columnId, request.auth.userId);
  }
}
