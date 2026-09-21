import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ActivityLogService } from '../activity/activity-log.service';
import { ColumnsService } from './columns.service';
import { PrismaService } from '../prisma/prisma.service';

const PROJECT_ID = 'proj-1';
const ACTOR_ID = 'actor-1';
const BOARD = { id: 'board-1', projectId: PROJECT_ID };

function col(id: string, position: number) {
  return { id, boardId: BOARD.id, name: id, position };
}

/// Las dos escrituras de la reconciliación (BACKEND.md §2), tal como se
/// esperan sobre un tablero cuya última columna es `lastId`.
function expectReconciled(tx: { card: { updateMany: jest.Mock } }, lastId: string) {
  expect(tx.card.updateMany).toHaveBeenCalledWith({
    where: { column: { boardId: BOARD.id }, columnId: { not: lastId }, progress: 100 },
    data: { progress: 75, completedAt: null },
  });
  expect(tx.card.updateMany).toHaveBeenCalledWith({
    where: { columnId: lastId, OR: [{ progress: { not: 100 } }, { completedAt: null }] },
    data: { progress: 100, completedAt: expect.any(Date) },
  });
}

describe('ColumnsService', () => {
  let prisma: {
    board: { findUnique: jest.Mock };
    column: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    column: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    card: { updateMany: jest.Mock; findMany: jest.Mock };
  };
  let activityLog: { log: jest.Mock };
  let service: ColumnsService;

  beforeEach(() => {
    prisma = {
      board: { findUnique: jest.fn().mockResolvedValue(BOARD) },
      column: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };
    tx = {
      column: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      // { count } como devuelve Prisma: reabiertas primero, cerradas después.
      // findMany: los contenedores del tablero (ninguno en estos casos).
      card: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));
    activityLog = { log: jest.fn() };
    service = new ColumnsService(prisma as unknown as PrismaService, activityLog as unknown as ActivityLogService);
  });

  describe('addColumn', () => {
    it('agrega la columna al final (position = última + 1)', async () => {
      prisma.column.findMany.mockResolvedValue([col('c1', 0), col('c2', 1)]);
      tx.column.create.mockResolvedValue(col('c3', 2));

      await service.addColumn('board-1', 'Bloqueado', ACTOR_ID);

      expect(tx.column.create).toHaveBeenCalledWith({
        data: { boardId: 'board-1', name: 'Bloqueado', position: 2 },
      });
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: PROJECT_ID, userId: ACTOR_ID, type: 'COLUMN_CREATED' }),
      );
    });

    it('la columna nueva pasa a ser la última: reabre las tarjetas cerradas de la anterior, en la misma transacción', async () => {
      prisma.column.findMany.mockResolvedValue([col('c1', 0), col('c2', 1)]);
      tx.column.create.mockResolvedValue(col('c3', 2));

      await service.addColumn('board-1', 'Bloqueado', ACTOR_ID);

      expectReconciled(tx, 'c3');
    });

    it('usa position 0 si el tablero no tiene columnas todavía, sin reconciliar nada', async () => {
      prisma.column.findMany.mockResolvedValue([]);
      tx.column.create.mockResolvedValue(col('c1', 0));

      await service.addColumn('board-1', 'Por hacer', ACTOR_ID);

      expect(tx.column.create).toHaveBeenCalledWith({
        data: { boardId: 'board-1', name: 'Por hacer', position: 0 },
      });
      expect(tx.card.updateMany).not.toHaveBeenCalled();
    });

    it('tira 404 si el tablero no existe', async () => {
      prisma.board.findUnique.mockResolvedValue(null);
      await expect(service.addColumn('nope', 'X', ACTOR_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateColumn', () => {
    it('renombra sin tocar position ni tarjetas cuando no se manda position', async () => {
      prisma.column.findUnique.mockResolvedValue(col('c1', 0));
      prisma.column.update.mockResolvedValue(col('c1', 0));

      await service.updateColumn('board-1', 'c1', { name: 'Nuevo nombre' }, ACTOR_ID);

      expect(prisma.column.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { name: 'Nuevo nombre' },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('reordena el resto de las columnas al mover position', async () => {
      prisma.column.findUnique.mockResolvedValue(col('c1', 0));
      prisma.column.findMany.mockResolvedValue([col('c1', 0), col('c2', 1), col('c3', 2)]);
      tx.column.findUniqueOrThrow.mockResolvedValue(col('c1', 2));

      // Mover c1 (índice 0) a la posición 2 (al final): queda [c2, c3, c1]
      await service.updateColumn('board-1', 'c1', { position: 2 }, ACTOR_ID);

      expect(tx.column.updateMany).toHaveBeenCalledWith({
        where: { boardId: 'board-1' },
        data: { position: { increment: 1000 } },
      });
      expect(tx.column.update).toHaveBeenNthCalledWith(1, { where: { id: 'c2' }, data: { position: 0 } });
      expect(tx.column.update).toHaveBeenNthCalledWith(2, { where: { id: 'c3' }, data: { position: 1 } });
      expect(tx.column.update).toHaveBeenNthCalledWith(3, { where: { id: 'c1' }, data: { position: 2 } });
    });

    describe('reconciliación de tarjetas al cambiar cuál es la última', () => {
      beforeEach(() => {
        prisma.column.findUnique.mockResolvedValue(col('c1', 0));
        prisma.column.findMany.mockResolvedValue([col('c1', 0), col('c2', 1), col('c3', 2)]);
        tx.column.findUniqueOrThrow.mockResolvedValue(col('c1', 2));
      });

      it('mover la última al medio: la nueva última cierra sus tarjetas y las que quedaron fuera se reabren (75, completedAt null)', async () => {
        // [c1, c2, c3] → mover c3 a la posición 1 → [c1, c3, c2]: la última pasa de c3 a c2.
        prisma.column.findUnique.mockResolvedValue(col('c3', 2));

        await service.updateColumn('board-1', 'c3', { position: 1 }, ACTOR_ID);

        expectReconciled(tx, 'c2');
      });

      it('mover una columna del medio al final: pasa a ser la última y se reconcilia contra ella', async () => {
        prisma.column.findUnique.mockResolvedValue(col('c2', 1));

        // [c1, c2, c3] → c2 al final → [c1, c3, c2]
        await service.updateColumn('board-1', 'c2', { position: 2 }, ACTOR_ID);

        expectReconciled(tx, 'c2');
      });

      it('la reconciliación corre dentro de la transacción del reorden, después de reasignar las posiciones', async () => {
        prisma.column.findUnique.mockResolvedValue(col('c2', 1));
        const order: string[] = [];
        tx.column.update.mockImplementation(async () => void order.push('position'));
        tx.card.updateMany.mockImplementation(async () => {
          order.push('cards');
          return { count: 0 };
        });

        await service.updateColumn('board-1', 'c2', { position: 2 }, ACTOR_ID);

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(order.lastIndexOf('position')).toBeLessThan(order.indexOf('cards'));
      });

      it('si el reorden no cambia cuál es la última, no toca ninguna tarjeta', async () => {
        // [c1, c2, c3] → c1 a la posición 1 → [c2, c1, c3]: c3 sigue siendo la última.
        await service.updateColumn('board-1', 'c1', { position: 1 }, ACTOR_ID);

        expect(tx.card.updateMany).not.toHaveBeenCalled();
      });

      it('deja constancia en Actividad, con cuántas tarjetas se reabrieron y cerraron', async () => {
        prisma.column.findUnique.mockResolvedValue(col('c3', 2));
        tx.card.updateMany.mockResolvedValueOnce({ count: 3 }).mockResolvedValueOnce({ count: 1 });

        await service.updateColumn('board-1', 'c3', { position: 1 }, ACTOR_ID);

        expect(activityLog.log).toHaveBeenCalledWith({
          projectId: PROJECT_ID,
          userId: ACTOR_ID,
          type: 'COLUMN_REORDERED',
          message: 'movió la columna "c3" a la posición 2; la última ahora es "c2" (3 tarjetas se reabrieron, 1 tarjeta se cerró)',
        });
      });

      it('un reorden que no mueve nada no reconcilia ni registra actividad', async () => {
        await service.updateColumn('board-1', 'c1', { position: 0 }, ACTOR_ID);

        expect(tx.card.updateMany).not.toHaveBeenCalled();
        expect(activityLog.log).not.toHaveBeenCalled();
      });
    });

    it('tira 404 si la columna no pertenece a ese tablero', async () => {
      prisma.column.findUnique.mockResolvedValue(col('c1', 0));
      await expect(
        service.updateColumn('otro-board', 'c1', { name: 'X' }, ACTOR_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteColumn', () => {
    it('reasigna las tarjetas a la primera columna y borra la columna', async () => {
      prisma.column.findMany.mockResolvedValue([col('c1', 0), col('c2', 1), col('c3', 2)]);

      // Borrar c2 (columna del medio, no es la última)
      await service.deleteColumn('board-1', 'c2', ACTOR_ID);

      expect(tx.card.updateMany).toHaveBeenCalledWith({ where: { columnId: 'c2' }, data: { columnId: 'c1' } });
      expect(tx.column.delete).toHaveBeenCalledWith({ where: { id: 'c2' } });
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: PROJECT_ID, userId: ACTOR_ID, type: 'COLUMN_DELETED' }),
      );
    });

    it('si borra la última, baja a 75 y limpia completedAt (invariante, caso 4)', async () => {
      prisma.column.findMany.mockResolvedValue([col('c1', 0), col('c2', 1), col('c3', 2)]);

      await service.deleteColumn('board-1', 'c3', ACTOR_ID);

      expect(tx.card.updateMany).toHaveBeenCalledWith({
        where: { columnId: 'c3' },
        data: { columnId: 'c1', progress: 75, completedAt: null },
      });
    });

    it('al borrar la última, la anteúltima hereda el rol de "hecho": se reconcilia contra ella', async () => {
      prisma.column.findMany.mockResolvedValue([col('c1', 0), col('c2', 1), col('c3', 2)]);

      await service.deleteColumn('board-1', 'c3', ACTOR_ID);

      expectReconciled(tx, 'c2');
    });

    it('en un tablero de dos, borrar la primera deja a la última recibiendo las tarjetas: se cierran, no quedan abiertas dentro de ella', async () => {
      prisma.column.findMany.mockResolvedValue([col('c1', 0), col('c2', 1)]);

      await service.deleteColumn('board-1', 'c1', ACTOR_ID);

      expect(tx.card.updateMany).toHaveBeenCalledWith({ where: { columnId: 'c1' }, data: { columnId: 'c2' } });
      expectReconciled(tx, 'c2');
    });

    it('borra y reconcilia en la misma transacción, en ese orden', async () => {
      prisma.column.findMany.mockResolvedValue([col('c1', 0), col('c2', 1), col('c3', 2)]);
      const order: string[] = [];
      tx.column.delete.mockImplementation(async () => void order.push('delete'));
      tx.card.updateMany.mockImplementation(async (args: { where: { column?: unknown; OR?: unknown } }) => {
        order.push(args.where.column ? 'reopen' : args.where.OR ? 'close' : 'move');
        return { count: 0 };
      });

      await service.deleteColumn('board-1', 'c3', ACTOR_ID);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['move', 'delete', 'reopen', 'close']);
    });

    it('rechaza borrar la única columna del tablero', async () => {
      prisma.column.findMany.mockResolvedValue([col('c1', 0)]);
      await expect(service.deleteColumn('board-1', 'c1', ACTOR_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('tira 404 si la columna no existe en ese tablero', async () => {
      prisma.column.findMany.mockResolvedValue([col('c1', 0), col('c2', 1)]);
      await expect(service.deleteColumn('board-1', 'nope', ACTOR_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
