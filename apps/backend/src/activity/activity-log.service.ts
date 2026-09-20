import { Injectable } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  message: string;
  cardId: string | null;
  cardTitle: string | null;
  createdAt: Date;
  user: { id: string; name: string };
}

interface LogInput {
  projectId: string;
  userId: string;
  type: ActivityType;
  message: string;
  cardId?: string;
  cardTitle?: string;
}

/// Un solo lugar que escribe en ActivityLog — los servicios de cards,
/// columnas y miembros lo llaman después de que su mutación principal ya se
/// confirmó. No transaccional con esa mutación a propósito (ver README de
/// Proyecto → Resumen, "Actividad reciente"): es un registro secundario,
/// no queremos que un fallo acá tumbe la operación real.
@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: LogInput): Promise<void> {
    await this.prisma.activityLog.create({ data: entry });
  }

  async recent(projectId: string, limit = 5): Promise<ActivityEntry[]> {
    return this.prisma.activityLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        message: true,
        cardId: true,
        cardTitle: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    });
  }
}
