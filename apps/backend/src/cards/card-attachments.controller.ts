import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProjectRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { ProjectRoles } from '../auth/project-roles.decorator';
import { ProjectScope } from '../auth/project-scope.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../auth/types';
import { CardAttachmentsService } from './card-attachments.service';

const MAX_SIZE_BYTES = 20 * 1024 * 1024;

/// Adjuntos de tarjeta (README §6: ícono de clip, nombre, peso, ×). Ver y
/// descargar es lectura: lo puede cualquier miembro, VIEWER incluido (igual que
/// ver la tarjeta). Subir y borrar pide OWNER o EDITOR.
@Controller('cards/:id/attachments')
@UseGuards(AuthGuard, RolesGuard)
@ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR, ProjectRole.VIEWER)
@ProjectScope('card', 'id')
export class CardAttachmentsController {
  constructor(private readonly attachments: CardAttachmentsService) {}

  @Get()
  list(@Param('id') id: string) {
    return this.attachments.list(id);
  }

  @Post()
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE_BYTES } }))
  upload(@Param('id') id: string, @Req() request: AuthenticatedRequest, @UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Mandá el archivo en el campo "file" (multipart/form-data)');
    }
    return this.attachments.upload(id, file, request.auth.userId);
  }

  @Get(':attachmentId/download')
  async download(@Param('id') id: string, @Param('attachmentId') attachmentId: string) {
    const url = await this.attachments.getDownloadUrl(id, attachmentId);
    return { url };
  }

  @Delete(':attachmentId')
  @HttpCode(204)
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EDITOR)
  async remove(@Param('id') id: string, @Param('attachmentId') attachmentId: string, @Req() request: AuthenticatedRequest) {
    await this.attachments.remove(id, attachmentId, request.auth.userId);
  }
}
