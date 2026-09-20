import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityLogService } from '../activity/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_TEXT_LENGTH = 2000;
const EXCERPT_LENGTH = 80;

export interface CommentView {
  id: string;
  text: string;
  createdAt: Date;
  /// null mientras no se editó: la UI muestra "editado" solo si tiene valor.
  editedAt: Date | null;
  author: { id: string; name: string };
  /// Si es tuyo — decide si la UI ofrece Editar y Eliminar. Lo calcula el
  /// servidor (el que además lo hace cumplir), no el cliente comparando ids.
  mine: boolean;
}

type CommentRow = {
  id: string;
  text: string;
  createdAt: Date;
  editedAt: Date | null;
  authorId: string;
  author: { id: string; name: string };
};

const toView = (row: CommentRow, actorId: string): CommentView => ({
  id: row.id,
  text: row.text,
  createdAt: row.createdAt,
  editedAt: row.editedAt,
  author: { id: row.author.id, name: row.author.name },
  mine: row.authorId === actorId,
});

/// Un renglón corto del comentario para la actividad: sin saltos de línea y con
/// "…" si se cortó.
function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH).trimEnd()}…` : flat;
}

/// Comentarios de tarjeta. Los puede leer y escribir cualquier miembro —
/// VIEWER incluido: "Solo consulta el tablero y comenta" (README §4)—, pero
/// editar y borrar es solo del autor: ni un OWNER ni un ADMIN pisan lo que dijo
/// otra persona. Cada alta, edición y baja queda en Actividad.
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async list(cardId: string, actorId: string): Promise<CommentView[]> {
    await this.getCardOrThrow(cardId);
    const rows = await this.prisma.comment.findMany({
      where: { cardId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, name: true } } },
    });
    return rows.map((row) => toView(row, actorId));
  }

  async create(cardId: string, text: unknown, actorId: string): Promise<CommentView> {
    const card = await this.getCardOrThrow(cardId);
    const clean = this.validateText(text);

    const row = await this.prisma.comment.create({
      data: { cardId, authorId: actorId, text: clean },
      include: { author: { select: { id: true, name: true } } },
    });

    await this.activityLog.log({
      projectId: card.column.board.projectId,
      userId: actorId,
      type: 'COMMENT_ADDED',
      message: `comentó: "${excerpt(clean)}"`,
      cardId: card.id,
      cardTitle: card.title,
    });
    return toView(row, actorId);
  }

  /// Sin cambios reales no se marca como editado ni se registra nada.
  async edit(cardId: string, commentId: string, text: unknown, actorId: string): Promise<CommentView> {
    const card = await this.getCardOrThrow(cardId);
    const clean = this.validateText(text);
    const existing = await this.getOwnCommentOrThrow(cardId, commentId, actorId, 'editar');
    if (existing.text === clean) return toView(existing, actorId);

    const row = await this.prisma.comment.update({
      where: { id: commentId },
      data: { text: clean, editedAt: new Date() },
      include: { author: { select: { id: true, name: true } } },
    });

    await this.activityLog.log({
      projectId: card.column.board.projectId,
      userId: actorId,
      type: 'COMMENT_EDITED',
      message: 'editó un comentario',
      cardId: card.id,
      cardTitle: card.title,
    });
    return toView(row, actorId);
  }

  async remove(cardId: string, commentId: string, actorId: string): Promise<void> {
    const card = await this.getCardOrThrow(cardId);
    await this.getOwnCommentOrThrow(cardId, commentId, actorId, 'eliminar');
    await this.prisma.comment.delete({ where: { id: commentId } });

    await this.activityLog.log({
      projectId: card.column.board.projectId,
      userId: actorId,
      type: 'COMMENT_DELETED',
      message: 'eliminó un comentario',
      cardId: card.id,
      cardTitle: card.title,
    });
  }

  private validateText(text: unknown): string {
    if (typeof text !== 'string' || !text.trim()) {
      throw new BadRequestException('El comentario no puede estar vacío');
    }
    const clean = text.trim();
    if (clean.length > MAX_TEXT_LENGTH) {
      throw new BadRequestException(`El comentario no puede pasar de ${MAX_TEXT_LENGTH} caracteres`);
    }
    return clean;
  }

  private async getCardOrThrow(cardId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: { column: { include: { board: true } } },
    });
    if (!card) {
      throw new NotFoundException(`Card ${cardId} no encontrada`);
    }
    return card;
  }

  private async getOwnCommentOrThrow(cardId: string, commentId: string, actorId: string, verb: string): Promise<CommentRow> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { author: { select: { id: true, name: true } } },
    });
    if (!comment || comment.cardId !== cardId) {
      throw new NotFoundException(`Comentario ${commentId} no encontrado en esta tarjeta`);
    }
    if (comment.authorId !== actorId) {
      throw new ForbiddenException(`Solo podés ${verb} tus propios comentarios`);
    }
    return comment;
  }
}
