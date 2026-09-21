import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Column, Prisma } from '@prisma/client';
import { ActivityLogService } from '../activity/activity-log.service';
import { syncBoardContainers } from '../cards/container-rollup';
import { PrismaService } from '../prisma/prisma.service';

interface UpdateColumnInput {
  name?: string;
  position?: number;
}

@Injectable()
export class ColumnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /// Agrega una columna al final del tablero. Esto agrega un estado nuevo
  /// para las tarjetas de ese tablero, sin migración (BACKEND.md §1).
  async addColumn(boardId: string, name: string, actorId: string): Promise<Column> {
    const board = await this.getBoardOrThrow(boardId);
    const columns = await this.getOrderedColumns(boardId);
    const nextPosition = columns.length ? columns[columns.length - 1].position + 1 : 0;
    // La columna nueva pasa a ser la última: las tarjetas cerradas de la
    // anterior última dejan de estarlo (invariante de BACKEND.md §2), en la
    // misma transacción que el alta.
    const column = await this.prisma.$transaction(async (tx) => {
      const created = await tx.column.create({ data: { boardId, name, position: nextPosition } });
      if (columns.length) {
        await this.reconcileCompletion(tx, boardId, created.id);
        // Las hijas pudieron reabrirse: los contenedores se vuelven a derivar.
        await syncBoardContainers(tx, boardId);
      }
      return created;
    });

    await this.activityLog.log({
      projectId: board.projectId,
      userId: actorId,
      type: 'COLUMN_CREATED',
      message: `creó la columna "${name}"`,
    });
    return column;
  }

  async updateColumn(
    boardId: string,
    columnId: string,
    input: UpdateColumnInput,
    actorId: string,
  ): Promise<Column> {
    const target = await this.getColumnOrThrow(boardId, columnId);

    if (input.position === undefined) {
      return this.prisma.column.update({ where: { id: columnId }, data: { name: input.name } });
    }

    const columns = await this.getOrderedColumns(boardId);
    const fromIndex = columns.findIndex((column) => column.id === columnId);
    const toIndex = Math.max(0, Math.min(input.position, columns.length - 1));

    const reordered = [...columns];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const oldLastId = columns[columns.length - 1].id;
    const newLastId = reordered[reordered.length - 1].id;

    const { updated, reconciled } = await this.prisma.$transaction(async (tx) => {
      // Offset temporal: evita chocar con @@unique([boardId, position]) mientras
      // se reasignan las posiciones finales.
      await tx.column.updateMany({ where: { boardId }, data: { position: { increment: 1000 } } });

      for (let i = 0; i < reordered.length; i++) {
        await tx.column.update({
          where: { id: reordered[i].id },
          data: {
            position: i,
            ...(reordered[i].id === columnId && input.name !== undefined ? { name: input.name } : {}),
          },
        });
      }

      // Si el reorden cambió cuál es la última columna, las tarjetas se
      // reconcilian acá mismo: una cerrada fuera de la última (o una abierta
      // dentro de ella) es la ambigüedad que el modelo no admite.
      const reconciled =
        oldLastId !== newLastId ? await this.reconcileCompletion(tx, boardId, newLastId) : null;
      if (reconciled) await syncBoardContainers(tx, boardId);

      return { updated: await tx.column.findUniqueOrThrow({ where: { id: columnId } }), reconciled };
    });

    if (fromIndex !== toIndex) {
      const board = await this.getBoardOrThrow(boardId);
      await this.activityLog.log({
        projectId: board.projectId,
        userId: actorId,
        type: 'COLUMN_REORDERED',
        message: this.reorderMessage(input.name ?? target.name, toIndex, reordered[reordered.length - 1].name, reconciled),
      });
    }
    return updated;
  }

  /// Reasigna las tarjetas de la columna borrada a la primera columna del
  /// tablero (nunca queda un columnId colgado, BACKEND.md §1). Si la columna
  /// borrada era la última, sus tarjetas dejan de estar "hechas"
  /// (invariante de BACKEND.md §2, caso 4: progress 100 → 75, completedAt null).
  async deleteColumn(boardId: string, columnId: string, actorId: string): Promise<void> {
    const board = await this.getBoardOrThrow(boardId);
    const columns = await this.getOrderedColumns(boardId);
    if (columns.length <= 1) {
      throw new BadRequestException('No se puede eliminar la única columna del tablero');
    }

    const target = columns.find((column) => column.id === columnId);
    if (!target) {
      throw new NotFoundException(`Column ${columnId} no pertenece a este tablero`);
    }

    const remaining = columns.filter((column) => column.id !== columnId);
    const firstColumn = remaining[0];
    const newLast = remaining[remaining.length - 1];
    const wasLastColumn = columns[columns.length - 1].id === columnId;

    await this.prisma.$transaction(async (tx) => {
      await tx.card.updateMany({
        where: { columnId },
        data: wasLastColumn
          ? { columnId: firstColumn.id, progress: 75, completedAt: null }
          : { columnId: firstColumn.id },
      });
      await tx.column.delete({ where: { id: columnId } });
      // Siempre se reconcilia, no solo si era la última: al borrar la anteúltima
      // de dos, la primera pasa a ser la última y recibe las tarjetas movidas;
      // y al borrar la última, la anteúltima hereda el rol de "hecho".
      await this.reconcileCompletion(tx, boardId, newLast.id);
      await syncBoardContainers(tx, boardId);
    });

    await this.activityLog.log({
      projectId: board.projectId,
      userId: actorId,
      type: 'COLUMN_DELETED',
      message: `eliminó la columna "${target.name}"`,
    });
  }

  /// Reaplica la tabla de casos de BACKEND.md §2 sobre todo el tablero,
  /// dado cuál es la última columna: fuera de ella nada está "hecho"
  /// (progress 100 → 75, completedAt null); dentro de ella todo lo está
  /// (progress 100, completedAt ahora). Es idempotente — si el tablero ya
  /// cumple la invariante no toca nada — y va siempre dentro de la
  /// transacción de la operación estructural que la disparó.
  private async reconcileCompletion(
    tx: Prisma.TransactionClient,
    boardId: string,
    lastColumnId: string,
  ): Promise<{ reopened: number; closed: number }> {
    const reopened = await tx.card.updateMany({
      where: { column: { boardId }, columnId: { not: lastColumnId }, progress: 100 },
      data: { progress: 75, completedAt: null },
    });
    const closed = await tx.card.updateMany({
      where: { columnId: lastColumnId, OR: [{ progress: { not: 100 } }, { completedAt: null }] },
      data: { progress: 100, completedAt: new Date() },
    });
    return { reopened: reopened.count, closed: closed.count };
  }

  private reorderMessage(
    columnName: string,
    toIndex: number,
    lastColumnName: string,
    reconciled: { reopened: number; closed: number } | null,
  ): string {
    const base = `movió la columna "${columnName}" a la posición ${toIndex + 1}`;
    if (!reconciled) return base;
    const parts: string[] = [];
    if (reconciled.reopened) parts.push(`${reconciled.reopened} ${reconciled.reopened === 1 ? 'tarjeta se reabrió' : 'tarjetas se reabrieron'}`);
    if (reconciled.closed) parts.push(`${reconciled.closed} ${reconciled.closed === 1 ? 'tarjeta se cerró' : 'tarjetas se cerraron'}`);
    return `${base}; la última ahora es "${lastColumnName}"${parts.length ? ` (${parts.join(', ')})` : ''}`;
  }

  private async getBoardOrThrow(boardId: string) {
    const board = await this.prisma.board.findUnique({ where: { id: boardId } });
    if (!board) {
      throw new NotFoundException(`Board ${boardId} no encontrado`);
    }
    return board;
  }

  private async getColumnOrThrow(boardId: string, columnId: string): Promise<Column> {
    const column = await this.prisma.column.findUnique({ where: { id: columnId } });
    if (!column || column.boardId !== boardId) {
      throw new NotFoundException(`Column ${columnId} no pertenece a este tablero`);
    }
    return column;
  }

  private async getOrderedColumns(boardId: string): Promise<Column[]> {
    return this.prisma.column.findMany({ where: { boardId }, orderBy: { position: 'asc' } });
  }
}
