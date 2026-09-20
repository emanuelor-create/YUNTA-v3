import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { ProjectRoles } from '../auth/project-roles.decorator';
import { ProjectScope } from '../auth/project-scope.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../auth/types';
import { CommentsService } from './comments.service';

interface CommentBody {
  text?: string;
}

/// Comentarios de tarjeta. Leer y comentar: cualquier miembro (VIEWER incluido).
/// Editar y borrar: solo el autor — lo hace cumplir CommentsService, no el rol.
@Controller('cards/:id/comments')
@UseGuards(AuthGuard, RolesGuard)
@ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR, ProjectRole.VIEWER)
@ProjectScope('card', 'id')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  list(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.comments.list(id, request.auth.userId);
  }

  @Post()
  create(@Param('id') id: string, @Body() body: CommentBody, @Req() request: AuthenticatedRequest) {
    return this.comments.create(id, body?.text, request.auth.userId);
  }

  @Patch(':commentId')
  edit(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() body: CommentBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.comments.edit(id, commentId, body?.text, request.auth.userId);
  }

  @Delete(':commentId')
  @HttpCode(204)
  async remove(@Param('id') id: string, @Param('commentId') commentId: string, @Req() request: AuthenticatedRequest) {
    await this.comments.remove(id, commentId, request.auth.userId);
  }
}
