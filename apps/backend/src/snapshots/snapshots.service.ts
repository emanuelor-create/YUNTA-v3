import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { isDueSoon, tallyOpenAssignments } from '../cards/card-metrics';
import { PrismaService } from '../prisma/prisma.service';
import { closedDay, dateColumn, SNAPSHOT_TIME_ZONE } from './snapshot-dates';

/// Foto diaria de proyectos y personas. El historial no se puede reconstruir
/// a posteriori (las tarjetas se reasignan, se reabren y se borran), así que
/// se guarda: cada noche una fila por proyecto y una por persona.
///
/// No hay "catch-up": si el servidor estaba caído a medianoche, ese día queda
/// sin foto — un hueco visible es honesto; un relleno con el estado de otro
/// momento sería una serie inventada.
@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 0 * * *', { timeZone: SNAPSHOT_TIME_ZONE })
  async captureNightly(): Promise<void> {
    try {
      const result = await this.capture(new Date());
      this.logger.log(`Foto del ${result.date}: ${result.projects} proyectos, ${result.users} personas`);
    } catch (error) {
      // Un error acá no debe tirar el proceso: el próximo día sigue andando.
      this.logger.error(`No se pudo tomar la foto diaria: ${String(error)}`);
    }
  }

  /// Estado a `now`, etiquetado con el día que acaba de cerrarse. Idempotente:
  /// correrlo dos veces para el mismo día pisa la fila, no la duplica.
  async capture(now: Date): Promise<{ date: string; projects: number; users: number }> {
    const ymd = closedDay(now);
    const date = dateColumn(ymd);

    const [projects, cards, users, openAssignments] = await Promise.all([
      this.prisma.project.findMany({ where: { archivedAt: null }, select: { id: true } }),
      this.prisma.card.findMany({
        where: { column: { board: { project: { archivedAt: null } } } },
        select: { completedAt: true, storyPoints: true, column: { select: { board: { select: { projectId: true } } } } },
      }),
      this.prisma.user.findMany({ where: { deletedAt: null, status: 'ACTIVE' }, select: { id: true } }),
      this.prisma.cardAssignee.findMany({
        where: { card: { completedAt: null } },
        select: { userId: true, card: { select: { dueDate: true, completedAt: true } } },
      }),
    ]);

    // Mismas definiciones que /stats (puntos: solo las estimadas; completada:
    // completedAt) para que la serie de un proyecto continúe lo que muestra su Resumen.
    const byProject = new Map<string, { open: number; done: number; points: number; donePoints: number }>();
    for (const project of projects) byProject.set(project.id, { open: 0, done: 0, points: 0, donePoints: 0 });
    for (const card of cards) {
      const row = byProject.get(card.column.board.projectId);
      if (!row) continue;
      if (card.completedAt === null) row.open += 1;
      else row.done += 1;
      row.points += card.storyPoints ?? 0;
      if (card.completedAt !== null) row.donePoints += card.storyPoints ?? 0;
    }

    const { open, overdue } = tallyOpenAssignments(openAssignments, now);
    const dueSoon = new Map<string, number>();
    for (const { userId, card } of openAssignments) {
      if (isDueSoon(card, now)) dueSoon.set(userId, (dueSoon.get(userId) ?? 0) + 1);
    }

    await this.prisma.$transaction([
      ...[...byProject].map(([projectId, row]) =>
        this.prisma.projectDailySnapshot.upsert({
          where: { projectId_date: { projectId, date } },
          create: {
            projectId,
            date,
            openCards: row.open,
            completedCards: row.done,
            totalPoints: row.points,
            completedPoints: row.donePoints,
          },
          update: {
            openCards: row.open,
            completedCards: row.done,
            totalPoints: row.points,
            completedPoints: row.donePoints,
          },
        }),
      ),
      ...users.map(({ id: userId }) => {
        const values = { assigned: open.get(userId) ?? 0, overdue: overdue.get(userId) ?? 0, dueSoon: dueSoon.get(userId) ?? 0 };
        return this.prisma.userDailySnapshot.upsert({
          where: { userId_date: { userId, date } },
          create: { userId, date, ...values },
          update: values,
        });
      }),
    ]);

    return { date: ymd, projects: byProject.size, users: users.length };
  }
}
