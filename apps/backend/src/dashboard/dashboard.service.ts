import { Injectable } from '@nestjs/common';
import { CardPriority, ProjectRole } from '@prisma/client';
import {
  DAY_MS,
  DUE_SOON_HORIZON_DAYS,
  isCompletedSince,
  isDueSoon,
  isOverdue,
  tallyOpenAssignments,
} from '../cards/card-metrics';
import { PrismaService } from '../prisma/prisma.service';
import { lastClosedDays } from '../snapshots/snapshot-dates';

const WINDOW_DAYS = 7;

export interface DashboardCard {
  id: string;
  title: string;
  dueDate: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  client: string | null;
  /// null = sin clasificar; BAJA existe pero la UI no le dibuja badge.
  priority: CardPriority | null;
}

export interface Dashboard {
  /// Proyectos sobre los que se calculó (donde sos miembro, sin archivados):
  /// el mismo universo que GET /projects.
  scope: { projectCount: number };
  /// Solo tus tarjetas. `closed` sí tiene historia exacta (completedAt);
  /// asignadas, vencidas y "vencen pronto" no: no se guarda snapshot diario,
  /// así que devuelven solo el valor de hoy, sin serie ni delta.
  me: {
    assigned: number;
    overdue: number;
    dueSoon: number;
    closed: { total: number; previous: number; byDay: number[] };
    /// Series de las tres cifras sin historia reconstruible, leídas de
    /// UserDailySnapshot: los últimos 7 días cerrados, del más viejo al más
    /// nuevo. `null` hasta que haya 7 días seguidos — sin serie es preferible
    /// a una serie con huecos rellenados.
    history: { assigned: number[]; overdue: number[]; dueSoon: number[] } | null;
  };
  /// Tus tarjetas con vencimiento en el día local de hoy (abiertas y cerradas).
  today: (DashboardCard & { completed: boolean; canEdit: boolean })[];
  /// Estado del trabajo en todos tus proyectos. `done` es completedAt — la
  /// misma definición que `doneCount` de GET /projects y `cards.completed`
  /// de /projects/:id/stats.
  status: { todo: number; inProgress: number; done: number };
  /// Abiertas del equipo que vencen en los próximos 7 días (isDueSoon), por
  /// día local. `total` coincide con la suma de `window.dueSoon` de cada
  /// proyecto.
  upcoming: {
    total: number;
    days: { date: string; count: number; cards: (DashboardCard & { assignees: { id: string; name: string }[] })[] }[];
  };
  /// Últimos 7 tramos de 24 h que terminan ahora (el último es "hoy"): tarjetas
  /// del equipo cerradas en cada tramo. La suma es el `window.completed` de los
  /// proyectos. Solo cerradas: las abiertas son un stock, no un ritmo, y en la
  /// misma barra aplastaban la escala (van como número en el header, salen de
  /// `status`).
  rhythm: { endsAt: string; closed: number }[];
  /// Miembros de tus proyectos con sus tareas abiertas — la misma cuenta que
  /// la columna "Tareas" de Usuarios (todos los proyectos, no solo estos).
  workload: { userId: string; name: string; openCount: number }[];
}

/// Offset de zona horaria como lo da `Date.getTimezoneOffset()` del navegador
/// (minutos, positivo al oeste de UTC). Se usa solo para agrupar por día
/// local; las ventanas de "7 días" son de 24 h corridas, como en el proyecto.
export function parseTzOffset(raw?: string): number {
  const value = Number(raw);
  return Number.isInteger(value) && Math.abs(value) <= 14 * 60 ? value : 0;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string, tzOffset = 0, now = new Date()): Promise<Dashboard> {
    const shiftMs = -tzOffset * 60_000;
    const localDate = (date: Date) => new Date(date.getTime() + shiftMs).toISOString().slice(0, 10);
    const todayStart = new Date(Math.floor((now.getTime() + shiftMs) / DAY_MS) * DAY_MS - shiftMs);
    const todayEnd = new Date(todayStart.getTime() + DAY_MS);
    const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    const previousSince = new Date(since.getTime() - WINDOW_DAYS * DAY_MS);

    const memberships = await this.prisma.projectMember.findMany({
      where: { userId, project: { archivedAt: null } },
      select: {
        role: true,
        project: {
          select: {
            id: true,
            name: true,
            client: true,
            color: true,
            board: { select: { columns: { select: { id: true }, orderBy: { position: 'asc' } } } },
          },
        },
      },
    });
    const projects = new Map(memberships.map((m) => [m.project.id, { ...m.project, role: m.role }]));
    const projectIds = [...projects.keys()];

    const [cards, myAssignments, members] = await Promise.all([
      projectIds.length
        ? this.prisma.card.findMany({
            where: { column: { board: { projectId: { in: projectIds } } } },
            select: {
              id: true,
              title: true,
              dueDate: true,
              completedAt: true,
              createdAt: true,
              priority: true,
              columnId: true,
              column: { select: { board: { select: { projectId: true } } } },
              assignees: { select: { user: { select: { id: true, name: true } } } },
            },
          })
        : [],
      // Tus asignaciones, en todos los proyectos (igual que "Tareas" en
      // Usuarios): abiertas, cerradas en las últimas dos ventanas (valor y
      // delta) y las que vencen hoy aunque ya estén cerradas.
      this.prisma.cardAssignee.findMany({
        where: {
          userId,
          card: {
            OR: [
              { completedAt: null },
              { completedAt: { gte: previousSince } },
              { dueDate: { gte: todayStart, lt: todayEnd } },
            ],
          },
        },
        select: {
          card: {
            select: {
              id: true,
              title: true,
              dueDate: true,
              completedAt: true,
              priority: true,
              column: { select: { board: { select: { projectId: true } } } },
            },
          },
        },
      }),
      projectIds.length
        ? this.prisma.projectMember.findMany({
            where: { projectId: { in: projectIds }, user: { deletedAt: null } },
            select: { user: { select: { id: true, name: true } } },
          })
        : [],
    ]);

    const toCard = (card: { id: string; title: string; dueDate: Date | null; priority: CardPriority | null }, projectId: string): DashboardCard | null => {
      const project = projects.get(projectId);
      if (!project || !card.dueDate) return null;
      return {
        id: card.id,
        title: card.title,
        dueDate: card.dueDate.toISOString(),
        projectId,
        projectName: project.name,
        projectColor: project.color,
        client: project.client,
        priority: card.priority,
      };
    };

    // ── me ────────────────────────────────────────────────────────────────
    const myOpen = myAssignments.map((a) => a.card).filter((card) => card.completedAt === null);
    const myClosedRecent = myAssignments.map((a) => a.card).filter((card) => card.completedAt !== null);
    const closedByDay = this.bucketByDay(myClosedRecent.map((card) => card.completedAt!), now, since);

    const today: Dashboard['today'] = [];
    for (const { card } of myAssignments) {
      if (!card.dueDate || card.dueDate < todayStart || card.dueDate >= todayEnd) continue;
      const base = toCard(card, card.column.board.projectId);
      if (!base) continue;
      const role = projects.get(base.projectId)!.role;
      today.push({
        ...base,
        completed: card.completedAt !== null,
        canEdit: role === ProjectRole.OWNER || role === ProjectRole.EDITOR,
      });
    }
    today.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    // ── estado, próximas y ritmo: tarjetas del equipo ─────────────────────
    const firstColumnByProject = new Map<string, string | undefined>();
    for (const project of projects.values()) {
      firstColumnByProject.set(project.id, project.board?.columns[0]?.id);
    }

    const status = { todo: 0, inProgress: 0, done: 0 };
    for (const card of cards) {
      if (card.completedAt !== null) status.done += 1;
      else if (card.columnId === firstColumnByProject.get(card.column.board.projectId)) status.todo += 1;
      else status.inProgress += 1;
    }

    const dueSoonCards = cards.filter((card) => isDueSoon(card, now));
    const horizonEnd = new Date(now.getTime() + DUE_SOON_HORIZON_DAYS * DAY_MS);
    const days: Dashboard['upcoming']['days'] = [];
    for (let day = todayStart.getTime(); day <= horizonEnd.getTime(); day += DAY_MS) {
      days.push({ date: localDate(new Date(day)), count: 0, cards: [] });
    }
    for (const card of dueSoonCards.sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())) {
      const base = toCard(card, card.column.board.projectId);
      const bucket = days.find((d) => d.date === localDate(card.dueDate!));
      if (!base || !bucket) continue;
      bucket.count += 1;
      bucket.cards.push({ ...base, assignees: card.assignees.map((a) => a.user) });
    }

    const closedByBucket = this.bucketByDay(
      cards.filter((card) => isCompletedSince(card, since)).map((card) => card.completedAt!),
      now,
      since,
    );
    const rhythm: Dashboard['rhythm'] = closedByBucket.map((closed, index) => ({
      endsAt: new Date(now.getTime() - (WINDOW_DAYS - 1 - index) * DAY_MS).toISOString(),
      closed,
    }));

    // ── carga del equipo ──────────────────────────────────────────────────
    const teamUsers = new Map(members.map((m) => [m.user.id, m.user.name]));
    const openAssignments = teamUsers.size
      ? await this.prisma.cardAssignee.findMany({
          where: { userId: { in: [...teamUsers.keys()] }, card: { completedAt: null } },
          select: { userId: true, card: { select: { dueDate: true } } },
        })
      : [];
    const { open } = tallyOpenAssignments(openAssignments, now);
    const history = await this.loadHistory(userId, now);
    const workload = [...teamUsers].map(([id, name]) => ({ userId: id, name, openCount: open.get(id) ?? 0 }));
    workload.sort((a, b) => b.openCount - a.openCount || a.name.localeCompare(b.name));

    return {
      scope: { projectCount: projectIds.length },
      me: {
        assigned: myOpen.length,
        overdue: myOpen.filter((card) => isOverdue(card, now)).length,
        dueSoon: myOpen.filter((card) => isDueSoon(card, now)).length,
        closed: {
          total: myClosedRecent.filter((card) => isCompletedSince(card, since)).length,
          previous: myClosedRecent.filter(
            (card) => card.completedAt! >= previousSince && card.completedAt! < since,
          ).length,
          byDay: closedByDay,
        },
        history,
      },
      today,
      status,
      upcoming: { total: dueSoonCards.length, days },
      rhythm,
      workload,
    };
  }

  /// Series de UserDailySnapshot: solo si están los 7 días cerrados
  /// consecutivos. Un hueco (servidor caído a medianoche) deja la serie en
  /// null hasta que ese día salga de la ventana — se resuelve solo.
  private async loadHistory(userId: string, now: Date): Promise<Dashboard['me']['history']> {
    const days = lastClosedDays(now, WINDOW_DAYS);
    const rows = await this.prisma.userDailySnapshot.findMany({ where: { userId, date: { in: days } } });
    if (rows.length !== WINDOW_DAYS) return null;

    const byDate = new Map(rows.map((row) => [row.date.getTime(), row]));
    const ordered = days.map((day) => byDate.get(day.getTime()));
    if (ordered.some((row) => !row)) return null;
    return {
      assigned: ordered.map((row) => row!.assigned),
      overdue: ordered.map((row) => row!.overdue),
      dueSoon: ordered.map((row) => row!.dueSoon),
    };
  }

  /// 7 tramos de 24 h corridas terminando ahora, del más viejo al de hoy.
  /// Recibe solo fechas ya filtradas por `isCompletedSince(…, since)`, así que
  /// la suma de los tramos es exactamente ese conteo: los bordes (justo `since`
  /// o una fecha a futuro) caen en el tramo extremo en vez de perderse.
  private bucketByDay(completedAt: Date[], now: Date, since: Date): number[] {
    const buckets = new Array<number>(WINDOW_DAYS).fill(0);
    for (const date of completedAt) {
      if (date < since) continue;
      const daysAgo = Math.min(WINDOW_DAYS - 1, Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS)));
      buckets[WINDOW_DAYS - 1 - daysAgo] += 1;
    }
    return buckets;
  }
}
