import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ActivityLogService } from '../activity/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CardsService } from './cards.service';
import { syncContainer } from './container-rollup';

// La derivación del contenedor se prueba aparte (container-rollup.spec.ts); acá
// solo importa CUÁNDO se dispara.
jest.mock('./container-rollup', () => ({ syncContainer: jest.fn(), syncBoardContainers: jest.fn() }));

const ACTOR = 'actor-1';
const DUE = new Date('2026-10-01T15:00:00Z');
const COLUMNS = ['c0', 'c1', 'c2', 'c3'].map((id, position) => ({ id, boardId: 'board-1', name: `Col ${position}`, position }));

const parentCard = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  title: 'Tarjeta grande',
  parentId: null,
  completedAt: null,
  priority: 'ALTA',
  dueDate: DUE,
  progress: 50,
  storyPoints: 13,
  effortNote: 'no se puede partir',
  columnId: 'c1',
  assignees: [{ userId: 'u1' }, { userId: 'u2' }],
  _count: { children: 0 },
  column: { id: 'c1', boardId: 'board-1', board: { id: 'board-1', projectId: 'proj-1', project: { key: 'RED' }, columns: COLUMNS } },
  ...over,
});

describe('CardsService — subtareas', () => {
  let prisma: Record<string, any>;
  let activityLog: { log: jest.Mock };
  let service: CardsService;

  beforeEach(() => {
    (syncContainer as jest.Mock).mockReset();
    prisma = {
      card: {
        findUnique: jest.fn().mockResolvedValue(parentCard()),
        update: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _max: { position: 4 } }),
        create: jest.fn(async ({ data }: { data: { number: number; title: string } }) => ({ id: `n${data.number}`, number: data.number, title: data.title })),
      },
      cardAssignee: { deleteMany: jest.fn() },
      project: { update: jest.fn().mockResolvedValue({ nextCardNumber: 20 }) }, // ya incrementado en 3
      column: { findMany: jest.fn().mockResolvedValue(COLUMNS) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
    activityLog = { log: jest.fn() };
    service = new CardsService(prisma as unknown as PrismaService, activityLog as unknown as ActivityLogService);
  });

  const THREE = { subtasks: [{ title: 'Backend', storyPoints: 5 }, { title: 'Frontend', storyPoints: 5 }, { title: 'Pruebas', storyPoints: 3 }] };

  describe('divide', () => {
    it('crea las hijas en la PRIMERA columna, con código propio y en orden, y devuelve sus códigos', async () => {
      const result = await service.divide('p1', THREE, ACTOR);

      expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: 'proj-1' }, data: { nextCardNumber: { increment: 3 } }, select: { nextCardNumber: true } });
      const created = prisma.card.create.mock.calls.map(([args]: [{ data: Record<string, unknown> }]) => args.data);
      expect(created.map((d: Record<string, unknown>) => [d.columnId, d.number, d.position, d.title, d.storyPoints])).toEqual([
        ['c0', 17, 5, 'Backend', 5],
        ['c0', 18, 6, 'Frontend', 5],
        ['c0', 19, 7, 'Pruebas', 3],
      ]);
      expect(result.subtasks.map((s) => s.code)).toEqual(['RED-17', 'RED-18', 'RED-19']);
    });

    it('las hijas heredan prioridad, fecha y asignados de la original: dividir no pierde nada', async () => {
      await service.divide('p1', THREE, ACTOR);
      for (const [{ data }] of prisma.card.create.mock.calls) {
        expect(data).toMatchObject({ parentId: 'p1', priority: 'ALTA', dueDate: DUE });
        expect(data.assignees).toEqual({ create: [{ userId: 'u1' }, { userId: 'u2' }] });
      }
    });

    it('la original PIERDE lo propio: esfuerzo (el 13 "fue reemplazado"), justificación, prioridad, fecha y asignados', async () => {
      await service.divide('p1', THREE, ACTOR);

      expect(prisma.cardAssignee.deleteMany).toHaveBeenCalledWith({ where: { cardId: 'p1' } });
      expect(prisma.card.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { storyPoints: null, effortNote: null, priority: null, dueDate: null },
      });
    });

    it('su avance y columna se DERIVAN de las hijas: se re-deriva dentro de la misma transacción, después de crearlas', async () => {
      const order: string[] = [];
      prisma.card.create.mockImplementation(async ({ data }: { data: { number: number; title: string } }) => {
        order.push('hija');
        return { id: `n${data.number}`, number: data.number, title: data.title };
      });
      (syncContainer as jest.Mock).mockImplementation(async () => void order.push('derivar'));

      await service.divide('p1', THREE, ACTOR);

      expect(syncContainer).toHaveBeenCalledWith(prisma, 'p1');
      expect(order).toEqual(['hija', 'hija', 'hija', 'derivar']);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction.mock.calls[0][1]).toEqual({ timeout: 20_000 });
    });

    it('lo deja en Actividad, con los códigos de las hijas', async () => {
      await service.divide('p1', THREE, ACTOR);
      expect(activityLog.log).toHaveBeenCalledWith({
        projectId: 'proj-1',
        userId: ACTOR,
        type: 'CARD_UPDATED',
        message: 'dividió la tarjeta en 3 subtareas (RED-17, RED-18, RED-19)',
        cardId: 'p1',
        cardTitle: 'Tarjeta grande',
      });
    });

    it('una subtarea sin estimar es válida (storyPoints null o ausente)', async () => {
      await service.divide('p1', { subtasks: [{ title: 'A' }, { title: 'B', storyPoints: null }] }, ACTOR);
      expect(prisma.card.create.mock.calls.map(([a]: [{ data: { storyPoints: unknown } }]) => a.data.storyPoints)).toEqual([null, null]);
    });

    it('si el tablero tiene una sola columna (primera = última), las hijas nacen cerradas, como en `create`', async () => {
      prisma.card.findUnique.mockResolvedValue(
        parentCard({ column: { id: 'c0', boardId: 'board-1', board: { id: 'board-1', projectId: 'proj-1', project: { key: 'RED' }, columns: [COLUMNS[0]] } } }),
      );
      await service.divide('p1', THREE, ACTOR);
      expect(prisma.card.create.mock.calls[0][0].data).toMatchObject({ progress: 100, completedAt: expect.any(Date) });
    });

    describe('validaciones — nada se escribe si algo está mal', () => {
      const expectRejected = async (input: unknown, error: new (...a: never[]) => Error) => {
        await expect(service.divide('p1', input as never, ACTOR)).rejects.toBeInstanceOf(error);
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.card.create).not.toHaveBeenCalled();
      };

      it('mínimo dos subtareas (dividir en una no es dividir), máximo 12', async () => {
        await expectRejected({ subtasks: [{ title: 'Sola' }] }, BadRequestException);
        await expectRejected({ subtasks: [] }, BadRequestException);
        await expectRejected({}, BadRequestException);
        await expectRejected({ subtasks: 'no-es-lista' }, BadRequestException);
        await expectRejected({ subtasks: Array.from({ length: 13 }, (_, i) => ({ title: `S${i}` })) }, BadRequestException);
      });

      it('cada subtarea necesita título (recortado, hasta 200) y un esfuerzo de la escala o ninguno', async () => {
        await expectRejected({ subtasks: [{ title: 'ok' }, { title: '   ' }] }, BadRequestException);
        await expectRejected({ subtasks: [{ title: 'ok' }, { storyPoints: 5 }] }, BadRequestException);
        await expectRejected({ subtasks: [{ title: 'ok' }, { title: 'x'.repeat(201) }] }, BadRequestException);
        await expectRejected({ subtasks: [{ title: 'ok' }, { title: 'B', storyPoints: 4 }] }, BadRequestException);
        await expectRejected({ subtasks: [{ title: 'ok' }, { title: 'B', storyPoints: '5' }] }, BadRequestException);
      });

      it('una subtarea no se divide (un solo nivel)', async () => {
        prisma.card.findUnique.mockResolvedValue(parentCard({ parentId: 'otra' }));
        await expectRejected(THREE, ConflictException);
      });

      it('una tarjeta ya dividida no se vuelve a dividir', async () => {
        prisma.card.findUnique.mockResolvedValue(parentCard({ _count: { children: 3 } }));
        await expectRejected(THREE, ConflictException);
      });

      it('una tarjeta cerrada no se divide: reabrirla sin que nadie lo decida no es dividir', async () => {
        prisma.card.findUnique.mockResolvedValue(parentCard({ completedAt: new Date() }));
        await expectRejected(THREE, ConflictException);
      });

      it('404 si la tarjeta no existe', async () => {
        prisma.card.findUnique.mockResolvedValue(null);
        await expectRejected(THREE, NotFoundException);
      });
    });
  });

  describe('un contenedor no tiene esfuerzo, prioridad, asignados ni avance propios, ni se mueve a mano', () => {
    beforeEach(() => {
      prisma.card.findUnique.mockResolvedValue(parentCard({ _count: { children: 3 } }));
      prisma.user = { findUnique: jest.fn().mockResolvedValue({ id: 'u9', name: 'Ana', deletedAt: null }) };
      prisma.cardAssignee.upsert = jest.fn();
    });

    const untouched = () => {
      expect(prisma.card.update).not.toHaveBeenCalled();
      expect(prisma.cardAssignee.upsert).not.toHaveBeenCalled();
      expect(prisma.cardAssignee.deleteMany).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    };

    it.each([
      ['mover', () => service.move('p1', 'c2', ACTOR)],
      ['cambiar el avance', () => service.updateProgress('p1', 75, ACTOR)],
      ['estimar el esfuerzo', () => service.updateStoryPoints('p1', 5, ACTOR)],
      ['ponerle prioridad', () => service.updatePriority('p1', 'ALTA' as never, ACTOR)],
      ['asignarla', () => service.addAssignee('p1', 'u9', ACTOR)],
      ['quitar un asignado', () => service.removeAssignee('p1', 'u9', ACTOR)],
    ])('%s se rechaza (400) sin escribir nada', async (_name, action) => {
      await expect(action()).rejects.toBeInstanceOf(BadRequestException);
      untouched();
    });

    it('sí se le puede cambiar el título y la descripción', async () => {
      prisma.card.update.mockResolvedValue({ id: 'p1', title: 'Nuevo' });
      await service.updateDetails('p1', { title: 'Nuevo' }, ACTOR);
      expect(prisma.card.update).toHaveBeenCalled();
    });
  });

  describe('cuando cambia una subtarea, su contenedor se re-deriva en la misma transacción', () => {
    const child = (over: Record<string, unknown> = {}) => parentCard({ id: 'h1', parentId: 'p1', priority: null, storyPoints: 5, dueDate: null, ...over });

    beforeEach(() => {
      prisma.card.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: object }) => ({ id: where.id, ...data }));
      prisma.card.findMany = jest.fn().mockResolvedValue([]);
      prisma.card.updateMany = jest.fn();
      prisma.card.findUniqueOrThrow = jest.fn().mockResolvedValue({ id: 'h1' });
      prisma.$executeRaw = jest.fn();
    });

    it('cambiar el avance de una hija', async () => {
      prisma.card.findUnique.mockResolvedValue(child());
      await service.updateProgress('h1', 100, ACTOR);
      expect(syncContainer).toHaveBeenCalledWith(prisma, 'p1');
    });

    it('mover una hija de columna', async () => {
      prisma.card.findUnique.mockResolvedValue(child({ column: { id: 'c1', boardId: 'board-1', board: { projectId: 'proj-1' } } }));
      await service.move('h1', 'c2', ACTOR);
      expect(syncContainer).toHaveBeenCalledWith(prisma, 'p1');
    });

    it('una tarjeta común (sin madre) no dispara nada', async () => {
      prisma.card.findUnique.mockResolvedValue(child({ parentId: null }));
      await service.updateProgress('h1', 100, ACTOR);
      expect(syncContainer).not.toHaveBeenCalled();
    });
  });

  describe('getDetail', () => {
    const detailRow = (over: Record<string, unknown> = {}) => ({
      id: 'p1',
      number: 16,
      title: 'Tarjeta grande',
      description: null,
      priority: null,
      dueDate: null,
      progress: 25,
      storyPoints: null,
      effortNote: null,
      completedAt: null,
      parentId: null,
      createdAt: new Date('2026-09-01'),
      parent: null,
      children: [],
      assignees: [],
      column: { id: 'c0', name: 'Col 0', board: { project: { id: 'proj-1', key: 'RED', name: 'Rediseño', color: '#b4552f' }, columns: COLUMNS.map(({ id, name }) => ({ id, name })) } },
      ...over,
    });
    beforeEach(() => {
      prisma.projectMember = { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue({ role: 'EDITOR' }) };
      prisma.user = { findUnique: jest.fn().mockResolvedValue({ role: 'DEVELOPER' }) };
    });

    it('un contenedor lista sus subtareas con código, avance, esfuerzo y columna; y no se puede volver a dividir', async () => {
      prisma.card.findUnique.mockResolvedValue(
        detailRow({
          children: [
            { id: 'h1', number: 17, title: 'Backend', progress: 100, completedAt: new Date(), storyPoints: 5, column: { name: 'Hecho' }, assignees: [{ user: { id: 'u1', name: 'Ana' } }] },
            { id: 'h2', number: 18, title: 'Frontend', progress: 0, completedAt: null, storyPoints: null, column: { name: 'Por hacer' }, assignees: [] },
          ],
        }),
      );
      const d = await service.getDetail('p1', 'u1');

      expect(d.isContainer).toBe(true);
      expect(d.canDivide).toBe(false);
      expect(d.parent).toBeNull();
      expect(d.subtasks).toEqual([
        { id: 'h1', code: 'RED-17', title: 'Backend', progress: 100, completed: true, storyPoints: 5, column: 'Hecho', assignees: [{ id: 'u1', name: 'Ana' }] },
        { id: 'h2', code: 'RED-18', title: 'Frontend', progress: 0, completed: false, storyPoints: null, column: 'Por hacer', assignees: [] },
      ]);
    });

    it('una subtarea dice de quién es y no se puede dividir', async () => {
      prisma.card.findUnique.mockResolvedValue(detailRow({ id: 'h1', number: 17, parentId: 'p1', parent: { id: 'p1', number: 16, title: 'Tarjeta grande' } }));
      const d = await service.getDetail('h1', 'u1');

      expect(d.parent).toEqual({ id: 'p1', code: 'RED-16', title: 'Tarjeta grande' });
      expect(d.isContainer).toBe(false);
      expect(d.canDivide).toBe(false);
    });

    it('una hoja abierta de primer nivel, para quien puede editar, se puede dividir; un VIEWER o una cerrada no', async () => {
      prisma.card.findUnique.mockResolvedValue(detailRow());
      expect((await service.getDetail('p1', 'u1')).canDivide).toBe(true);

      prisma.projectMember.findUnique.mockResolvedValue({ role: 'VIEWER' });
      expect((await service.getDetail('p1', 'u1')).canDivide).toBe(false);

      prisma.projectMember.findUnique.mockResolvedValue({ role: 'EDITOR' });
      prisma.card.findUnique.mockResolvedValue(detailRow({ completedAt: new Date() }));
      expect((await service.getDetail('p1', 'u1')).canDivide).toBe(false);
    });
  });
});
