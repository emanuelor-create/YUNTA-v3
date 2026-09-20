import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Card, CardPriority, Column, Prisma } from '@prisma/client';
import { ActivityLogService } from '../activity/activity-log.service';
import { projectAccess } from '../auth/project-access';
import { cardCode } from '../projects/project-key';
import { dueState } from './card-metrics';
import { PrismaService } from '../prisma/prisma.service';

const STORY_POINTS_SCALE = [1, 2, 3, 5, 8, 13] as const;
const PROGRESS_SCALE = [0, 25, 50, 75, 100] as const;

const PRIORITY_LABEL: Record<CardPriority, string> = { ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' };

const MAX_TITLE_LENGTH = 200;
const MAX_EFFORT_NOTE_LENGTH = 500;

const points = (n: number) => `${n} ${n === 1 ? 'punto' : 'puntos'}`;

// @@unique([columnId, position]): mientras se reordena una columna, las filas
// pasan por posiciones fuera de rango para no chocar entre sí. Ninguna columna
// real llega a estos valores.
const PARK_POSITION = 1_000_000;
const SHIFT = 100_000;

export interface CardDetail {
  id: string;
  code: string;
  number: number;
  title: string;
  description: string | null;
  priority: CardPriority | null;
  dueDate: string | null;
  /// Mismas definiciones que el Dashboard y el Resumen (card-metrics.ts).
  dueState: 'overdue' | 'soon' | null;
  progress: number;
  storyPoints: number | null;
  /// Por qué se dejó en 13 en vez de dividirla; null si no aplica.
  effortNote: string | null;
  completed: boolean;
  createdAt: string;
  column: { id: string; name: string };
  /// Para el selector de estado: las columnas del tablero, en orden.
  columns: { id: string; name: string }[];
  project: { id: string; key: string; name: string; color: string };
  assignees: { id: string; name: string }[];
  /// Para el selector de asignados: los miembros del proyecto.
  members: { id: string; name: string }[];
  canEdit: boolean;
}

type CardWithColumn = Prisma.CardGetPayload<{ include: { column: { include: { board: true } } } }>;

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /// Mover la tarjeta a otra columna del mismo tablero, o reordenarla dentro
  /// de la suya. Es el mismo camino que usa el drag & drop y el cambio de
  /// "estado" desde el modal de detalle.
  ///
  /// `position` es el índice destino dentro de la columna (0 = arriba); sin él
  /// va al final. Antes solo se cambiaba el columnId y la posición quedaba
  /// igual: con @@unique([columnId, position]), mover a una columna que ya
  /// tenía una tarjeta en esa posición fallaba. Ahora la columna destino se
  /// renumera completa, en la misma transacción que el cambio de estado.
  async move(cardId: string, columnId: string, actorId: string, position?: number): Promise<Card> {
    const card = await this.getCardOrThrow(cardId);
    const columns = await this.getOrderedColumns(card.column.boardId);
    const targetColumn = columns.find((column) => column.id === columnId);
    if (!targetColumn) {
      throw new NotFoundException(`Column ${columnId} no pertenece a este tablero`);
    }
    if (position !== undefined && (!Number.isInteger(position) || position < 0)) {
      throw new BadRequestException('position tiene que ser un entero >= 0');
    }
    const lastColumn = columns[columns.length - 1];
    const sameColumn = card.columnId === columnId;

    const orderedIds = async (id: string) =>
      (await this.prisma.card.findMany({ where: { columnId: id }, orderBy: { position: 'asc' }, select: { id: true } })).map(
        (row) => row.id,
      );
    const current = await orderedIds(columnId);
    const others = current.filter((id) => id !== cardId);
    const index = position === undefined ? others.length : Math.min(position, others.length);
    const newOrder = [...others.slice(0, index), cardId, ...others.slice(index)];

    // Misma columna y mismo lugar: no hay nada que hacer (ni actividad).
    if (sameColumn && newOrder.every((id, i) => id === current[i])) {
      return card;
    }

    // Tabla de casos de BACKEND.md §2: la última columna es "hecho".
    const stateChange = sameColumn
      ? {}
      : targetColumn.id === lastColumn.id
        ? { progress: 100, completedAt: new Date() }
        : card.progress === 100
          ? { progress: 75, completedAt: null }
          : {};

    // Lo que queda en la columna de origen, en orden (la tarjeta ya no está).
    const sourceRemaining = sameColumn ? [] : (await orderedIds(card.columnId)).filter((id) => id !== cardId);

    // Un número fijo de sentencias, no una por tarjeta: en una columna de 40
    // tarjetas contra una base remota eso era segundos y rozaba el timeout de
    // la transacción.
    const updated = await this.prisma.$transaction(async (tx) => {
      // 1) La tarjeta entra a la columna destino en una posición fuera de rango.
      await tx.card.update({ where: { id: cardId }, data: { columnId, position: PARK_POSITION, ...stateChange } });
      // 2) Las demás se estacionan fuera de rango y 3) todas se numeran 0..n-1 en
      //    el orden final. Se estaciona primero porque la restricción única se
      //    chequea fila por fila, no al final de la sentencia.
      await tx.card.updateMany({ where: { columnId, id: { not: cardId } }, data: { position: { increment: SHIFT } } });
      await this.renumber(tx, newOrder);
      // 4) La columna de origen se cierra el hueco.
      if (sourceRemaining.length) {
        await tx.card.updateMany({ where: { columnId: card.columnId }, data: { position: { increment: SHIFT } } });
        await this.renumber(tx, sourceRemaining);
      }
      return tx.card.findUniqueOrThrow({ where: { id: cardId } });
    });

    if (!sameColumn) {
      await this.activityLog.log({
        projectId: card.column.board.projectId,
        userId: actorId,
        type: 'CARD_MOVED',
        message: `movió la tarjeta a "${targetColumn.name}"`,
        cardId: card.id,
        cardTitle: card.title,
      });
    }
    return updated;
  }

  /// Fija position = índice para cada id, en UNA sentencia. Las filas tienen
  /// que estar ya estacionadas fuera de rango (ver move()).
  private async renumber(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const rows = Prisma.join(ids.map((id, index) => Prisma.sql`(${id}, ${index}::int)`));
    await tx.$executeRaw`UPDATE "Card" AS c SET "position" = v.pos FROM (VALUES ${rows}) AS v(id, pos) WHERE c.id = v.id`;
  }

  /// "Agregar tarjeta" al pie de una columna. El código (RED-12) sale de un
  /// contador del proyecto que se incrementa en la misma transacción: no se
  /// repite ni se reusa aunque se borren tarjetas. Si nace en la última
  /// columna, nace cerrada (progress 100 + completedAt): la invariante vale
  /// también para el alta.
  async create(
    boardId: string,
    input: { title?: string; columnId?: string },
    actorId: string,
  ): Promise<Card & { code: string }> {
    const title = input.title?.trim();
    if (!title) throw new BadRequestException('El título es obligatorio');
    if (title.length > MAX_TITLE_LENGTH) {
      throw new BadRequestException(`El título no puede pasar de ${MAX_TITLE_LENGTH} caracteres`);
    }

    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: { project: { select: { key: true } }, columns: { orderBy: { position: 'asc' } } },
    });
    if (!board) throw new NotFoundException(`Board ${boardId} no encontrado`);
    if (!board.columns.length) throw new BadRequestException('El tablero no tiene columnas');

    const column = input.columnId ? board.columns.find((c) => c.id === input.columnId) : board.columns[0];
    if (!column) throw new NotFoundException(`Column ${input.columnId} no pertenece a este tablero`);
    const isLast = column.id === board.columns[board.columns.length - 1].id;

    const card = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id: board.projectId },
        data: { nextCardNumber: { increment: 1 } },
        select: { nextCardNumber: true },
      });
      const last = await tx.card.aggregate({ where: { columnId: column.id }, _max: { position: true } });
      return tx.card.create({
        data: {
          columnId: column.id,
          title,
          number: project.nextCardNumber - 1,
          position: (last._max.position ?? -1) + 1,
          ...(isLast ? { progress: 100, completedAt: new Date() } : {}),
        },
      });
    });

    await this.activityLog.log({
      projectId: board.projectId,
      userId: actorId,
      type: 'CARD_CREATED',
      message: `creó la tarjeta en "${column.name}"`,
      cardId: card.id,
      cardTitle: card.title,
    });
    return { ...card, code: cardCode(board.project.key, card.number) };
  }

  /// Título y descripción. Solo lo que viene en el body; sin cambios reales
  /// no toca la tarjeta ni la actividad.
  async updateDetails(
    cardId: string,
    input: { title?: string; description?: string | null },
    actorId: string,
  ): Promise<Card> {
    const card = await this.getCardOrThrow(cardId);

    const data: { title?: string; description?: string | null } = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new BadRequestException('El título no puede quedar vacío');
      if (title.length > MAX_TITLE_LENGTH) {
        throw new BadRequestException(`El título no puede pasar de ${MAX_TITLE_LENGTH} caracteres`);
      }
      if (title !== card.title) data.title = title;
    }
    if (input.description !== undefined) {
      const description = input.description?.trim() || null;
      if (description !== card.description) data.description = description;
    }
    if (!Object.keys(data).length) return card;

    const updated = await this.prisma.card.update({ where: { id: cardId }, data });

    const projectId = card.column.board.projectId;
    if (data.title !== undefined) {
      await this.activityLog.log({
        projectId,
        userId: actorId,
        type: 'CARD_UPDATED',
        message: `renombró la tarjeta de "${card.title}" a "${data.title}"`,
        cardId: card.id,
        cardTitle: data.title,
      });
    }
    if (data.description !== undefined) {
      await this.activityLog.log({
        projectId,
        userId: actorId,
        type: 'CARD_UPDATED',
        message: 'editó la descripción de la tarjeta',
        cardId: card.id,
        cardTitle: updated.title,
      });
    }
    return updated;
  }

  /// Todo lo que necesita el modal de detalle, en una llamada: la tarjeta, sus
  /// columnas (selector de estado), los miembros (selector de asignados) y si
  /// quien mira puede editar.
  async getDetail(cardId: string, userId: string): Promise<CardDetail> {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        assignees: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
        column: {
          include: {
            board: {
              include: {
                project: { select: { id: true, key: true, name: true, color: true } },
                columns: { orderBy: { position: 'asc' }, select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!card) throw new NotFoundException(`Card ${cardId} no encontrada`);

    const project = card.column.board.project;
    const [access, members] = await Promise.all([
      projectAccess(this.prisma, project.id, userId),
      this.prisma.projectMember.findMany({
        where: { projectId: project.id },
        select: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      id: card.id,
      code: cardCode(project.key, card.number),
      number: card.number,
      title: card.title,
      description: card.description,
      priority: card.priority,
      dueDate: card.dueDate?.toISOString() ?? null,
      dueState: dueState(card, new Date()),
      progress: card.progress,
      storyPoints: card.storyPoints,
      effortNote: card.effortNote,
      completed: card.completedAt !== null,
      createdAt: card.createdAt.toISOString(),
      column: { id: card.column.id, name: card.column.name },
      columns: card.column.board.columns,
      project,
      assignees: card.assignees.map((a) => a.user),
      members: members.map((m) => m.user),
      canEdit: access.canEdit,
    };
  }

  async updateProgress(cardId: string, progress: number, actorId: string): Promise<Card> {
    this.assertProgress(progress);
    const card = await this.getCardOrThrow(cardId);
    const columns = await this.getOrderedColumns(card.column.boardId);
    const lastColumn = columns[columns.length - 1];
    const isInLastColumn = card.columnId === lastColumn.id;

    let updated: Card;
    if (progress === 100) {
      updated = await this.prisma.card.update({
        where: { id: cardId },
        data: { progress: 100, completedAt: new Date(), columnId: lastColumn.id },
      });
    } else if (isInLastColumn) {
      const penultimateColumn = columns[columns.length - 2] ?? lastColumn;
      updated = await this.prisma.card.update({
        where: { id: cardId },
        data: { progress, completedAt: null, columnId: penultimateColumn.id },
      });
    } else {
      updated = await this.prisma.card.update({
        where: { id: cardId },
        data: { progress, completedAt: null },
      });
    }

    await this.activityLog.log({
      projectId: card.column.board.projectId,
      userId: actorId,
      type: 'CARD_PROGRESS_CHANGED',
      message: `cambió el avance a ${progress}%`,
      cardId: card.id,
      cardTitle: card.title,
    });
    return updated;
  }

  /// Esfuerzo: solo la escala 1, 2, 3, 5, 8, 13, o null (sin estimar). El 13
  /// significa "debería dividirse" (BACKEND.md §2): no se bloquea — el equipo
  /// puede dejarlo y justificar —, pero la justificación queda guardada y en
  /// Actividad. Solo existe con 13 y se limpia al cambiar de valor: una nota
  /// sobre un 13 que ya no es 13 sería una verdad vieja.
  ///
  /// `note` ausente = no tocarla. Idempotente: mismo valor y misma nota no
  /// escribe ni ensucia la actividad.
  async updateStoryPoints(
    cardId: string,
    storyPoints: number | null,
    actorId: string,
    note?: string | null,
  ): Promise<Card> {
    this.assertStoryPoints(storyPoints);
    const card = await this.getCardOrThrow(cardId);

    let effortNote: string | null;
    if (storyPoints !== 13) {
      effortNote = null;
    } else if (note === undefined) {
      effortNote = card.storyPoints === 13 ? card.effortNote : null;
    } else {
      effortNote = note?.trim() || null;
      if (effortNote && effortNote.length > MAX_EFFORT_NOTE_LENGTH) {
        throw new BadRequestException(`La justificación no puede pasar de ${MAX_EFFORT_NOTE_LENGTH} caracteres`);
      }
    }

    if (card.storyPoints === storyPoints && card.effortNote === effortNote) return card;

    const updated = await this.prisma.card.update({ where: { id: cardId }, data: { storyPoints, effortNote } });

    let message: string;
    if (card.storyPoints === storyPoints) {
      // Mismo 13, otra justificación.
      message = effortNote ? `justificó dejar la tarjeta en 13 puntos: "${effortNote}"` : 'quitó la justificación de los 13 puntos';
    } else if (storyPoints === null) {
      message = `quitó la estimación (eran ${points(card.storyPoints!)})`;
    } else if (card.storyPoints === null) {
      message = `estimó la tarjeta en ${points(storyPoints)}`;
    } else {
      message = `cambió el esfuerzo de ${card.storyPoints} a ${points(storyPoints)}`;
    }
    if (storyPoints === 13 && effortNote && card.storyPoints !== 13) message += ` (justificación: "${effortNote}")`;

    await this.activityLog.log({
      projectId: card.column.board.projectId,
      userId: actorId,
      type: 'CARD_UPDATED',
      message,
      cardId: card.id,
      cardTitle: card.title,
    });
    return updated;
  }

  /// Prioridad: ALTA / MEDIA / BAJA, o null (sin clasificar — un estado
  /// legítimo, no hay default). Idempotente: poner la que ya tiene no toca la
  /// tarjeta ni ensucia la actividad.
  async updatePriority(cardId: string, priority: CardPriority | null, actorId: string): Promise<Card> {
    this.assertPriority(priority);
    const card = await this.getCardOrThrow(cardId);
    if (card.priority === priority) return card;

    const updated = await this.prisma.card.update({ where: { id: cardId }, data: { priority } });

    const message =
      priority === null
        ? 'quitó la prioridad'
        : card.priority === null
          ? `puso la prioridad ${PRIORITY_LABEL[priority]}`
          : `cambió la prioridad de ${PRIORITY_LABEL[card.priority]} a ${PRIORITY_LABEL[priority]}`;
    await this.activityLog.log({
      projectId: card.column.board.projectId,
      userId: actorId,
      type: 'CARD_PRIORITY_CHANGED',
      message,
      cardId: card.id,
      cardTitle: card.title,
    });
    return updated;
  }

  /// "Asignados" del README (chips + "+ Asignar…"): muchos a muchos vía
  /// CardAssignee. Idempotente — asignar dos veces a la misma persona no
  /// rompe nada, es como ya estaba.
  async addAssignee(cardId: string, userId: string, actorId: string): Promise<void> {
    const card = await this.getCardOrThrow(cardId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException(`User ${userId} no encontrado`);
    }
    await this.prisma.cardAssignee.upsert({
      where: { cardId_userId: { cardId, userId } },
      create: { cardId, userId },
      update: {},
    });

    await this.activityLog.log({
      projectId: card.column.board.projectId,
      userId: actorId,
      type: 'CARD_ASSIGNED',
      message: `asignó a ${user.name} a la tarjeta`,
      cardId: card.id,
      cardTitle: card.title,
    });
  }

  async removeAssignee(cardId: string, userId: string, actorId: string): Promise<void> {
    const card = await this.getCardOrThrow(cardId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    await this.prisma.cardAssignee.deleteMany({ where: { cardId, userId } });

    await this.activityLog.log({
      projectId: card.column.board.projectId,
      userId: actorId,
      type: 'CARD_UNASSIGNED',
      message: `quitó a ${user?.name ?? 'un usuario'} de la tarjeta`,
      cardId: card.id,
      cardTitle: card.title,
    });
  }

  private assertStoryPoints(storyPoints: number | null): void {
    if (storyPoints === null) return;
    if (!STORY_POINTS_SCALE.includes(storyPoints as (typeof STORY_POINTS_SCALE)[number])) {
      throw new BadRequestException(
        `storyPoints inválido: ${storyPoints}. Valores permitidos: ${STORY_POINTS_SCALE.join(', ')}`,
      );
    }
  }

  private assertPriority(priority: CardPriority | null): void {
    if (priority === null) return;
    if (!Object.values(CardPriority).includes(priority)) {
      throw new BadRequestException(
        `priority inválida: ${priority}. Valores permitidos: ${Object.values(CardPriority).join(', ')} o null`,
      );
    }
  }

  private assertProgress(progress: number): void {
    if (!PROGRESS_SCALE.includes(progress as (typeof PROGRESS_SCALE)[number])) {
      throw new BadRequestException(
        `progress inválido: ${progress}. Valores permitidos: ${PROGRESS_SCALE.join(', ')}`,
      );
    }
  }

  private async getCardOrThrow(cardId: string): Promise<CardWithColumn> {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: { column: { include: { board: true } } },
    });
    if (!card) {
      throw new NotFoundException(`Card ${cardId} no encontrada`);
    }
    return card;
  }

  private async getOrderedColumns(boardId: string): Promise<Column[]> {
    return this.prisma.column.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
    });
  }
}
