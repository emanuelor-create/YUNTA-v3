import { PrismaService } from '../prisma/prisma.service';
import { closedDay, lastClosedDays, ymdInTimeZone } from './snapshot-dates';
import { SnapshotsService } from './snapshots.service';

const DAY_MS = 24 * 60 * 60 * 1000;
// 00:00 del 21 de septiembre en Buenos Aires (UTC-3) = 03:00Z.
const MIDNIGHT_21 = new Date('2026-09-21T03:00:00.000Z');

describe('snapshot-dates', () => {
  it('a medianoche del 21 (zona de la cuenta) el día cerrado es el 20', () => {
    expect(closedDay(MIDNIGHT_21)).toBe('2026-09-20');
  });

  it('el día cerrado no depende de la hora en que se corra: a las 15:00 del 21 sigue siendo el 20', () => {
    expect(closedDay(new Date('2026-09-21T18:00:00.000Z'))).toBe('2026-09-20');
  });

  it('usa la zona de la cuenta, no UTC: 22:00 del 20 en Buenos Aires ya es el 21 en UTC, pero el día cerrado es el 19', () => {
    const at2200 = new Date('2026-09-21T01:00:00.000Z'); // 22:00 del 20 en UTC-3
    expect(ymdInTimeZone(at2200)).toBe('2026-09-20');
    expect(closedDay(at2200)).toBe('2026-09-19');
  });

  it('lastClosedDays devuelve N días consecutivos terminando en el último cerrado, del más viejo al más nuevo', () => {
    const days = lastClosedDays(MIDNIGHT_21, 7);
    expect(days.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20',
    ]);
  });
});

describe('SnapshotsService.capture', () => {
  let prisma: {
    project: { findMany: jest.Mock };
    card: { findMany: jest.Mock };
    user: { findMany: jest.Mock };
    cardAssignee: { findMany: jest.Mock };
    projectDailySnapshot: { upsert: jest.Mock };
    userDailySnapshot: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: SnapshotsService;

  const card = (projectId: string, over: { completedAt?: Date | null; storyPoints?: number | null } = {}) => ({
    completedAt: over.completedAt ?? null,
    storyPoints: over.storyPoints === undefined ? null : over.storyPoints,
    column: { board: { projectId } },
  });

  beforeEach(() => {
    prisma = {
      project: { findMany: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p-vacio' }]) },
      card: {
        findMany: jest.fn().mockResolvedValue([
          card('p1', { storyPoints: 5 }),
          card('p1', { storyPoints: 8, completedAt: new Date('2026-09-19') }),
          card('p1', { storyPoints: null, completedAt: new Date('2026-09-18') }),
          card('p1'),
        ]),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u-sin-nada' }]) },
      cardAssignee: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'u1', card: { dueDate: new Date(MIDNIGHT_21.getTime() - DAY_MS), completedAt: null } }, // vencida
          { userId: 'u1', card: { dueDate: new Date(MIDNIGHT_21.getTime() + 2 * DAY_MS), completedAt: null } }, // vence pronto
          { userId: 'u1', card: { dueDate: new Date(MIDNIGHT_21.getTime() + 20 * DAY_MS), completedAt: null } }, // lejos
        ]),
      },
      projectDailySnapshot: { upsert: jest.fn((args) => args) },
      userDailySnapshot: { upsert: jest.fn((args) => args) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    service = new SnapshotsService(prisma as unknown as PrismaService);
  });

  it('una fila por proyecto activo, etiquetada con el día cerrado, con abiertas / cerradas / puntos', async () => {
    const result = await service.capture(MIDNIGHT_21);

    expect(result).toEqual({ date: '2026-09-20', projects: 2, users: 2 });
    const date = new Date('2026-09-20T00:00:00.000Z');
    expect(prisma.projectDailySnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_date: { projectId: 'p1', date } },
        create: { projectId: 'p1', date, openCards: 2, completedCards: 2, totalPoints: 13, completedPoints: 8 },
      }),
    );
  });

  it('los puntos usan la misma definición que /stats: solo las estimadas suman, y "cerrada" es completedAt', async () => {
    await service.capture(MIDNIGHT_21);
    const call = prisma.projectDailySnapshot.upsert.mock.calls.find((c) => c[0].create.projectId === 'p1')![0];
    expect(call.create.totalPoints).toBe(13); // 5 + 8; la sin estimar no suma
    expect(call.create.completedPoints).toBe(8);
  });

  it('un proyecto sin tarjetas igual tiene su fila, en ceros', async () => {
    await service.capture(MIDNIGHT_21);
    expect(prisma.projectDailySnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ projectId: 'p-vacio', openCards: 0, completedCards: 0, totalPoints: 0, completedPoints: 0 }),
      }),
    );
  });

  it('una fila por persona activa con asignadas / vencidas / vencen pronto, con las mismas definiciones que Usuarios y el Dashboard', async () => {
    await service.capture(MIDNIGHT_21);
    const date = new Date('2026-09-20T00:00:00.000Z');

    expect(prisma.userDailySnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId: 'u1', date, assigned: 3, overdue: 1, dueSoon: 1 } }),
    );
    // Quien no tiene nada asignado también queda registrado: cero es un dato, no una ausencia.
    expect(prisma.userDailySnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId: 'u-sin-nada', date, assigned: 0, overdue: 0, dueSoon: 0 } }),
    );
  });

  it('no incluye proyectos archivados ni usuarios eliminados o inactivos (lo filtra la consulta)', async () => {
    await service.capture(MIDNIGHT_21);
    expect(prisma.project.findMany).toHaveBeenCalledWith({ where: { archivedAt: null }, select: { id: true } });
    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { deletedAt: null, status: 'ACTIVE' }, select: { id: true } });
    // Solo hojas: un contenedor (tarjeta dividida) no se cuenta, sus hijas sí.
    expect(prisma.card.findMany.mock.calls[0][0].where).toEqual({ column: { board: { project: { archivedAt: null } } }, children: { none: {} } });
    expect(prisma.cardAssignee.findMany.mock.calls[0][0].where).toEqual({ card: { completedAt: null, children: { none: {} } } });
  });

  it('es idempotente: usa upsert por (proyecto, día) y (persona, día), nunca un create a secas', async () => {
    await service.capture(MIDNIGHT_21);
    await service.capture(MIDNIGHT_21);

    const calls = [...prisma.projectDailySnapshot.upsert.mock.calls, ...prisma.userDailySnapshot.upsert.mock.calls];
    expect(calls).toHaveLength(8);
    for (const [args] of calls) {
      expect(args).toEqual(expect.objectContaining({ where: expect.any(Object), create: expect.any(Object), update: expect.any(Object) }));
    }
  });

  it('todo va en una sola transacción: o queda la foto completa del día o no queda ninguna', async () => {
    await service.capture(MIDNIGHT_21);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(4); // 2 proyectos + 2 personas
  });

  it('el job nocturno no tira el proceso si algo falla', async () => {
    prisma.project.findMany.mockRejectedValue(new Error('base caída'));
    await expect(service.captureNightly()).resolves.toBeUndefined();
  });
});
