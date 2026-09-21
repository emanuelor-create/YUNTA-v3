import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ActivityLogService } from '../activity/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../supabase/supabase-storage.service';
import { CardsService } from './cards.service';

const PROJECT_ID = 'proj-1';
const ACTOR = 'actor-1';
const BOARD = { id: 'board-1', projectId: PROJECT_ID };
const COLUMNS = [
  { id: 'todo', boardId: BOARD.id, name: 'Por hacer', position: 0 },
  { id: 'doing', boardId: BOARD.id, name: 'En curso', position: 1 },
  { id: 'review', boardId: BOARD.id, name: 'En revisión', position: 2 },
  { id: 'done', boardId: BOARD.id, name: 'Hecho', position: 3 },
];

// ── Una "tabla" de tarjetas en memoria que hace cumplir @@unique([columnId, position]) ──
// Los tests de orden no miran qué llamadas se hicieron sino en qué estado queda
// la columna — y una posición repetida en cualquier paso del camino revienta,
// como en la base real.
interface Row {
  id: string;
  columnId: string;
  position: number;
  progress: number;
  completedAt: Date | null;
  title: string;
  number: number;
  priority: string | null;
  storyPoints?: number | null;
  effortNote?: string | null;
}

class FakeCards {
  rows: Row[] = [];

  seed(columnId: string, ids: string[], over: Partial<Row> = {}) {
    ids.forEach((id, position) =>
      this.rows.push({ id, columnId, position, progress: columnId === 'done' ? 100 : 0, completedAt: columnId === 'done' ? new Date() : null, title: `T ${id}`, number: this.rows.length + 1, priority: null, ...over }),
    );
  }

  private assertUnique() {
    const seen = new Set<string>();
    for (const row of this.rows) {
      const key = `${row.columnId}:${row.position}`;
      if (seen.has(key)) throw new Error(`Unique constraint failed on (columnId, position) = ${key}`);
      seen.add(key);
    }
  }

  private matches(where: { columnId?: string; id?: string | { not: string } }, row: Row) {
    if (where.columnId !== undefined && row.columnId !== where.columnId) return false;
    if (typeof where.id === 'string' && row.id !== where.id) return false;
    if (typeof where.id === 'object' && where.id !== null && row.id === where.id.not) return false;
    return true;
  }

  api = {
    findMany: jest.fn(async ({ where, orderBy }: { where: { columnId?: string }; orderBy?: unknown; select?: unknown }) => {
      const found = this.rows.filter((r) => this.matches(where, r));
      return (orderBy ? [...found].sort((a, b) => a.position - b.position) : found).map((r) => ({ ...r }));
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = this.rows.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      this.assertUnique();
      return { ...row };
    }),
    updateMany: jest.fn(async ({ where, data }: { where: { columnId?: string; id?: { not: string } }; data: { position: { increment: number } } }) => {
      for (const row of this.rows.filter((r) => this.matches(where, r))) row.position += data.position.increment;
      this.assertUnique();
    }),
    findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => ({ ...this.rows.find((r) => r.id === where.id)! })),
  };

  /// `UPDATE "Card" SET position = v.pos FROM (VALUES (id, pos), …)`: el
  /// servicio pasa los pares (id, índice) dentro de un Prisma.join. Como en
  /// Postgres, la restricción única se chequea fila por fila, en el orden en
  /// que llegan los pares.
  executeRaw = jest.fn(async (_strings: TemplateStringsArray, joined: { values: unknown[] }) => {
    const pairs = joined.values;
    for (let i = 0; i < pairs.length; i += 2) {
      const row = this.rows.find((r) => r.id === pairs[i])!;
      row.position = pairs[i + 1] as number;
      this.assertUnique();
    }
    return pairs.length / 2;
  });

  order(columnId: string) {
    return this.rows.filter((r) => r.columnId === columnId).sort((a, b) => a.position - b.position).map((r) => `${r.id}@${r.position}`);
  }
}

describe('CardsService — orden, alta y detalle', () => {
  let fake: FakeCards;
  let prisma: Record<string, any>;
  let activityLog: { log: jest.Mock };
  let storage: { remove: jest.Mock };
  let service: CardsService;

  function build() {
    fake = new FakeCards();
    prisma = {
      card: {
        ...fake.api,
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const row = fake.rows.find((r) => r.id === where.id);
          if (!row) return null;
          return { ...row, description: null, column: { ...COLUMNS.find((c) => c.id === row.columnId)!, board: BOARD } };
        }),
        aggregate: jest.fn(),
        create: jest.fn(),
      },
      $executeRaw: fake.executeRaw,
      column: { findMany: jest.fn().mockResolvedValue(COLUMNS) },
      board: { findUnique: jest.fn() },
      project: { update: jest.fn() },
      projectMember: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
    activityLog = { log: jest.fn() };
    storage = { remove: jest.fn().mockResolvedValue(undefined) };
    service = new CardsService(prisma as unknown as PrismaService, activityLog as unknown as ActivityLogService, storage as unknown as SupabaseStorageService);
  }

  beforeEach(build);

  describe('move — orden dentro de la columna', () => {
    it('regresión: mover a una columna donde ya hay una tarjeta en la misma posición no viola el unique', async () => {
      fake.seed('todo', ['a', 'b']); // a@0, b@1
      fake.seed('doing', ['x', 'y']); // x@0, y@1

      // Antes: a (posición 0) pasaba a "doing" conservando la posición 0 → choca con x.
      await expect(service.move('a', 'doing', ACTOR)).resolves.toBeDefined();

      expect(fake.order('doing')).toEqual(['x@0', 'y@1', 'a@2']); // sin posición: al final
    });

    it('la columna de origen se cierra el hueco (0..n-1 sin saltos)', async () => {
      fake.seed('todo', ['a', 'b', 'c']);
      fake.seed('doing', ['x']);

      await service.move('a', 'doing', ACTOR);

      expect(fake.order('todo')).toEqual(['b@0', 'c@1']);
    });

    it('con position inserta en ese índice y corre las demás', async () => {
      fake.seed('todo', ['a']);
      fake.seed('doing', ['x', 'y', 'z']);

      await service.move('a', 'doing', ACTOR, 1);

      expect(fake.order('doing')).toEqual(['x@0', 'a@1', 'y@2', 'z@3']);
    });

    it('position 0 la deja arriba; una position pasada de largo la deja al final', async () => {
      fake.seed('todo', ['a', 'b']);
      fake.seed('doing', ['x', 'y']);

      await service.move('a', 'doing', ACTOR, 0);
      expect(fake.order('doing')).toEqual(['a@0', 'x@1', 'y@2']);

      await service.move('b', 'doing', ACTOR, 99);
      expect(fake.order('doing')).toEqual(['a@0', 'x@1', 'y@2', 'b@3']);
    });

    it('mover a una columna vacía', async () => {
      fake.seed('todo', ['a']);

      await service.move('a', 'review', ACTOR);

      expect(fake.order('review')).toEqual(['a@0']);
      expect(fake.order('todo')).toEqual([]);
    });

    it('reordenar dentro de la misma columna (arriba → abajo y abajo → arriba)', async () => {
      fake.seed('doing', ['a', 'b', 'c', 'd']);

      await service.move('a', 'doing', ACTOR, 2); // a baja: b c a d
      expect(fake.order('doing')).toEqual(['b@0', 'c@1', 'a@2', 'd@3']);

      await service.move('d', 'doing', ACTOR, 0); // d sube: d b c a
      expect(fake.order('doing')).toEqual(['d@0', 'b@1', 'c@2', 'a@3']);
    });

    it('soltarla donde ya estaba no hace nada: ni escrituras ni actividad', async () => {
      fake.seed('doing', ['a', 'b', 'c']);

      await service.move('b', 'doing', ACTOR, 1);

      expect(fake.api.update).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('reordenar en la misma columna no toca el estado (una "hecha" sigue hecha, sin completedAt nuevo)', async () => {
      const closedAt = new Date('2026-09-01');
      fake.seed('done', ['a', 'b'], { completedAt: closedAt });

      await service.move('a', 'done', ACTOR, 1);

      const a = fake.rows.find((r) => r.id === 'a')!;
      expect(a.completedAt).toEqual(closedAt);
      expect(a.progress).toBe(100);
      expect(activityLog.log).not.toHaveBeenCalled(); // no es un cambio de estado
    });

    it('mover a "Hecho" aplica la invariante (100 + completedAt) y a otra columna la deshace (75 + null), con orden', async () => {
      fake.seed('review', ['a']);
      fake.seed('done', ['z']);

      await service.move('a', 'done', ACTOR, 0);
      const closed = fake.rows.find((r) => r.id === 'a')!;
      expect(closed).toMatchObject({ columnId: 'done', progress: 100, position: 0 });
      expect(closed.completedAt).toBeInstanceOf(Date);
      expect(fake.order('done')).toEqual(['a@0', 'z@1']);

      await service.move('a', 'todo', ACTOR);
      expect(fake.rows.find((r) => r.id === 'a')).toMatchObject({ columnId: 'todo', progress: 75, completedAt: null });
    });

    it('cambiar de columna deja constancia en Actividad', async () => {
      fake.seed('todo', ['a']);
      await service.move('a', 'doing', ACTOR);
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CARD_MOVED', message: 'movió la tarjeta a "En curso"', cardTitle: 'T a' }),
      );
    });

    it('rechaza una position negativa o no entera, y una columna de otro tablero', async () => {
      fake.seed('todo', ['a']);
      await expect(service.move('a', 'doing', ACTOR, -1)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.move('a', 'doing', ACTOR, 1.5)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.move('a', 'otra', ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateStoryPoints — esfuerzo y justificación del 13', () => {
    const row = (id: string) => fake.rows.find((r) => r.id === id)!;
    beforeEach(() => {
      prisma.card.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        Object.assign(row(where.id), data);
        return { ...row(where.id) };
      });
    });

    it('estimar una tarjeta sin estimar lo registra', async () => {
      fake.seed('todo', ['a'], { storyPoints: null, effortNote: null });
      await service.updateStoryPoints('a', 5, ACTOR);

      expect(prisma.card.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { storyPoints: 5, effortNote: null } });
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CARD_UPDATED', message: 'estimó la tarjeta en 5 puntos', cardTitle: 'T a' }),
      );
    });

    it('cambiar de valor dice de cuál a cuál; 1 es "punto", no "puntos"', async () => {
      fake.seed('todo', ['a'], { storyPoints: 5, effortNote: null });
      await service.updateStoryPoints('a', 8, ACTOR);
      expect(activityLog.log).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'cambió el esfuerzo de 5 a 8 puntos' }));

      await service.updateStoryPoints('a', 1, ACTOR);
      expect(activityLog.log).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'cambió el esfuerzo de 8 a 1 punto' }));
    });

    it('quitar la estimación (null) se registra con el valor que tenía', async () => {
      fake.seed('todo', ['a'], { storyPoints: 3, effortNote: null });
      await service.updateStoryPoints('a', null, ACTOR);
      expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({ message: 'quitó la estimación (eran 3 puntos)' }));
    });

    it('mismo valor y misma nota: no escribe ni registra', async () => {
      fake.seed('todo', ['a'], { storyPoints: 5, effortNote: null });
      await service.updateStoryPoints('a', 5, ACTOR);
      expect(prisma.card.update).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('dejar en 13 y justificar: guarda la nota y la deja en Actividad', async () => {
      fake.seed('todo', ['a'], { storyPoints: 13, effortNote: null });
      await service.updateStoryPoints('a', 13, ACTOR, '  Es una migración atómica, no se puede partir  ');

      expect(prisma.card.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { storyPoints: 13, effortNote: 'Es una migración atómica, no se puede partir' },
      });
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'justificó dejar la tarjeta en 13 puntos: "Es una migración atómica, no se puede partir"' }),
      );
    });

    it('pasar a 13 con nota en el mismo pedido: un solo registro, con la justificación', async () => {
      fake.seed('todo', ['a'], { storyPoints: 8, effortNote: null });
      await service.updateStoryPoints('a', 13, ACTOR, 'No se puede partir');
      expect(activityLog.log).toHaveBeenCalledTimes(1);
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'cambió el esfuerzo de 8 a 13 puntos (justificación: "No se puede partir")' }),
      );
    });

    it('sin `note` no se toca la justificación existente (re-elegir 13 no la pierde)', async () => {
      fake.seed('todo', ['a'], { storyPoints: 13, effortNote: 'Ya justificada' });
      await service.updateStoryPoints('a', 13, ACTOR);
      expect(prisma.card.update).not.toHaveBeenCalled();
    });

    it('al pasar a otro valor la justificación se borra: una nota sobre un 13 que ya no es 13 sería una verdad vieja', async () => {
      fake.seed('todo', ['a'], { storyPoints: 13, effortNote: 'Ya justificada' });
      await service.updateStoryPoints('a', 8, ACTOR);
      expect(prisma.card.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { storyPoints: 8, effortNote: null } });
    });

    it('una nota con un valor que no es 13 se ignora (no queda guardada)', async () => {
      fake.seed('todo', ['a'], { storyPoints: 5, effortNote: null });
      await service.updateStoryPoints('a', 8, ACTOR, 'esto no aplica');
      expect(prisma.card.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { storyPoints: 8, effortNote: null } });
    });

    it('quitar la justificación (nota vacía) la borra y lo registra', async () => {
      fake.seed('todo', ['a'], { storyPoints: 13, effortNote: 'Vieja' });
      await service.updateStoryPoints('a', 13, ACTOR, '   ');
      expect(prisma.card.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { storyPoints: 13, effortNote: null } });
      expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({ message: 'quitó la justificación de los 13 puntos' }));
    });

    it('rechaza valores fuera de la escala y una nota de más de 500 caracteres, sin escribir', async () => {
      fake.seed('todo', ['a'], { storyPoints: 5, effortNote: null });
      await expect(service.updateStoryPoints('a', 4, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.updateStoryPoints('a', 21, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.updateStoryPoints('a', 13, ACTOR, 'x'.repeat(501))).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.card.update).not.toHaveBeenCalled();
    });

    it('404 si la tarjeta no existe', async () => {
      await expect(service.updateStoryPoints('nope', 5, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    const board = { ...BOARD, project: { key: 'RED' }, columns: COLUMNS };

    beforeEach(() => {
      prisma.board.findUnique.mockResolvedValue(board);
      prisma.project.update.mockResolvedValue({ nextCardNumber: 13 }); // ya incrementado: esta es la nº 12
      prisma.card.aggregate.mockResolvedValue({ _max: { position: 4 } });
      prisma.card.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new', ...data }));
    });

    it('el código sale del contador del proyecto (incrementado en la misma transacción) y va al final de la columna', async () => {
      const card = await service.create('board-1', { title: '  Nueva tarjeta  ', columnId: 'doing' }, ACTOR);

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: PROJECT_ID },
        data: { nextCardNumber: { increment: 1 } },
        select: { nextCardNumber: true },
      });
      expect(prisma.card.create).toHaveBeenCalledWith({
        data: { columnId: 'doing', title: 'Nueva tarjeta', number: 12, position: 5 },
      });
      expect(card.code).toBe('RED-12');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('sin columna va a la primera; en una columna vacía la posición es 0', async () => {
      prisma.card.aggregate.mockResolvedValue({ _max: { position: null } });
      await service.create('board-1', { title: 'Algo' }, ACTOR);
      expect(prisma.card.create).toHaveBeenCalledWith({ data: expect.objectContaining({ columnId: 'todo', position: 0 }) });
    });

    it('si nace en la última columna nace cerrada (100 + completedAt): la invariante vale también para el alta', async () => {
      await service.create('board-1', { title: 'Ya hecha', columnId: 'done' }, ACTOR);
      expect(prisma.card.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ columnId: 'done', progress: 100, completedAt: expect.any(Date) }),
      });
    });

    it('en una columna que no es la última no lleva progress ni completedAt', async () => {
      await service.create('board-1', { title: 'Abierta', columnId: 'review' }, ACTOR);
      const data = prisma.card.create.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('progress');
      expect(data).not.toHaveProperty('completedAt');
    });

    it('registra CARD_CREATED', async () => {
      await service.create('board-1', { title: 'Loggeada', columnId: 'todo' }, ACTOR);
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: PROJECT_ID, userId: ACTOR, type: 'CARD_CREATED', message: 'creó la tarjeta en "Por hacer"', cardTitle: 'Loggeada' }),
      );
    });

    it('validaciones: título obligatorio y con tope; tablero y columna tienen que existir', async () => {
      await expect(service.create('board-1', { title: '   ' }, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create('board-1', {}, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create('board-1', { title: 'x'.repeat(201) }, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create('board-1', { title: 'ok', columnId: 'de-otro' }, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      prisma.board.findUnique.mockResolvedValue(null);
      await expect(service.create('nope', { title: 'ok' }, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.card.create).not.toHaveBeenCalled();
    });
  });

  describe('updateDetails', () => {
    beforeEach(() => {
      fake.seed('todo', ['a']);
      prisma.card.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: object }) => ({ id: where.id, ...data, title: (data as { title?: string }).title ?? 'T a' }));
    });

    it('cambia el título (recortado) y lo registra con el nombre viejo y el nuevo', async () => {
      await service.updateDetails('a', { title: '  Otro nombre ' }, ACTOR);
      expect(prisma.card.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { title: 'Otro nombre' } });
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CARD_UPDATED', message: 'renombró la tarjeta de "T a" a "Otro nombre"' }),
      );
    });

    it('la descripción vacía queda en null; se registra que se editó', async () => {
      await service.updateDetails('a', { description: 'Detalle' }, ACTOR);
      expect(prisma.card.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { description: 'Detalle' } });
      expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({ message: 'editó la descripción de la tarjeta' }));
    });

    it('sin cambios reales no escribe ni registra', async () => {
      await service.updateDetails('a', { title: 'T a', description: '   ' }, ACTOR); // mismo título; descripción "" == null
      expect(prisma.card.update).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('un título vacío es un 400', async () => {
      await expect(service.updateDetails('a', { title: '  ' }, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getDetail', () => {
    const now = Date.now();
    const detailCard = (over: Record<string, unknown> = {}) => ({
      id: 'a',
      number: 7,
      title: 'Una tarjeta',
      description: 'Detalle',
      priority: 'ALTA',
      dueDate: new Date(now + 2 * 86_400_000),
      completedAt: null,
      progress: 50,
      storyPoints: 13,
      effortNote: 'No se puede partir',
      createdAt: new Date('2026-09-01'),
      assignees: [{ user: { id: 'u1', name: 'Ana' } }],
      column: {
        id: 'doing',
        name: 'En curso',
        board: {
          project: { id: PROJECT_ID, key: 'RED', name: 'Rediseño', color: '#b4552f' },
          columns: COLUMNS.map(({ id, name }) => ({ id, name })),
        },
      },
      ...over,
    });

    beforeEach(() => {
      prisma.card.findUnique.mockResolvedValue(detailCard());
      prisma.projectMember.findMany.mockResolvedValue([{ user: { id: 'u1', name: 'Ana' } }, { user: { id: 'u2', name: 'Bruno' } }]);
      prisma.projectMember.findUnique.mockResolvedValue({ role: 'EDITOR' });
      prisma.user.findUnique.mockResolvedValue({ role: 'DEVELOPER' });
    });

    it('trae todo lo del modal: código, estado, columnas para el selector, asignados y miembros', async () => {
      const detail = await service.getDetail('a', 'u1');

      expect(detail).toMatchObject({
        code: 'RED-7',
        title: 'Una tarjeta',
        priority: 'ALTA',
        storyPoints: 13,
        effortNote: 'No se puede partir',
        progress: 50,
        dueState: 'soon', // en 2 días: la misma definición que "vence pronto"
        column: { id: 'doing', name: 'En curso' },
        project: { key: 'RED', name: 'Rediseño' },
        assignees: [{ id: 'u1', name: 'Ana' }],
        members: [{ id: 'u1', name: 'Ana' }, { id: 'u2', name: 'Bruno' }],
        canEdit: true,
      });
      expect(detail.columns.map((c) => c.name)).toEqual(['Por hacer', 'En curso', 'En revisión', 'Hecho']);
    });

    it('vencida: dueState overdue; cerrada: ni vencida ni próxima', async () => {
      prisma.card.findUnique.mockResolvedValue(detailCard({ dueDate: new Date(now - 86_400_000) }));
      expect((await service.getDetail('a', 'u1')).dueState).toBe('overdue');

      prisma.card.findUnique.mockResolvedValue(detailCard({ dueDate: new Date(now - 86_400_000), completedAt: new Date() }));
      const closed = await service.getDetail('a', 'u1');
      expect(closed.dueState).toBeNull();
      expect(closed.completed).toBe(true);
    });

    it('un VIEWER ve la tarjeta pero canEdit es false; un ADMIN global puede editar sin ser miembro', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({ role: 'VIEWER' });
      expect((await service.getDetail('a', 'u2')).canEdit).toBe(false);

      prisma.projectMember.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      expect((await service.getDetail('a', 'admin')).canEdit).toBe(true);
    });

    it('sin prioridad es null (sin default) y tira 404 si la tarjeta no existe', async () => {
      prisma.card.findUnique.mockResolvedValue(detailCard({ priority: null }));
      expect((await service.getDetail('a', 'u1')).priority).toBeNull();

      prisma.card.findUnique.mockResolvedValue(null);
      await expect(service.getDetail('nope', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
