import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-17T12:00:00.000Z');

const COLUMNS = [
  { id: 'col-todo', boardId: 'board-1', name: 'Por hacer', position: 0 },
  { id: 'col-doing', boardId: 'board-1', name: 'En curso', position: 1 },
  { id: 'col-done', boardId: 'board-1', name: 'Hecho', position: 2 },
];

function daysAgo(n: number): Date {
  return new Date(now.getTime() - n * DAY_MS);
}

function daysFromNow(n: number): Date {
  return new Date(now.getTime() + n * DAY_MS);
}

function card(overrides: Partial<{
  columnId: string;
  progress: number;
  storyPoints: number | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  dueDate: Date | null;
}> = {}) {
  return {
    columnId: overrides.columnId ?? 'col-todo',
    progress: overrides.progress ?? 0,
    storyPoints: overrides.storyPoints === undefined ? null : overrides.storyPoints,
    completedAt: overrides.completedAt ?? null,
    createdAt: overrides.createdAt ?? daysAgo(30),
    updatedAt: overrides.updatedAt ?? daysAgo(30),
    dueDate: overrides.dueDate ?? null,
  };
}

describe('ProjectsService.getStats', () => {
  let prisma: { project: { findUnique: jest.Mock }; card: { findMany: jest.Mock } };
  let service: ProjectsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    prisma = {
      project: { findUnique: jest.fn() },
      card: { findMany: jest.fn() },
    };
    service = new ProjectsService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function mockProject(cards: ReturnType<typeof card>[]) {
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj-1',
      board: { id: 'board-1', columns: COLUMNS },
    });
    prisma.card.findMany.mockResolvedValue(cards);
  }

  it('tira 404 si el proyecto no existe', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(service.getStats('nope', 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sin tablero, devuelve todo vacío sin consultar cards', async () => {
    prisma.project.findUnique.mockResolvedValue({ id: 'proj-1', board: null });

    const stats = await service.getStats('proj-1', 7);

    expect(stats.byColumn).toEqual([]);
    expect(stats.byProgress).toEqual({ 0: 0, 25: 0, 50: 0, 75: 0, 100: 0 });
    expect(stats.points).toEqual({ total: 0, completed: 0, avg: 0, toSplit: 0 });
    expect(stats.window).toEqual({ completed: 0, updated: 0, created: 0, dueSoon: 0 });
    expect(prisma.card.findMany).not.toHaveBeenCalled();
  });

  it('byColumn trae las tres columnas en orden de position, incluso con count 0', async () => {
    mockProject([card({ columnId: 'col-doing' }), card({ columnId: 'col-doing' })]);

    const stats = await service.getStats('proj-1', 7);

    expect(stats.byColumn).toEqual([
      { columnId: 'col-todo', name: 'Por hacer', count: 0 },
      { columnId: 'col-doing', name: 'En curso', count: 2 },
      { columnId: 'col-done', name: 'Hecho', count: 0 },
    ]);
  });

  it('byProgress trae las cinco claves siempre, aunque estén en 0', async () => {
    mockProject([card({ progress: 50 }), card({ progress: 50 }), card({ progress: 100, completedAt: now })]);

    const stats = await service.getStats('proj-1', 7);

    expect(stats.byProgress).toEqual({ 0: 0, 25: 0, 50: 2, 75: 0, 100: 1 });
  });

  describe('cards (total y completadas)', () => {
    it('sin tablero, es 0/0', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1', board: null });
      expect((await service.getStats('proj-1', 7)).cards).toEqual({ total: 0, completed: 0 });
    });

    it('completed coincide con byProgress[100] y con las tarjetas de points.completed (una sola definición de "completada")', async () => {
      // Datos con el invariante de BACKEND.md §1: progress 100 ⇔ completedAt ⇔ última columna.
      mockProject([
        card({ columnId: 'col-done', progress: 100, completedAt: now, storyPoints: 8 }),
        card({ columnId: 'col-done', progress: 100, completedAt: now, storyPoints: 5 }),
        card({ columnId: 'col-doing', progress: 50, storyPoints: 3 }),
        card({ columnId: 'col-todo', progress: 0, storyPoints: null }),
      ]);

      const stats = await service.getStats('proj-1', 7);

      expect(stats.cards).toEqual({ total: 4, completed: 2 });
      expect(stats.cards.completed).toBe(stats.byProgress[100]);
      expect(stats.cards.total).toBe(stats.byColumn.reduce((sum, column) => sum + column.count, 0));
      expect(stats.points.completed).toBe(13);
      // 50% de tarjetas vs 81% de puntos (13/16): difieren por datos reales — las cerradas pesan más.
      expect(Math.round((stats.cards.completed / stats.cards.total) * 100)).toBe(50);
      expect(Math.round((stats.points.completed / stats.points.total) * 100)).toBe(81);
    });
  });

  describe('points', () => {
    it('avg excluye las tarjetas sin storyPoints (no cuentan como 0)', async () => {
      mockProject([
        card({ storyPoints: 5 }),
        card({ storyPoints: 3 }),
        card({ storyPoints: null }),
        card({ storyPoints: null }),
      ]);

      const stats = await service.getStats('proj-1', 7);

      // (5+3)/2, no /4 — las sin estimar no entran en el promedio.
      expect(stats.points.total).toBe(8);
      expect(stats.points.avg).toBe(4);
    });

    it('completed y total salen del mismo conteo (no pueden contradecir el % de completadas)', async () => {
      mockProject([
        card({ storyPoints: 5, completedAt: now }),
        card({ storyPoints: 3, completedAt: null }),
        card({ storyPoints: 8, completedAt: now }),
      ]);

      const stats = await service.getStats('proj-1', 7);

      expect(stats.points.total).toBe(16);
      expect(stats.points.completed).toBe(13); // 5 + 8, las cerradas
    });

    it('toSplit cuenta solo storyPoints=13 abiertas (completedAt null)', async () => {
      mockProject([
        card({ storyPoints: 13, completedAt: null }),
        card({ storyPoints: 13, completedAt: now }), // cerrada: no cuenta
        card({ storyPoints: 8, completedAt: null }),
      ]);

      const stats = await service.getStats('proj-1', 7);

      expect(stats.points.toSplit).toBe(1);
    });

    it('avg es 0 (no NaN) si ninguna tarjeta tiene storyPoints', async () => {
      mockProject([card({ storyPoints: null })]);
      const stats = await service.getStats('proj-1', 7);
      expect(stats.points.avg).toBe(0);
    });
  });

  describe('window', () => {
    it('reporta completed/updated/created reales aunque el proyecto quede sin tarjetas abiertas', async () => {
      // Un informe de cierre que dice "0 cerradas" la semana que se cerró
      // todo estaría roto (BACKEND.md §3.1, corregido).
      mockProject([
        card({ completedAt: daysAgo(1), createdAt: daysAgo(1), updatedAt: daysAgo(1) }),
        card({ completedAt: daysAgo(2), createdAt: daysAgo(2), updatedAt: daysAgo(2) }),
      ]);

      const stats = await service.getStats('proj-1', 7);

      expect(stats.window.completed).toBe(2);
      expect(stats.window.created).toBe(2);
      expect(stats.window.updated).toBe(2);
      expect(stats.window.dueSoon).toBe(0); // esto sí da 0 solo: no hay abiertas que contar
    });

    it('cuenta completed/updated/created dentro de la ventana pedida', async () => {
      mockProject([
        card({ completedAt: daysAgo(3), createdAt: daysAgo(3), updatedAt: daysAgo(3) }), // dentro de 7d
        card({ completedAt: daysAgo(10) }), // fuera de 7d
        card({ completedAt: null, createdAt: daysAgo(1), updatedAt: daysAgo(1) }), // abierta, la deja "con abiertas"
      ]);

      const stats = await service.getStats('proj-1', 7);

      expect(stats.window.completed).toBe(1);
      expect(stats.window.created).toBe(2); // daysAgo(3) y daysAgo(1)
    });

    it('dueSoon cuenta abiertas que vencen en los próximos 7 días, sin importar el window pedido', async () => {
      mockProject([
        card({ completedAt: null, dueDate: daysFromNow(3) }), // dueSoon
        card({ completedAt: null, dueDate: daysFromNow(10) }), // no
        card({ completedAt: now, dueDate: daysFromNow(2) }), // cerrada: no cuenta
        card({ completedAt: null, dueDate: null }),
      ]);

      const stats = await service.getStats('proj-1', 30);

      expect(stats.window.dueSoon).toBe(1);
    });
  });
});

describe('ProjectsService.list', () => {
  let prisma: {
    project: { findMany: jest.Mock };
    projectMember: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    card: { findMany: jest.Mock };
  };
  let service: ProjectsService;

  beforeEach(() => {
    prisma = {
      project: { findMany: jest.fn().mockResolvedValue([]) },
      projectMember: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), update: jest.fn() },
      card: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ProjectsService(prisma as unknown as PrismaService);
  });

  it('trae los proyectos donde el usuario es miembro, sin archivar por default', async () => {
    await service.list('user-1', false);

    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { members: { some: { userId: 'user-1' } }, archivedAt: null },
      select: {
        id: true,
        name: true,
        client: true,
        color: true,
        startDate: true,
        endDate: true,
        members: { where: { userId: 'user-1' }, select: { isFavorite: true } },
      },
      orderBy: { name: 'asc' },
    });
  });

  it('con archived=true, trae solo los archivados', async () => {
    await service.list('user-1', true);

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { members: { some: { userId: 'user-1' } }, archivedAt: { not: null } } }),
    );
  });

  it('no consulta equipo/tarjetas si no hay proyectos', async () => {
    const result = await service.list('user-1', false);

    expect(result).toEqual([]);
    expect(prisma.projectMember.findMany).not.toHaveBeenCalled();
    expect(prisma.card.findMany).not.toHaveBeenCalled();
  });

  it('arma color, isFavorite, equipo y avance por proyecto en pocas consultas', async () => {
    prisma.project.findMany.mockResolvedValue([
      {
        id: 'proj-1',
        name: 'Migración CRM',
        client: 'ACME',
        color: '#b4552f',
        startDate: null,
        endDate: null,
        members: [{ isFavorite: true }],
      },
    ]);
    prisma.projectMember.findMany.mockResolvedValue([
      { projectId: 'proj-1', user: { id: 'u1', name: 'Ana' } },
      { projectId: 'proj-1', user: { id: 'u2', name: 'Bruno' } },
    ]);
    prisma.card.findMany.mockResolvedValue([
      { completedAt: new Date(), column: { board: { projectId: 'proj-1' } } },
      { completedAt: null, column: { board: { projectId: 'proj-1' } } },
      { completedAt: null, column: { board: { projectId: 'proj-1' } } },
    ]);

    const [result] = await service.list('user-1', false);

    expect(result).toEqual({
      id: 'proj-1',
      name: 'Migración CRM',
      client: 'ACME',
      color: '#b4552f',
      isFavorite: true,
      startDate: null,
      endDate: null,
      taskCount: 3,
      doneCount: 1,
      team: [
        { id: 'u1', name: 'Ana' },
        { id: 'u2', name: 'Bruno' },
      ],
    });
    // Una consulta por tipo de dato, no una por proyecto.
    expect(prisma.projectMember.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.card.findMany).toHaveBeenCalledTimes(1);
  });

  it('isFavorite es false si el usuario no marcó el proyecto', async () => {
    prisma.project.findMany.mockResolvedValue([
      { id: 'proj-1', name: 'X', client: null, color: '#1b1917', startDate: null, endDate: null, members: [] },
    ]);

    const [result] = await service.list('user-1', false);

    expect(result.isFavorite).toBe(false);
  });
});

describe('ProjectsService.setFavorite', () => {
  let prisma: { projectMember: { findUnique: jest.Mock; update: jest.Mock } };
  let service: ProjectsService;

  beforeEach(() => {
    prisma = { projectMember: { findUnique: jest.fn(), update: jest.fn() } };
    service = new ProjectsService(prisma as unknown as PrismaService);
  });

  it('marca isFavorite en la membresía del usuario', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ id: 'pm-1' });

    await service.setFavorite('user-1', 'proj-1', true);

    expect(prisma.projectMember.update).toHaveBeenCalledWith({
      where: { id: 'pm-1' },
      data: { isFavorite: true },
    });
  });

  it('tira 404 si el usuario no es miembro del proyecto', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(null);

    await expect(service.setFavorite('user-1', 'proj-1', true)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.projectMember.update).not.toHaveBeenCalled();
  });
});

describe('ProjectsService.get', () => {
  let prisma: {
    project: { findFirst: jest.Mock };
    projectMember: { findMany: jest.Mock };
    card: { findMany: jest.Mock };
  };
  let service: ProjectsService;

  beforeEach(() => {
    prisma = {
      project: { findFirst: jest.fn() },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
      card: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ProjectsService(prisma as unknown as PrismaService);
  });

  it('tira 404 si el proyecto no existe o el usuario no es miembro', async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(service.get('proj-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('trae description, isFavorite del usuario, avance y los miembros con su openCount del proyecto', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj-1',
      name: 'Migración CRM',
      client: 'ACME',
      description: 'Migrar el CRM viejo',
      color: '#b4552f',
      startDate: null,
      endDate: null,
      members: [{ isFavorite: true }],
    });
    prisma.projectMember.findMany.mockResolvedValue([
      { userId: 'u1', role: 'OWNER', user: { name: 'Ana', email: 'ana@x.com' } },
      { userId: 'u2', role: 'EDITOR', user: { name: 'Bruno', email: 'bruno@x.com' } },
    ]);
    prisma.card.findMany.mockResolvedValue([
      { completedAt: new Date(), assignees: [{ userId: 'u1' }] }, // cerrada: no suma a openCount de nadie
      { completedAt: null, assignees: [{ userId: 'u1' }, { userId: 'u2' }] },
      { completedAt: null, assignees: [{ userId: 'u2' }] },
    ]);

    const result = await service.get('proj-1', 'user-1');

    expect(result).toEqual({
      id: 'proj-1',
      name: 'Migración CRM',
      client: 'ACME',
      description: 'Migrar el CRM viejo',
      color: '#b4552f',
      isFavorite: true,
      startDate: null,
      endDate: null,
      taskCount: 3,
      doneCount: 1,
      members: [
        { userId: 'u1', name: 'Ana', email: 'ana@x.com', role: 'OWNER', openCount: 1 },
        { userId: 'u2', name: 'Bruno', email: 'bruno@x.com', role: 'EDITOR', openCount: 2 },
      ],
    });
  });
});
