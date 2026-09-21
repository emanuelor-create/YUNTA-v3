import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Card, CardPriority, Column, Prisma } from '@prisma/client';
import { ActivityLogService } from '../activity/activity-log.service';
import { projectAccess } from '../auth/project-access';
import { cardCode } from '../projects/project-key';
import { dueState } from './card-metrics';
import { syncContainer } from './container-rollup';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../supabase/supabase-storage.service';

const STORY_POINTS_SCALE = [1, 2, 3, 5, 8, 13] as const;
const PROGRESS_SCALE = [0, 25, 50, 75, 100] as const;

const PRIORITY_LABEL: Record<CardPriority, string> = { ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' };

const MAX_TITLE_LENGTH = 200;
const MAX_EFFORT_NOTE_LENGTH = 500;
const MAX_SUBTASKS = 12;

/// La entrega es una FECHA, sin hora: se guarda a las 15:00 UTC (mediodía en
/// Argentina), la misma convención de las fechas de proyecto, para que caiga en
/// el mismo día en cualquier huso razonable.
const DUE_DATE_HOUR_UTC = 15;
const formatDueDate = (date: Date) =>
  new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);

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
  /// Tiene subtareas: es un contenedor (sin esfuerzo, prioridad ni avance propios).
  isContainer: boolean;
  /// Si es una subtarea, de quién.
  parent: { id: string; code: string; title: string } | null;
  subtasks: {
    id: string;
    code: string;
    title: string;
    progress: number;
    completed: boolean;
    storyPoints: number | null;
    column: string;
    assignees: { id: string; name: string }[];
  }[];
  /// Se puede dividir: hoja de primer nivel, abierta, y quien mira puede editar.
  canDivide: boolean;
}

type CardWithColumn = Prisma.CardGetPayload<{ include: { column: { include: { board: true } }; _count: { select: { children: true } } } }>;

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly storage: SupabaseStorageService,
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
    this.assertNotContainer(card, 'movelas a ellas, la tarjeta se ubica sola según la subtarea más atrasada.');
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

    // leaf-ok: ordena TODAS las tarjetas de la columna (los contenedores también
    // ocupan una posición y se renumeran con las demás), no cuenta trabajo.
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
      // Si es una subtarea, el contenedor se vuelve a derivar acá mismo.
      if (card.parentId) await syncContainer(tx, card.parentId);
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
      // leaf-ok: calcula la próxima posición de orden en la columna, no cuenta trabajo.
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
        parent: { select: { id: true, number: true, title: true } },
        children: {
          orderBy: { number: 'asc' },
          select: {
            id: true,
            number: true,
            title: true,
            progress: true,
            completedAt: true,
            storyPoints: true,
            column: { select: { name: true } },
            assignees: { orderBy: { createdAt: 'asc' }, select: { user: { select: { id: true, name: true } } } },
          },
        },
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
      isContainer: (card.children?.length ?? 0) > 0,
      parent: card.parent ? { id: card.parent.id, code: cardCode(project.key, card.parent.number), title: card.parent.title } : null,
      subtasks: (card.children ?? []).map((child) => ({
        id: child.id,
        code: cardCode(project.key, child.number),
        title: child.title,
        progress: child.progress,
        completed: child.completedAt !== null,
        storyPoints: child.storyPoints,
        column: child.column.name,
        assignees: child.assignees.map((a) => a.user),
      })),
      canDivide: access.canEdit && !card.parentId && !(card.children?.length ?? 0) && card.completedAt === null,
    };
  }

  async updateProgress(cardId: string, progress: number, actorId: string): Promise<Card> {
    this.assertProgress(progress);
    const card = await this.getCardOrThrow(cardId);
    this.assertNotContainer(card, 'el avance se calcula del de sus subtareas.');
    const columns = await this.getOrderedColumns(card.column.boardId);
    const lastColumn = columns[columns.length - 1];
    const isInLastColumn = card.columnId === lastColumn.id;

    // En una transacción: si es una subtarea, su contenedor se re-deriva con ella.
    const updated = await this.prisma.$transaction(async (tx) => {
      let result: Card;
      if (progress === 100) {
        result = await tx.card.update({
          where: { id: cardId },
          data: { progress: 100, completedAt: new Date(), columnId: lastColumn.id },
        });
      } else if (isInLastColumn) {
        const penultimateColumn = columns[columns.length - 2] ?? lastColumn;
        result = await tx.card.update({
          where: { id: cardId },
          data: { progress, completedAt: null, columnId: penultimateColumn.id },
        });
      } else {
        result = await tx.card.update({
          where: { id: cardId },
          data: { progress, completedAt: null },
        });
      }
      if (card.parentId) await syncContainer(tx, card.parentId);
      return result;
    });

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
    this.assertNotContainer(card, 'no tiene esfuerzo propio, el esfuerzo está en sus subtareas.');

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

  /// Divide una tarjeta en subtareas. Las hijas son tarjetas completas (código,
  /// esfuerzo, avance y asignados propios) que nacen en la primera columna, con
  /// la prioridad, la fecha y los asignados de la original. La original pasa a ser
  /// un CONTENEDOR: pierde lo propio (esfuerzo —el 13 "fue reemplazado"—,
  /// prioridad, asignados y fecha, que ahora viven en las hijas) y su avance y
  /// columna se derivan de ellas. Así nada cuenta dos veces: solo cuentan las hojas.
  ///
  /// Un solo nivel: una subtarea no se divide. Una tarjeta cerrada tampoco (al
  /// dividirla nacerían hijas abiertas y la reabrirían sin que nadie lo decida).
  async divide(
    cardId: string,
    input: { subtasks?: unknown },
    actorId: string,
  ): Promise<{ id: string; subtasks: { id: string; code: string; title: string }[] }> {
    const items = input?.subtasks;
    if (!Array.isArray(items) || items.length < 2) {
      throw new BadRequestException('Dividir necesita al menos dos subtareas');
    }
    if (items.length > MAX_SUBTASKS) {
      throw new BadRequestException(`No se puede dividir en más de ${MAX_SUBTASKS} subtareas de una vez`);
    }
    const subtasks = items.map((item: { title?: unknown; storyPoints?: unknown }, index) => {
      const title = typeof item?.title === 'string' ? item.title.trim() : '';
      if (!title) throw new BadRequestException(`La subtarea ${index + 1} necesita un título`);
      if (title.length > MAX_TITLE_LENGTH) {
        throw new BadRequestException(`El título de la subtarea ${index + 1} no puede pasar de ${MAX_TITLE_LENGTH} caracteres`);
      }
      const storyPoints = item.storyPoints === undefined ? null : item.storyPoints;
      if (storyPoints !== null && typeof storyPoints !== 'number') {
        throw new BadRequestException(`storyPoints de la subtarea ${index + 1} inválido`);
      }
      this.assertStoryPoints(storyPoints);
      return { title, storyPoints };
    });

    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        assignees: { select: { userId: true } },
        _count: { select: { children: true } },
        column: {
          include: {
            board: { include: { project: { select: { key: true } }, columns: { orderBy: { position: 'asc' } } } },
          },
        },
      },
    });
    if (!card) throw new NotFoundException(`Card ${cardId} no encontrada`);
    if (card.parentId) throw new ConflictException('Una subtarea no se divide: las subtareas son de un solo nivel');
    if ((card._count?.children ?? 0) > 0) throw new ConflictException('Esta tarjeta ya está dividida en subtareas');
    if (card.completedAt !== null) throw new ConflictException('Una tarjeta cerrada no se divide: reabrila primero');

    const board = card.column.board;
    const first = board.columns[0];
    const bornClosed = board.columns.length === 1; // primera = última: rige la misma regla que en `create`

    const created = await this.prisma.$transaction(
      async (tx) => {
        const project = await tx.project.update({
          where: { id: board.projectId },
          data: { nextCardNumber: { increment: subtasks.length } },
          select: { nextCardNumber: true },
        });
        const firstNumber = project.nextCardNumber - subtasks.length;
        // leaf-ok: calcula la próxima posición de orden en la columna, no cuenta trabajo.
        const last = await tx.card.aggregate({ where: { columnId: first.id }, _max: { position: true } });
        const firstPosition = (last._max.position ?? -1) + 1;

        const children: { id: string; number: number; title: string }[] = [];
        for (const [index, subtask] of subtasks.entries()) {
          children.push(
            await tx.card.create({
              data: {
                columnId: first.id,
                title: subtask.title,
                number: firstNumber + index,
                position: firstPosition + index,
                storyPoints: subtask.storyPoints,
                // Heredan lo que la original tenía: dividir no pierde prioridad,
                // fecha ni a quién estaba asignada.
                priority: card.priority,
                dueDate: card.dueDate,
                parentId: card.id,
                assignees: { create: card.assignees.map((a) => ({ userId: a.userId })) },
                ...(bornClosed ? { progress: 100, completedAt: new Date() } : {}),
              },
              select: { id: true, number: true, title: true },
            }),
          );
        }

        // La original deja de tener lo propio…
        await tx.cardAssignee.deleteMany({ where: { cardId: card.id } });
        await tx.card.update({
          where: { id: card.id },
          data: { storyPoints: null, effortNote: null, priority: null, dueDate: null },
        });
        // …y su avance y columna pasan a derivarse de las hijas.
        await syncContainer(tx, card.id);
        return children;
      },
      // N altas + la derivación contra una base remota: más que el default de 5 s.
      { timeout: 20_000 },
    );

    const codes = created.map((child) => cardCode(board.project.key, child.number));
    await this.activityLog.log({
      projectId: board.projectId,
      userId: actorId,
      type: 'CARD_UPDATED',
      message: `dividió la tarjeta en ${created.length} subtareas (${codes.join(', ')})`,
      cardId: card.id,
      cardTitle: card.title,
    });
    return { id: card.id, subtasks: created.map((child, i) => ({ id: child.id, code: codes[i], title: child.title })) };
  }

  /// Prioridad: ALTA / MEDIA / BAJA, o null (sin clasificar — un estado
  /// legítimo, no hay default). Idempotente: poner la que ya tiene no toca la
  /// tarjeta ni ensucia la actividad.
  async updatePriority(cardId: string, priority: CardPriority | null, actorId: string): Promise<Card> {
    this.assertPriority(priority);
    const card = await this.getCardOrThrow(cardId);
    this.assertNotContainer(card, 'no tiene prioridad propia, la tienen sus subtareas.');
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

  /// Fecha de entrega: 'AAAA-MM-DD' o null (sin fecha). Idempotente. Un
  /// contenedor no tiene fecha propia: la tienen sus subtareas.
  async updateDueDate(cardId: string, value: string | null, actorId: string): Promise<Card> {
    const dueDate = this.parseDueDate(value);
    const card = await this.getCardOrThrow(cardId);
    this.assertNotContainer(card, 'no tiene fecha de entrega propia, la tienen sus subtareas.');
    if ((card.dueDate?.getTime() ?? null) === (dueDate?.getTime() ?? null)) return card;

    const updated = await this.prisma.card.update({ where: { id: cardId }, data: { dueDate } });

    const message =
      dueDate === null
        ? 'quitó la fecha de entrega'
        : card.dueDate === null
          ? `fijó la entrega para el ${formatDueDate(dueDate)}`
          : `cambió la entrega del ${formatDueDate(card.dueDate)} al ${formatDueDate(dueDate)}`;
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

  /// Borra la tarjeta con sus adjuntos, comentarios y asignados (cascada). Una
  /// tarjeta dividida NO se borra: sus subtareas quedarían huérfanas o
  /// desaparecerían sin que nadie lo decida, y lo que cuentan las métricas
  /// cambiaría de golpe. Hay que resolver primero las subtareas (borrarlas una
  /// por una). Al borrar una subtarea, su madre se re-deriva con las que quedan.
  async remove(cardId: string, actorId: string): Promise<void> {
    const card = await this.getCardOrThrow(cardId);
    const children = card._count?.children ?? 0;
    if (children > 0) {
      throw new ConflictException(
        `Esta tarjeta está dividida en ${children} ${children === 1 ? 'subtarea' : 'subtareas'}: no se puede borrar sin decidir qué pasa con ellas. ` +
          'Borrá primero cada subtarea (o abrilas y resolvelas); cuando no queden, podés borrar esta.',
      );
    }

    // leaf-ok: junta los archivos de una tarjeta para borrarlos de Storage; no cuenta trabajo.
    const attachments = await this.prisma.cardAttachment.findMany({ where: { cardId }, select: { storagePath: true } });

    await this.prisma.$transaction(async (tx) => {
      await tx.card.delete({ where: { id: cardId } });
      if (card.parentId) await syncContainer(tx, card.parentId);
    });

    // Los archivos viven en Storage, no en la base: si falla, la tarjeta ya no
    // existe y queda un archivo huérfano — se loguea, no se resucita lo borrado.
    for (const { storagePath } of attachments) {
      try {
        await this.storage.remove(storagePath);
      } catch (error) {
        this.logger.warn(`Adjunto huérfano tras borrar la tarjeta ${cardId}: ${storagePath} (${String(error)})`);
      }
    }

    await this.activityLog.log({
      projectId: card.column.board.projectId,
      userId: actorId,
      type: 'CARD_UPDATED',
      message: card.parentId ? `eliminó la subtarea "${card.title}"` : `eliminó la tarjeta "${card.title}"`,
      cardId: card.id,
      cardTitle: card.title,
    });
  }

  private parseDueDate(value: string | null): Date | null {
    if (value === null) return null;
    const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
    if (!match) throw new BadRequestException("dueDate debe ser una fecha 'AAAA-MM-DD' o null");
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day, DUE_DATE_HOUR_UTC));
    // Date.UTC(2026, 1, 31) se "corrige" a marzo: se rechaza en vez de guardar otra fecha.
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new BadRequestException(`dueDate no es una fecha válida: ${value}`);
    }
    return date;
  }

  /// "Asignados" del README (chips + "+ Asignar…"): muchos a muchos vía
  /// CardAssignee. Idempotente — asignar dos veces a la misma persona no
  /// rompe nada, es como ya estaba.
  async addAssignee(cardId: string, userId: string, actorId: string): Promise<void> {
    const card = await this.getCardOrThrow(cardId);
    this.assertNotContainer(card, 'no tiene asignados propios, asigná a sus subtareas.');
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
    this.assertNotContainer(card, 'no tiene asignados propios, quitá a la persona de sus subtareas.');
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
      include: { column: { include: { board: true } }, _count: { select: { children: true } } },
    });
    if (!card) {
      throw new NotFoundException(`Card ${cardId} no encontrada`);
    }
    return card;
  }

  /// Un contenedor (tarjeta dividida) no tiene esfuerzo, prioridad, asignados ni
  /// avance propios, y se mueve solo según sus hijas: tocarlos directamente
  /// abriría una segunda verdad al lado de la derivada.
  private assertNotContainer(card: CardWithColumn, message: string): void {
    if ((card._count?.children ?? 0) > 0) {
      throw new BadRequestException(`Esta tarjeta está dividida en subtareas: ${message}`);
    }
  }

  private async getOrderedColumns(boardId: string): Promise<Column[]> {
    return this.prisma.column.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
    });
  }
}
