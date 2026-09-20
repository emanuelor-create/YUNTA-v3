import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { DashboardService, parseTzOffset } from './dashboard.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-17T12:00:00.000Z');
const daysFromNow = (n: number) => new Date(now.getTime() + n * DAY_MS);

const ME = { id: 'u-me', name: 'Yo' };
const OTHER = { id: 'u-2', name: 'Bruno' };

const COLUMNS = [
  { id: 'col-todo', boardId: 'board-1', name: 'Por hacer', position: 0 },
  { id: 'col-doing', boardId: 'board-1', name: 'En curso', position: 1 },
  { id: 'col-done', boardId: 'board-1', name: 'Hecho', position: 2 },
];

interface Fixture {
  id: string;
  columnId: string;
  progress: number;
  dueDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  priority: 'ALTA' | 'MEDIA' | 'BAJA' | null;
  assignees: { id: string; name: string }[];
}

function fx(id: string, columnId: string, over: Partial<Fixture> = {}): Fixture {
  const done = columnId === 'col-done';
  return {
    id,
    columnId,
    progress: done ? 100 : 0,
    dueDate: null,
    completedAt: done ? daysFromNow(-2) : null,
    createdAt: daysFromNow(-30),
    priority: null,
    assignees: [],
    ...over,
  };
}

// Un solo conjunto de tarjetas que alimenta a la vez el Dashboard y
// ProjectsService.getStats — la coherencia entre pantallas se prueba sobre
// los mismos datos, no sobre dos fixtures que podrían divergir.
const CARDS: Fixture[] = [
  fx('A', 'col-todo', { dueDate: daysFromNow(2), assignees: [ME], priority: 'ALTA' }),
  fx('B', 'col-doing', { dueDate: daysFromNow(3), assignees: [ME, OTHER], progress: 50, priority: 'MEDIA' }),
  fx('C', 'col-doing', { dueDate: daysFromNow(-1), assignees: [ME], progress: 25 }), // vencida
  fx('D', 'col-done', { dueDate: new Date('2026-09-17T18:00:00.000Z'), assignees: [ME], priority: 'BAJA' }), // hoy, cerrada hace 2 d
  fx('E', 'col-done', { completedAt: daysFromNow(-10), assignees: [ME] }), // ventana anterior
  fx('F', 'col-todo', { dueDate: daysFromNow(9) }), // fuera del horizonte
  fx('G', 'col-doing', { assignees: [OTHER], progress: 75 }),
];

function dashboardPrisma(cards: Fixture[], role: 'OWNER' | 'VIEWER' = 'OWNER') {
  const project = {
    id: 'proj-1',
    name: 'Sitio web',
    client: 'Acme',
    color: '#b4552f',
    board: { columns: COLUMNS.map((c) => ({ id: c.id })) },
  };
  const toDashboardCard = (c: Fixture) => ({
    id: c.id,
    title: `Tarjeta ${c.id}`,
    dueDate: c.dueDate,
    completedAt: c.completedAt,
    createdAt: c.createdAt,
    priority: c.priority,
    columnId: c.columnId,
    column: { board: { projectId: 'proj-1' } },
    assignees: c.assignees.map((user) => ({ user })),
  });
  const previousSince = daysFromNow(-14);

  return {
    projectMember: {
      findMany: jest.fn(async (args: { where: { userId?: string } }) =>
        // Primera consulta: mis membresías. Segunda: los miembros de mis proyectos.
        args.where.userId ? [{ role, project }] : [{ user: ME }, { user: OTHER }],
      ),
    },
    card: { findMany: jest.fn(async () => cards.map(toDashboardCard)) },
    userDailySnapshot: { findMany: jest.fn(async (): Promise<unknown[]> => []) },
    cardAssignee: {
      findMany: jest.fn(async (args: { where: { userId: string | { in: string[] } } }) => {
        const wanted = args.where.userId;
        if (typeof wanted === 'string') {
          // Lo que filtraría la consulta: abiertas, cerradas en 14 d, o con vencimiento hoy.
          return cards
            .filter((c) => c.assignees.some((a) => a.id === wanted))
            .filter(
              (c) =>
                c.completedAt === null ||
                c.completedAt >= previousSince ||
                (c.dueDate !== null && c.dueDate >= new Date('2026-09-17T00:00:00.000Z') && c.dueDate < new Date('2026-09-18T00:00:00.000Z')),
            )
            .map((c) => ({ card: toDashboardCard(c) }));
        }
        // Carga del equipo: abiertas de esos usuarios.
        return cards
          .filter((c) => c.completedAt === null)
          .flatMap((c) => c.assignees.filter((a) => wanted.in.includes(a.id)).map((a) => ({ userId: a.id, card: { dueDate: c.dueDate } })));
      }),
    },
  };
}

function build(cards = CARDS, role: 'OWNER' | 'VIEWER' = 'OWNER') {
  const prisma = dashboardPrisma(cards, role);
  return { prisma, service: new DashboardService(prisma as unknown as PrismaService) };
}

describe('DashboardService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  describe('me (tus tarjetas)', () => {
    it('asignadas, vencidas y vencen pronto salen de tus asignaciones abiertas', async () => {
      const { service } = build();
      const { me } = await service.get(ME.id, 0, now);

      expect(me.assigned).toBe(3); // A, B, C
      expect(me.overdue).toBe(1); // C
      expect(me.dueSoon).toBe(2); // A y B; F no es tuya y está fuera del horizonte
    });

    it('cerradas: valor de 7 días, ventana anterior para el delta, y la serie suma el valor', async () => {
      const { service } = build();
      const { me } = await service.get(ME.id, 0, now);

      expect(me.closed.total).toBe(1); // D
      expect(me.closed.previous).toBe(1); // E, hace 10 d
      expect(me.closed.byDay).toHaveLength(7);
      expect(me.closed.byDay.reduce((a, b) => a + b, 0)).toBe(me.closed.total);
      expect(me.closed.byDay[4]).toBe(1); // hace 2 días → el 5.º tramo de 7
    });

    it('una tarjeta cerrada exactamente en el borde de la ventana no se pierde de la serie', async () => {
      const edge = fx('X', 'col-done', { completedAt: daysFromNow(-7), assignees: [ME] });
      const { service } = build([edge]);
      const { me } = await service.get(ME.id, 0, now);

      expect(me.closed.total).toBe(1);
      expect(me.closed.byDay.reduce((a, b) => a + b, 0)).toBe(1);
    });
  });

  describe('Tu día', () => {
    it('trae tus tarjetas con vencimiento hoy — abiertas y cerradas — con proyecto y permiso de edición', async () => {
      const { service } = build();
      const { today } = await service.get(ME.id, 0, now);

      expect(today).toEqual([
        expect.objectContaining({
          id: 'D',
          projectName: 'Sitio web',
          projectColor: '#b4552f',
          completed: true,
          canEdit: true,
        }),
      ]);
    });

    it('un VIEWER ve sus tarjetas pero no puede alternarlas', async () => {
      const { service } = build(CARDS, 'VIEWER');
      const { today } = await service.get(ME.id, 0, now);
      expect(today[0].canEdit).toBe(false);
    });

    it('"hoy" es el día local del cliente: 22:00 del 17 en UTC-3 es hoy, aunque en UTC ya sea el 18', async () => {
      const late = fx('L', 'col-todo', { dueDate: new Date('2026-09-18T01:00:00.000Z'), assignees: [ME] });
      const utc = build([late]);
      const local = build([late]);
      // La consulta real filtra por el día local; el mock de arriba filtra por UTC, así que se
      // sirve la tarjeta a mano y se verifica el recorte que hace el servicio.
      const serveLate = (args: { where: { userId: string | { in: string[] } } }) =>
        Promise.resolve(typeof args.where.userId === 'string' ? [{ card: toRow(late) }] : []);
      (utc.prisma.cardAssignee.findMany as jest.Mock).mockImplementation(serveLate);
      (local.prisma.cardAssignee.findMany as jest.Mock).mockImplementation(serveLate);

      expect((await utc.service.get(ME.id, 0, now)).today).toHaveLength(0);
      expect((await local.service.get(ME.id, 180, now)).today.map((c) => c.id)).toEqual(['L']);
    });
  });

  describe('estado del trabajo', () => {
    it('reparte en por hacer / en curso / hecho con "hecho" = completedAt', async () => {
      const { service } = build();
      const { status } = await service.get(ME.id, 0, now);

      expect(status).toEqual({ todo: 2, inProgress: 3, done: 2 });
    });
  });

  describe('próximas a vencer', () => {
    it('agrupa por día local, del más cercano al más lejano, con proyecto y responsables', async () => {
      const { service } = build();
      const { upcoming } = await service.get(ME.id, 0, now);

      expect(upcoming.total).toBe(2);
      expect(upcoming.days.map((d) => d.date)).toEqual([
        '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24',
      ]);
      const withCards = upcoming.days.filter((d) => d.count > 0);
      expect(withCards.map((d) => [d.date, d.cards.map((c) => c.id)])).toEqual([
        ['2026-09-19', ['A']],
        ['2026-09-20', ['B']],
      ]);
      expect(withCards[1].cards[0].assignees.map((a) => a.name)).toEqual(['Yo', 'Bruno']);
    });

    it('no incluye vencidas, cerradas ni las que pasan del horizonte', async () => {
      const { service } = build();
      const ids = (await service.get(ME.id, 0, now)).upcoming.days.flatMap((d) => d.cards.map((c) => c.id));
      expect(ids).not.toContain('C'); // vencida
      expect(ids).not.toContain('D'); // cerrada
      expect(ids).not.toContain('F'); // +9 d
    });
  });

  describe('ritmo de la semana', () => {
    it('siete tramos de 24 h, el último termina ahora, y solo trae cerradas', async () => {
      const { service } = build();
      const { rhythm } = await service.get(ME.id, 0, now);

      expect(rhythm).toHaveLength(7);
      expect(rhythm[6].endsAt).toBe(now.toISOString());
      expect(rhythm.reduce((sum, r) => sum + r.closed, 0)).toBe(1); // D
      // Las abiertas son un stock, no un ritmo: no van en la serie.
      for (const point of rhythm) expect(Object.keys(point).sort()).toEqual(['closed', 'endsAt']);
    });

    it('la cerrada de hace 2 días cae en el 5.º tramo', async () => {
      const { service } = build();
      const { rhythm } = await service.get(ME.id, 0, now);
      expect(rhythm.map((r) => r.closed)).toEqual([0, 0, 0, 0, 1, 0, 0]);
    });
  });

  describe('prioridad', () => {
    it('viaja en Tu día y en Próximas a vencer; null (sin clasificar) se respeta y no se convierte en default', async () => {
      const { service } = build();
      const { today, upcoming } = await service.get(ME.id, 0, now);

      expect(today.find((c) => c.id === 'D')!.priority).toBe('BAJA');
      const upcomingCards = upcoming.days.flatMap((d) => d.cards);
      expect(upcomingCards.find((c) => c.id === 'A')!.priority).toBe('ALTA');
      expect(upcomingCards.find((c) => c.id === 'B')!.priority).toBe('MEDIA');

      const unclassified = build([fx('N', 'col-todo', { dueDate: daysFromNow(1), assignees: [ME] })]);
      const result = await unclassified.service.get(ME.id, 0, now);
      expect(result.upcoming.days.flatMap((d) => d.cards)[0].priority).toBeNull();
    });
  });

  describe('series de los StatCards (UserDailySnapshot)', () => {
    const snapshotDay = (ymd: string, assigned: number) => ({
      userId: ME.id,
      date: new Date(`${ymd}T00:00:00.000Z`),
      assigned,
      overdue: assigned - 1,
      dueSoon: 1,
    });
    // Los 7 días cerrados: `now` es 12:00Z del 17 → hoy en Buenos Aires es el 17 → 10..16.
    const SEVEN = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16'];

    it('sin historial acumulado no hay serie (null) — los StatCards muestran solo el número', async () => {
      const { service } = build();
      expect((await service.get(ME.id, 0, now)).me.history).toBeNull();
    });

    it('con 7 días cerrados seguidos devuelve las tres series, del más viejo al más nuevo', async () => {
      const { service, prisma } = build();
      // Se devuelven desordenados a propósito: el orden lo pone el servicio, no la base.
      prisma.userDailySnapshot.findMany.mockResolvedValue([...SEVEN].reverse().map((d, i) => snapshotDay(d, 10 - i)));

      const { me } = await service.get(ME.id, 0, now);

      expect(me.history).toEqual({
        assigned: [4, 5, 6, 7, 8, 9, 10],
        overdue: [3, 4, 5, 6, 7, 8, 9],
        dueSoon: [1, 1, 1, 1, 1, 1, 1],
      });
    });

    it('con un hueco (6 de 7 días) no hay serie: mejor nada que una serie con un día inventado', async () => {
      const { service, prisma } = build();
      prisma.userDailySnapshot.findMany.mockResolvedValue(SEVEN.slice(0, 6).map((d) => snapshotDay(d, 5)));

      expect((await service.get(ME.id, 0, now)).me.history).toBeNull();
    });

    it('pide exactamente los 7 días cerrados en la zona de la cuenta, para esta persona', async () => {
      const { service, prisma } = build();
      await service.get(ME.id, 0, now);

      const args = (prisma.userDailySnapshot.findMany as jest.Mock).mock.calls[0][0] as {
        where: { userId: string; date: { in: Date[] } };
      };
      expect(args.where.userId).toBe(ME.id);
      expect(args.where.date.in.map((d) => d.toISOString().slice(0, 10))).toEqual(SEVEN);
    });
  });

  describe('carga del equipo', () => {
    it('cuenta abiertas por miembro, de mayor a menor, con la misma cuenta que Usuarios', async () => {
      const { service } = build();
      const { workload } = await service.get(ME.id, 0, now);

      expect(workload).toEqual([
        { userId: 'u-me', name: 'Yo', openCount: 3 },
        { userId: 'u-2', name: 'Bruno', openCount: 2 },
      ]);
    });
  });

  it('sin proyectos devuelve todo en cero sin consultar tarjetas', async () => {
    const { service, prisma } = build();
    prisma.projectMember.findMany.mockResolvedValue([]);
    prisma.cardAssignee.findMany.mockResolvedValue([]);

    const result = await service.get(ME.id, 0, now);

    expect(result.scope.projectCount).toBe(0);
    expect(result.status).toEqual({ todo: 0, inProgress: 0, done: 0 });
    expect(result.upcoming.total).toBe(0);
    expect(result.workload).toEqual([]);
    expect(prisma.card.findMany).not.toHaveBeenCalled();
  });

  describe('coherencia con la pantalla del proyecto', () => {
    // Mismas tarjetas, dos caminos de cálculo: /projects/:id/stats y /dashboard.
    it('lo que el Dashboard dice de un proyecto coincide con su /stats y con GET /projects', async () => {
      const projectsPrisma = {
        project: { findUnique: jest.fn().mockResolvedValue({ id: 'proj-1', board: { id: 'board-1', columns: COLUMNS } }) },
        card: {
          findMany: jest.fn().mockResolvedValue(
            CARDS.map((c) => ({
              columnId: c.columnId,
              progress: c.progress,
              storyPoints: null,
              completedAt: c.completedAt,
              createdAt: c.createdAt,
              updatedAt: c.createdAt,
              dueDate: c.dueDate,
            })),
          ),
        },
      };
      const stats = await new ProjectsService(projectsPrisma as unknown as PrismaService).getStats('proj-1', 7);
      const dash = await build().service.get(ME.id, 0, now);

      // Vencen pronto: el KPI del proyecto y el total de "Próximas a vencer".
      expect(dash.upcoming.total).toBe(stats.window.dueSoon);
      // Cerradas en 7 días: KPI "Finalizadas" del proyecto y la suma del "Ritmo".
      expect(dash.rhythm.reduce((sum, r) => sum + r.closed, 0)).toBe(stats.window.completed);
      // Completadas y total: el % del proyecto y el donut del Dashboard.
      expect(dash.status.done).toBe(stats.cards.completed);
      expect(dash.status.todo + dash.status.inProgress + dash.status.done).toBe(stats.cards.total);
      // Y "hecho" es también lo que cuenta GET /projects (doneCount = completedAt).
      expect(dash.status.done).toBe(CARDS.filter((c) => c.completedAt !== null).length);
    });
  });
});

describe('parseTzOffset', () => {
  it('acepta offsets enteros razonables y descarta el resto', () => {
    expect(parseTzOffset('180')).toBe(180);
    expect(parseTzOffset('-330')).toBe(-330);
    expect(parseTzOffset(undefined)).toBe(0);
    expect(parseTzOffset('abc')).toBe(0);
    expect(parseTzOffset('99999')).toBe(0);
    expect(parseTzOffset('1.5')).toBe(0);
  });
});

function toRow(c: Fixture) {
  return {
    id: c.id,
    title: `Tarjeta ${c.id}`,
    dueDate: c.dueDate,
    completedAt: c.completedAt,
    priority: c.priority,
    column: { board: { projectId: 'proj-1' } },
  };
}
