import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ActivityLogService } from '../activity/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../supabase/supabase-storage.service';
import { CardsService } from './cards.service';
import { syncContainer } from './container-rollup';

jest.mock('./container-rollup', () => ({ syncContainer: jest.fn(), syncBoardContainers: jest.fn() }));

const ACTOR = 'actor-1';

const card = (over: Record<string, unknown> = {}) => ({
  id: 'k1',
  title: 'Tarjeta',
  parentId: null,
  dueDate: null as Date | null,
  _count: { children: 0 },
  column: { id: 'c0', boardId: 'board-1', board: { id: 'board-1', projectId: 'proj-1' } },
  ...over,
});

describe('CardsService — fecha de entrega y borrado', () => {
  let prisma: Record<string, any>;
  let activityLog: { log: jest.Mock };
  let storage: { remove: jest.Mock };
  let service: CardsService;

  beforeEach(() => {
    (syncContainer as jest.Mock).mockReset();
    prisma = {
      card: {
        findUnique: jest.fn().mockResolvedValue(card()),
        update: jest.fn(async ({ data }: { data: object }) => ({ id: 'k1', ...data })),
        delete: jest.fn(),
      },
      cardAttachment: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
    activityLog = { log: jest.fn() };
    storage = { remove: jest.fn().mockResolvedValue(undefined) };
    service = new CardsService(prisma as unknown as PrismaService, activityLog as unknown as ActivityLogService, storage as unknown as SupabaseStorageService);
  });

  describe('updateDueDate', () => {
    it('guarda la fecha a las 15:00 UTC (una fecha, no una hora) y lo deja en Actividad', async () => {
      await service.updateDueDate('k1', '2026-10-05', ACTOR);

      expect(prisma.card.update).toHaveBeenCalledWith({ where: { id: 'k1' }, data: { dueDate: new Date('2026-10-05T15:00:00Z') } });
      expect(activityLog.log).toHaveBeenCalledWith({
        projectId: 'proj-1',
        userId: ACTOR,
        type: 'CARD_UPDATED',
        message: 'fijó la entrega para el 5 de octubre de 2026',
        cardId: 'k1',
        cardTitle: 'Tarjeta',
      });
    });

    it('cambiarla dice de cuál a cuál; quitarla lo dice', async () => {
      prisma.card.findUnique.mockResolvedValue(card({ dueDate: new Date('2026-10-05T15:00:00Z') }));
      await service.updateDueDate('k1', '2026-11-20', ACTOR);
      expect(activityLog.log.mock.calls[0][0].message).toBe('cambió la entrega del 5 de octubre de 2026 al 20 de noviembre de 2026');

      await service.updateDueDate('k1', null, ACTOR);
      expect(prisma.card.update).toHaveBeenLastCalledWith({ where: { id: 'k1' }, data: { dueDate: null } });
      expect(activityLog.log.mock.calls[1][0].message).toBe('quitó la fecha de entrega');
    });

    it('es idempotente: poner la misma fecha (o quitar una que no hay) no toca la tarjeta ni la actividad', async () => {
      prisma.card.findUnique.mockResolvedValue(card({ dueDate: new Date('2026-10-05T15:00:00Z') }));
      await service.updateDueDate('k1', '2026-10-05', ACTOR);
      prisma.card.findUnique.mockResolvedValue(card());
      await service.updateDueDate('k1', null, ACTOR);

      expect(prisma.card.update).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it.each([['2026-02-31'], ['2026-13-01'], ['05/10/2026'], ['2026-10-05T10:00:00Z'], [''], ['mañana']])('rechaza %j (400) sin escribir', async (value) => {
      await expect(service.updateDueDate('k1', value, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.card.update).not.toHaveBeenCalled();
    });

    it('un contenedor no tiene fecha propia (400)', async () => {
      prisma.card.findUnique.mockResolvedValue(card({ _count: { children: 3 } }));
      await expect(service.updateDueDate('k1', '2026-10-05', ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.card.update).not.toHaveBeenCalled();
    });

    it('404 si la tarjeta no existe', async () => {
      prisma.card.findUnique.mockResolvedValue(null);
      await expect(service.updateDueDate('k1', '2026-10-05', ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('borra la tarjeta, sus archivos de Storage y lo deja en Actividad (con el título, que sobrevive)', async () => {
      prisma.cardAttachment.findMany.mockResolvedValue([{ storagePath: 'k1/a.pdf' }, { storagePath: 'k1/b.png' }]);
      await service.remove('k1', ACTOR);

      expect(prisma.card.delete).toHaveBeenCalledWith({ where: { id: 'k1' } });
      expect(storage.remove.mock.calls.map(([path]: [string]) => path)).toEqual(['k1/a.pdf', 'k1/b.png']);
      expect(activityLog.log).toHaveBeenCalledWith({
        projectId: 'proj-1',
        userId: ACTOR,
        type: 'CARD_UPDATED',
        message: 'eliminó la tarjeta "Tarjeta"',
        cardId: 'k1',
        cardTitle: 'Tarjeta',
      });
      expect(syncContainer).not.toHaveBeenCalled();
    });

    it('si Storage falla, la tarjeta igual queda borrada y no se propaga el error', async () => {
      prisma.cardAttachment.findMany.mockResolvedValue([{ storagePath: 'k1/a.pdf' }, { storagePath: 'k1/b.png' }]);
      storage.remove.mockRejectedValueOnce(new Error('storage caído'));
      await expect(service.remove('k1', ACTOR)).resolves.toBeUndefined();

      expect(storage.remove).toHaveBeenCalledTimes(2); // sigue con el resto
      expect(activityLog.log).toHaveBeenCalled();
    });

    it('una tarjeta DIVIDIDA no se borra: 409 que dice cuántas subtareas tiene y qué hacer, sin tocar nada', async () => {
      prisma.card.findUnique.mockResolvedValue(card({ _count: { children: 3 } }));
      const error = await service.remove('k1', ACTOR).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toMatch(/dividida en 3 subtareas/);
      expect(error.message).toMatch(/Borrá primero cada subtarea/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.card.delete).not.toHaveBeenCalled();
      expect(storage.remove).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('borrar una subtarea re-deriva a su madre en la misma transacción, y la Actividad dice "subtarea"', async () => {
      prisma.card.findUnique.mockResolvedValue(card({ parentId: 'p1', title: 'Backend' }));
      const order: string[] = [];
      prisma.card.delete.mockImplementation(async () => void order.push('borrar'));
      (syncContainer as jest.Mock).mockImplementation(async () => void order.push('derivar'));

      await service.remove('k1', ACTOR);

      expect(syncContainer).toHaveBeenCalledWith(prisma, 'p1');
      expect(order).toEqual(['borrar', 'derivar']);
      expect(activityLog.log.mock.calls[0][0].message).toBe('eliminó la subtarea "Backend"');
    });

    it('404 si la tarjeta no existe', async () => {
      prisma.card.findUnique.mockResolvedValue(null);
      await expect(service.remove('k1', ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
