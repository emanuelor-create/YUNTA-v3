import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActivityLogService } from '../activity/activity-log.service';
import { CardsService } from './cards.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../supabase/supabase-storage.service';

const PROJECT_ID = 'proj-1';
const ACTOR_ID = 'actor-1';

// Tablero de 3 columnas: Por hacer (0) · En curso (1) · Hecho (2).
const COLUMN_TODO = { id: 'col-todo', boardId: 'board-1', name: 'Por hacer', position: 0 };
const COLUMN_DOING = { id: 'col-doing', boardId: 'board-1', name: 'En curso', position: 1 };
const COLUMN_DONE = { id: 'col-done', boardId: 'board-1', name: 'Hecho', position: 2 };
const COLUMNS = [COLUMN_TODO, COLUMN_DOING, COLUMN_DONE];
const BOARD = { id: 'board-1', projectId: PROJECT_ID };

function makeCard(overrides: Partial<{ id: string; columnId: string; progress: number }> = {}) {
  const columnId = overrides.columnId ?? COLUMN_DOING.id;
  const column = COLUMNS.find((c) => c.id === columnId)!;
  return {
    id: overrides.id ?? 'card-1',
    columnId,
    title: 'Tarjeta de prueba',
    number: 1,
    priority: null,
    effortNote: null,
    description: null,
    position: 0,
    dueDate: null,
    storyPoints: null,
    progress: overrides.progress ?? 50,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    column: { ...column, board: BOARD },
  };
}

describe('CardsService', () => {
  let service: CardsService;
  let prisma: {
    card: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock; findUniqueOrThrow: jest.Mock };
    column: { findMany: jest.Mock };
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    user: { findUnique: jest.Mock };
    cardAssignee: { upsert: jest.Mock; deleteMany: jest.Mock };
  };
  let activityLog: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      card: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      $transaction: jest.fn(),
      $executeRaw: jest.fn(),
      column: {
        findMany: jest.fn().mockResolvedValue(COLUMNS),
      },
      user: {
        findUnique: jest.fn(),
      },
      cardAssignee: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    // Transacción interactiva: el callback corre contra el mismo mock.
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
    activityLog = { log: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CardsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityLogService, useValue: activityLog },
        { provide: SupabaseStorageService, useValue: { remove: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(CardsService);
  });

  describe('invariante avance ↔ columna', () => {
    it('caso 1: progress = 100 mueve la tarjeta a la última columna y setea completedAt', async () => {
      const card = makeCard({ columnId: COLUMN_DOING.id, progress: 50 });
      prisma.card.findUnique.mockResolvedValue(card);

      await service.updateProgress(card.id, 100, ACTOR_ID);

      expect(prisma.card.update).toHaveBeenCalledWith({
        where: { id: card.id },
        data: { progress: 100, completedAt: expect.any(Date), columnId: COLUMN_DONE.id },
      });
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: PROJECT_ID, userId: ACTOR_ID, type: 'CARD_PROGRESS_CHANGED' }),
      );
    });

    it('caso 2: mover la tarjeta a la última columna setea progress = 100 y completedAt', async () => {
      const card = makeCard({ columnId: COLUMN_DOING.id, progress: 50 });
      prisma.card.findUnique.mockResolvedValue(card);

      await service.move(card.id, COLUMN_DONE.id, ACTOR_ID);

      expect(prisma.card.update).toHaveBeenCalledWith({
        where: { id: card.id },
        data: expect.objectContaining({ columnId: COLUMN_DONE.id, progress: 100, completedAt: expect.any(Date) }),
      });
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: PROJECT_ID,
          userId: ACTOR_ID,
          type: 'CARD_MOVED',
          message: expect.stringContaining('Hecho'),
        }),
      );
    });

    it('caso 3: progress baja de 100 saca la tarjeta a la penúltima columna y limpia completedAt', async () => {
      const card = makeCard({ columnId: COLUMN_DONE.id, progress: 100 });
      prisma.card.findUnique.mockResolvedValue(card);

      await service.updateProgress(card.id, 75, ACTOR_ID);

      expect(prisma.card.update).toHaveBeenCalledWith({
        where: { id: card.id },
        data: { progress: 75, completedAt: null, columnId: COLUMN_DOING.id },
      });
    });

    it('caso 4: sacar la tarjeta de la última columna con progress = 100 lo baja a 75', async () => {
      const card = makeCard({ columnId: COLUMN_DONE.id, progress: 100 });
      prisma.card.findUnique.mockResolvedValue(card);

      await service.move(card.id, COLUMN_DOING.id, ACTOR_ID);

      expect(prisma.card.update).toHaveBeenCalledWith({
        where: { id: card.id },
        data: expect.objectContaining({ columnId: COLUMN_DOING.id, progress: 75, completedAt: null }),
      });
    });

    it('mover una tarjeta con progress < 100 entre columnas que no son la última no toca progress ni completedAt', async () => {
      const card = makeCard({ columnId: COLUMN_TODO.id, progress: 50 });
      prisma.card.findUnique.mockResolvedValue(card);

      await service.move(card.id, COLUMN_DOING.id, ACTOR_ID);

      const data = prisma.card.update.mock.calls.find(([args]) => args.where.id === card.id && args.data.columnId)![0].data;
      expect(data).toEqual({ columnId: COLUMN_DOING.id, position: expect.any(Number) });
      expect(data).not.toHaveProperty('progress');
      expect(data).not.toHaveProperty('completedAt');
    });
  });

  describe('validación de escala', () => {
    it('rechaza un progress fuera de 0,25,50,75,100 con 400', async () => {
      const card = makeCard();
      prisma.card.findUnique.mockResolvedValue(card);

      await expect(service.updateProgress(card.id, 60, ACTOR_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.card.update).not.toHaveBeenCalled();
    });

    it('rechaza un storyPoints fuera de 1,2,3,5,8,13 con 400', async () => {
      const card = makeCard();
      prisma.card.findUnique.mockResolvedValue(card);

      await expect(service.updateStoryPoints(card.id, 4, ACTOR_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.card.update).not.toHaveBeenCalled();
    });

    it('acepta storyPoints = null (tarjeta sin estimar)', async () => {
      const card = { ...makeCard(), storyPoints: 5 };
      prisma.card.findUnique.mockResolvedValue(card);
      prisma.card.update.mockResolvedValue({ ...card, storyPoints: null });

      await service.updateStoryPoints(card.id, null, ACTOR_ID);

      expect(prisma.card.update).toHaveBeenCalledWith({
        where: { id: card.id },
        data: { storyPoints: null, effortNote: null },
      });
    });

    it('acepta cada valor válido de la escala de storyPoints', async () => {
      const card = makeCard();
      prisma.card.findUnique.mockResolvedValue(card);

      for (const value of [1, 2, 3, 5, 8, 13]) {
        await service.updateStoryPoints(card.id, value, ACTOR_ID);
      }

      expect(prisma.card.update).toHaveBeenCalledTimes(6);
    });
  });

  describe('asignados', () => {
    it('addAssignee crea la relación si el usuario existe', async () => {
      const card = makeCard();
      prisma.card.findUnique.mockResolvedValue(card);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Ana', deletedAt: null });

      await service.addAssignee(card.id, 'user-1', ACTOR_ID);

      expect(prisma.cardAssignee.upsert).toHaveBeenCalledWith({
        where: { cardId_userId: { cardId: card.id, userId: 'user-1' } },
        create: { cardId: card.id, userId: 'user-1' },
        update: {},
      });
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: PROJECT_ID, userId: ACTOR_ID, type: 'CARD_ASSIGNED' }),
      );
    });

    it('addAssignee tira 404 si el usuario no existe', async () => {
      const card = makeCard();
      prisma.card.findUnique.mockResolvedValue(card);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.addAssignee(card.id, 'nope', ACTOR_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.cardAssignee.upsert).not.toHaveBeenCalled();
    });

    it('addAssignee tira 404 si el usuario tiene soft delete', async () => {
      const card = makeCard();
      prisma.card.findUnique.mockResolvedValue(card);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', deletedAt: new Date() });

      await expect(service.addAssignee(card.id, 'user-1', ACTOR_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('removeAssignee borra la relación', async () => {
      const card = makeCard();
      prisma.card.findUnique.mockResolvedValue(card);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Ana' });

      await service.removeAssignee(card.id, 'user-1', ACTOR_ID);

      expect(prisma.cardAssignee.deleteMany).toHaveBeenCalledWith({
        where: { cardId: card.id, userId: 'user-1' },
      });
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: PROJECT_ID, userId: ACTOR_ID, type: 'CARD_UNASSIGNED' }),
      );
    });
  });
  describe('prioridad', () => {
    const withPriority = (priority: string | null) => ({ ...makeCard(), priority });

    it('una tarjeta sin clasificar es null (no hay default): poner ALTA la actualiza y lo registra', async () => {
      const card = withPriority(null);
      prisma.card.findUnique.mockResolvedValue(card);
      prisma.card.update.mockResolvedValue({ ...card, priority: 'ALTA' });

      await service.updatePriority(card.id, 'ALTA' as never, ACTOR_ID);

      expect(prisma.card.update).toHaveBeenCalledWith({ where: { id: card.id }, data: { priority: 'ALTA' } });
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: PROJECT_ID,
          userId: ACTOR_ID,
          type: 'CARD_PRIORITY_CHANGED',
          message: 'puso la prioridad Alta',
          cardTitle: 'Tarjeta de prueba',
        }),
      );
    });

    it('cambiar de una a otra dice de cuál a cuál', async () => {
      const card = withPriority('MEDIA');
      prisma.card.findUnique.mockResolvedValue(card);
      prisma.card.update.mockResolvedValue({ ...card, priority: 'ALTA' });

      await service.updatePriority(card.id, 'ALTA' as never, ACTOR_ID);

      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'cambió la prioridad de Media a Alta' }),
      );
    });

    it('null la deja sin clasificar', async () => {
      const card = withPriority('BAJA');
      prisma.card.findUnique.mockResolvedValue(card);
      prisma.card.update.mockResolvedValue({ ...card, priority: null });

      await service.updatePriority(card.id, null, ACTOR_ID);

      expect(prisma.card.update).toHaveBeenCalledWith({ where: { id: card.id }, data: { priority: null } });
      expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({ message: 'quitó la prioridad' }));
    });

    it('poner la misma prioridad que ya tiene no toca la tarjeta ni la actividad', async () => {
      const card = withPriority('ALTA');
      prisma.card.findUnique.mockResolvedValue(card);

      await service.updatePriority(card.id, 'ALTA' as never, ACTOR_ID);

      expect(prisma.card.update).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('rechaza un valor fuera del enum sin consultar la base', async () => {
      await expect(service.updatePriority('card-1', 'URGENTE' as never, ACTOR_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.card.findUnique).not.toHaveBeenCalled();
    });

    it('tira 404 si la tarjeta no existe', async () => {
      prisma.card.findUnique.mockResolvedValue(null);
      await expect(service.updatePriority('nope', 'ALTA' as never, ACTOR_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
