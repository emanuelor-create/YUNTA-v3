import { Injectable, NotFoundException } from '@nestjs/common';
import { Column } from '@prisma/client';
import { projectAccess } from '../auth/project-access';
import { DAY_MS, dueState, isCompletedSince, isDueSoon, LEAF } from '../cards/card-metrics';
import { PrismaService } from '../prisma/prisma.service';
import { cardCode } from './project-key';

interface CardStatsRow {
  columnId: string;
  progress: number;
  storyPoints: number | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  dueDate: Date | null;
}

export interface ProjectStats {
  /// Total y completadas de tarjetas, del mismo snapshot que `points`: el %
  /// de tarjetas y el de puntos salen de la misma definición de "completada"
  /// (completedAt), así que solo difieren por datos reales (tarjetas más
  /// grandes que cierran antes o después), nunca por dos cálculos distintos.
  cards: { total: number; completed: number };
  byColumn: { columnId: string; name: string; count: number }[];
  byProgress: Record<0 | 25 | 50 | 75 | 100, number>;
  points: { total: number; completed: number; avg: number; toSplit: number };
  window: { completed: number; updated: number; created: number; dueSoon: number };
}

export interface BoardCard {
  id: string;
  code: string;
  title: string;
  priority: 'ALTA' | 'MEDIA' | 'BAJA' | null;
  dueDate: string | null;
  /// Vencida o próxima (las mismas definiciones que el Dashboard); null = no se pinta.
  dueState: 'overdue' | 'soon' | null;
  completed: boolean;
  storyPoints: number | null;
  assignees: { id: string; name: string }[];
  /// Subtarea: el código de su tarjeta madre. Contenedor: null.
  parentCode: string | null;
  /// Contenedor: cuántas subtareas tiene y cuántas están hechas ("3 subtareas ·
  /// 1 hecha"). null en una hoja. Un contenedor no muestra prioridad, esfuerzo,
  /// asignados ni avance propios.
  subtasks: { total: number; done: number } | null;
}

export interface BoardView {
  project: { id: string; key: string; name: string; color: string };
  boardId: string;
  canEdit: boolean;
  canManage: boolean;
  columns: { id: string; name: string; isDone: boolean; cards: BoardCard[] }[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  client: string | null;
  color: string;
  isFavorite: boolean;
  startDate: Date | null;
  endDate: Date | null;
  taskCount: number;
  doneCount: number;
  team: { id: string; name: string }[];
}

export interface ProjectDetail {
  id: string;
  name: string;
  client: string | null;
  description: string | null;
  color: string;
  isFavorite: boolean;
  startDate: Date | null;
  endDate: Date | null;
  archivedAt: Date | null;
  taskCount: number;
  doneCount: number;
  members: {
    userId: string;
    name: string;
    email: string;
    role: string;
    /// Tareas abiertas asignadas a esta persona, dentro de este proyecto
    /// (no el openCount global de GET /users, que es de todos los proyectos).
    openCount: number;
  }[];
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /// GET /projects: los proyectos donde el usuario es miembro — el sidebar
  /// (Favoritos/Proyectos) y la grilla de Proyectos (README §3) salen de
  /// acá. Tres consultas en total, no N+1: proyectos, equipo y tarjetas por
  /// separado, agregadas en memoria.
  async list(userId: string, includeArchived: boolean): Promise<ProjectSummary[]> {
    const projects = await this.prisma.project.findMany({
      where: {
        members: { some: { userId } },
        archivedAt: includeArchived ? { not: null } : null,
      },
      select: {
        id: true,
        name: true,
        client: true,
        color: true,
        startDate: true,
        endDate: true,
        // El propio isFavorite del usuario que pide, no el de todo el equipo.
        members: { where: { userId }, select: { isFavorite: true } },
      },
      orderBy: { name: 'asc' },
    });

    const projectIds = projects.map((project) => project.id);
    if (!projectIds.length) return [];

    const [teamRows, cardRows] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true, user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      // Card no tiene projectId directo (Card → Column → Board → Project);
      // se agrega acá en vez de hacer una consulta por proyecto.
      this.prisma.card.findMany({
        where: { column: { board: { projectId: { in: projectIds } } }, ...LEAF },
        select: { completedAt: true, column: { select: { board: { select: { projectId: true } } } } },
      }),
    ]);

    const teamByProject = new Map<string, { id: string; name: string }[]>();
    for (const row of teamRows) {
      const team = teamByProject.get(row.projectId) ?? [];
      team.push(row.user);
      teamByProject.set(row.projectId, team);
    }

    const taskCountByProject = new Map<string, number>();
    const doneCountByProject = new Map<string, number>();
    for (const card of cardRows) {
      const projectId = card.column.board.projectId;
      taskCountByProject.set(projectId, (taskCountByProject.get(projectId) ?? 0) + 1);
      if (card.completedAt) {
        doneCountByProject.set(projectId, (doneCountByProject.get(projectId) ?? 0) + 1);
      }
    }

    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      client: project.client,
      color: project.color,
      isFavorite: project.members[0]?.isFavorite ?? false,
      startDate: project.startDate,
      endDate: project.endDate,
      taskCount: taskCountByProject.get(project.id) ?? 0,
      doneCount: doneCountByProject.get(project.id) ?? 0,
      team: teamByProject.get(project.id) ?? [],
    }));
  }

  /// GET /projects/:id — header + Personas de Proyecto → Resumen. Solo
  /// miembros del proyecto (mismo criterio que list()).
  async get(projectId: string, userId: string): Promise<ProjectDetail> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, members: { some: { userId } } },
      select: {
        id: true,
        name: true,
        client: true,
        description: true,
        color: true,
        startDate: true,
        endDate: true,
        archivedAt: true,
        members: { where: { userId }, select: { isFavorite: true } },
      },
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} no encontrado`);
    }

    const [members, cards] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: { projectId },
        select: { userId: true, role: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.card.findMany({
        where: { column: { board: { projectId } }, ...LEAF },
        select: { completedAt: true, assignees: { select: { userId: true } } },
      }),
    ]);

    const openCountByUser = new Map<string, number>();
    let taskCount = 0;
    let doneCount = 0;
    for (const card of cards) {
      taskCount += 1;
      if (card.completedAt) {
        doneCount += 1;
      } else {
        for (const assignee of card.assignees) {
          openCountByUser.set(assignee.userId, (openCountByUser.get(assignee.userId) ?? 0) + 1);
        }
      }
    }

    return {
      id: project.id,
      name: project.name,
      client: project.client,
      description: project.description,
      color: project.color,
      isFavorite: project.members[0]?.isFavorite ?? false,
      startDate: project.startDate,
      endDate: project.endDate,
      archivedAt: project.archivedAt,
      taskCount,
      doneCount,
      members: members.map((member) => ({
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        role: member.role,
        openCount: openCountByUser.get(member.userId) ?? 0,
      })),
    };
  }

  /// GET /projects/:id/board — columnas en orden, cada una con sus tarjetas en
  /// orden. La última columna es "hecho" (BACKEND.md §1).
  async getBoard(projectId: string, userId: string): Promise<BoardView> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        key: true,
        name: true,
        color: true,
        board: {
          select: {
            id: true,
            columns: {
              orderBy: { position: 'asc' },
              select: {
                id: true,
                name: true,
                cards: {
                  orderBy: { position: 'asc' },
                  select: {
                    id: true,
                    number: true,
                    title: true,
                    priority: true,
                    dueDate: true,
                    completedAt: true,
                    storyPoints: true,
                    parent: { select: { number: true } },
                    children: { select: { completedAt: true } },
                    assignees: { orderBy: { createdAt: 'asc' }, select: { user: { select: { id: true, name: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!project?.board) {
      throw new NotFoundException(`Project ${projectId} no tiene tablero`);
    }

    const access = await projectAccess(this.prisma, projectId, userId);
    const now = new Date();
    const last = project.board.columns.length - 1;

    return {
      project: { id: project.id, key: project.key, name: project.name, color: project.color },
      boardId: project.board.id,
      canEdit: access.canEdit,
      canManage: access.canManage,
      columns: project.board.columns.map((column, index) => ({
        id: column.id,
        name: column.name,
        isDone: index === last,
        cards: column.cards.map((card) => ({
          id: card.id,
          code: cardCode(project.key, card.number),
          title: card.title,
          priority: card.priority,
          dueDate: card.dueDate?.toISOString() ?? null,
          dueState: dueState(card, now),
          completed: card.completedAt !== null,
          storyPoints: card.storyPoints,
          assignees: card.assignees.map((a) => a.user),
          parentCode: card.parent ? cardCode(project.key, card.parent.number) : null,
          subtasks: card.children.length
            ? { total: card.children.length, done: card.children.filter((c) => c.completedAt !== null).length }
            : null,
        })),
      })),
    };
  }

  /// POST|DELETE /projects/:id/favorite — personal, cualquier miembro
  /// (incluso VIEWER) puede marcar sus propios favoritos.
  async setFavorite(userId: string, projectId: string, isFavorite: boolean): Promise<void> {
    const membership = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });
    if (!membership) {
      throw new NotFoundException('No sos miembro de este proyecto');
    }
    await this.prisma.projectMember.update({ where: { id: membership.id }, data: { isFavorite } });
  }

  /// Todo sale de UN solo pull de tarjetas (más el de columnas): byColumn,
  /// byProgress, points y window se derivan del mismo snapshot en memoria,
  /// así points.completed/total nunca puede contradecir el % de tarjetas
  /// completadas por venir de una consulta separada (BACKEND.md §3.1).
  async getStats(projectId: string, windowDays: number): Promise<ProjectStats> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { board: { include: { columns: { orderBy: { position: 'asc' } } } } },
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} no encontrado`);
    }

    const columns = project.board?.columns ?? [];
    const columnIds = columns.map((column) => column.id);

    const cards: CardStatsRow[] = columnIds.length
      ? await this.prisma.card.findMany({
          where: { columnId: { in: columnIds }, ...LEAF },
          select: {
            columnId: true,
            progress: true,
            storyPoints: true,
            completedAt: true,
            createdAt: true,
            updatedAt: true,
            dueDate: true,
          },
        })
      : [];

    return {
      cards: { total: cards.length, completed: cards.filter((card) => card.completedAt !== null).length },
      byColumn: this.buildByColumn(columns, cards),
      byProgress: this.buildByProgress(cards),
      points: this.buildPoints(cards),
      window: this.buildWindow(cards, windowDays),
    };
  }

  private buildByColumn(columns: Column[], cards: CardStatsRow[]) {
    const counts = new Map<string, number>();
    for (const card of cards) {
      counts.set(card.columnId, (counts.get(card.columnId) ?? 0) + 1);
    }
    // Todas las columnas aparecen, incluso con count 0 — igual que byProgress.
    return columns.map((column) => ({
      columnId: column.id,
      name: column.name,
      count: counts.get(column.id) ?? 0,
    }));
  }

  private buildByProgress(cards: CardStatsRow[]): Record<0 | 25 | 50 | 75 | 100, number> {
    const byProgress: Record<0 | 25 | 50 | 75 | 100, number> = { 0: 0, 25: 0, 50: 0, 75: 0, 100: 0 };
    for (const card of cards) {
      byProgress[card.progress as 0 | 25 | 50 | 75 | 100] += 1;
    }
    return byProgress;
  }

  private buildPoints(cards: CardStatsRow[]) {
    // "Sin estimar" no es cero: se excluye del promedio, no se cuenta como 0.
    const withPoints = cards.filter((card) => card.storyPoints !== null);
    const total = withPoints.reduce((sum, card) => sum + card.storyPoints!, 0);
    const completed = withPoints
      .filter((card) => card.completedAt !== null)
      .reduce((sum, card) => sum + card.storyPoints!, 0);
    const avg = withPoints.length ? total / withPoints.length : 0;
    const toSplit = cards.filter((card) => card.storyPoints === 13 && card.completedAt === null).length;

    return { total, completed, avg, toSplit };
  }

  private buildWindow(cards: CardStatsRow[], windowDays: number) {
    // completed/updated/created reportan actividad real siempre, incluso en
    // un proyecto entregado sin tarjetas abiertas — un informe de cierre que
    // dice "0 cerradas" la semana que se cerró todo estaría roto. dueSoon
    // cuenta abiertas, así que ahí sí da 0 solo (BACKEND.md §3.1, corregido).
    const since = new Date(Date.now() - windowDays * DAY_MS);
    const now = new Date();

    return {
      completed: cards.filter((card) => isCompletedSince(card, since)).length,
      updated: cards.filter((card) => card.updatedAt >= since).length,
      created: cards.filter((card) => card.createdAt >= since).length,
      // Misma definición que el Dashboard (cards/card-metrics.ts).
      dueSoon: cards.filter((card) => isDueSoon(card, now)).length,
    };
  }
}
