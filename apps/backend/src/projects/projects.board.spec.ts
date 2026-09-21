import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

const card = (id: string, number: number, over: Record<string, unknown> = {}) => ({
  id,
  number,
  title: `Tarjeta ${id}`,
  priority: null,
  dueDate: null,
  completedAt: null,
  storyPoints: null,
  assignees: [],
  parent: null,
  children: [],
  ...over,
});

function project(over: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    key: 'RED',
    name: 'Rediseño',
    color: '#b4552f',
    board: {
      id: 'board-1',
      columns: [
        { id: 'c0', name: 'Por hacer', cards: [card('a', 1, { priority: 'ALTA', dueDate: new Date(now - DAY) }), card('b', 2)] },
        { id: 'c1', name: 'En curso', cards: [card('c', 3, { dueDate: new Date(now + 3 * DAY), assignees: [{ user: { id: 'u1', name: 'Ana' } }] })] },
        { id: 'c2', name: 'Hecho', cards: [card('d', 4, { completedAt: new Date(), dueDate: new Date(now - DAY) })] },
      ],
    },
    ...over,
  };
}

describe('ProjectsService.getBoard', () => {
  let prisma: {
    project: { findUnique: jest.Mock };
    projectMember: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let service: ProjectsService;

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue(project()) },
      projectMember: { findUnique: jest.fn().mockResolvedValue({ role: 'EDITOR' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ role: 'DEVELOPER' }) },
    };
    service = new ProjectsService(prisma as unknown as PrismaService);
  });

  it('devuelve las columnas en orden con sus tarjetas en orden, y marca la última como "hecho"', async () => {
    const board = await service.getBoard('proj-1', 'u1');

    expect(board.columns.map((c) => [c.name, c.isDone, c.cards.map((x) => x.id)])).toEqual([
      ['Por hacer', false, ['a', 'b']],
      ['En curso', false, ['c']],
      ['Hecho', true, ['d']],
    ]);
    expect(board.boardId).toBe('board-1');
    expect(board.project).toEqual({ id: 'proj-1', key: 'RED', name: 'Rediseño', color: '#b4552f' });
  });

  it('cada tarjeta trae código (clave + número), prioridad y asignados', async () => {
    const [a, b] = (await service.getBoard('proj-1', 'u1')).columns[0].cards;
    const c = (await service.getBoard('proj-1', 'u1')).columns[1].cards[0];

    expect(a).toMatchObject({ code: 'RED-1', priority: 'ALTA' });
    expect(b).toMatchObject({ code: 'RED-2', priority: null }); // sin clasificar: null, sin default
    expect(c.assignees).toEqual([{ id: 'u1', name: 'Ana' }]);
  });

  it('la fecha se marca vencida o próxima con las definiciones del Dashboard; una cerrada nunca está vencida', async () => {
    const { columns } = await service.getBoard('proj-1', 'u1');

    expect(columns[0].cards[0].dueState).toBe('overdue');
    expect(columns[0].cards[1].dueState).toBeNull(); // sin fecha
    expect(columns[1].cards[0].dueState).toBe('soon'); // en 3 días
    expect(columns[2].cards[0].dueState).toBeNull(); // hecha, aunque su fecha ya pasó
    expect(columns[2].cards[0].completed).toBe(true);
  });

  it('una hoja no trae parentCode ni subtareas; una subtarea trae el código de su madre; un contenedor cuenta sus hijas', async () => {
    prisma.project.findUnique.mockResolvedValue(
      project({
        board: {
          id: 'board-1',
          columns: [
            {
              id: 'c0',
              name: 'Por hacer',
              cards: [
                card('hoja', 1),
                card('hija', 2, { parent: { number: 4 } }),
                card('madre', 4, {
                  children: [{ completedAt: new Date() }, { completedAt: null }, { completedAt: null }],
                }),
              ],
            },
          ],
        },
      }),
    );

    const [hoja, hija, madre] = (await service.getBoard('proj-1', 'u1')).columns[0].cards;

    expect(hoja).toMatchObject({ parentCode: null, subtasks: null });
    expect(hija).toMatchObject({ parentCode: 'RED-4', subtasks: null });
    expect(madre).toMatchObject({ code: 'RED-4', parentCode: null, subtasks: { total: 3, done: 1 } });
  });

  it('canEdit / canManage según el rol: OWNER todo, EDITOR mueve pero no toca columnas, VIEWER solo mira', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ role: 'OWNER' });
    expect(await service.getBoard('proj-1', 'u1')).toMatchObject({ canEdit: true, canManage: true });

    prisma.projectMember.findUnique.mockResolvedValue({ role: 'EDITOR' });
    expect(await service.getBoard('proj-1', 'u1')).toMatchObject({ canEdit: true, canManage: false });

    prisma.projectMember.findUnique.mockResolvedValue({ role: 'VIEWER' });
    expect(await service.getBoard('proj-1', 'u1')).toMatchObject({ canEdit: false, canManage: false });
  });

  it('un ADMIN global puede editar y gestionar aunque no sea miembro', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    expect(await service.getBoard('proj-1', 'admin')).toMatchObject({ canEdit: true, canManage: true });
  });

  it('un proyecto sin tablero o inexistente es un 404', async () => {
    prisma.project.findUnique.mockResolvedValue(project({ board: null }));
    await expect(service.getBoard('proj-1', 'u1')).rejects.toBeInstanceOf(NotFoundException);

    prisma.project.findUnique.mockResolvedValue(null);
    await expect(service.getBoard('nope', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
