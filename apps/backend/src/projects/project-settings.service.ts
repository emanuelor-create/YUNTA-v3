import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Project } from '@prisma/client';
import { ActivityLogService } from '../activity/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../supabase/supabase-storage.service';

export interface UpdateProjectInput {
  name?: string;
  client?: string | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/// Las fechas de proyecto se guardan a mediodía UTC (el front manda
/// `YYYY-MM-DDT12:00Z`), así que los getters UTC devuelven el día elegido.
function formatDate(date: Date | null): string {
  return date ? `${date.getUTCDate()} ${MONTHS_ES[date.getUTCMonth()]} ${date.getUTCFullYear()}` : 'sin fecha';
}

const quote = (value: string | null) => (value ? `"${value}"` : 'vacío');

/// Modal de configuración de Proyecto → Resumen (README §4): editar los
/// campos, archivar y eliminar. Todo OWNER-only (lo resuelve el controller).
@Injectable()
export class ProjectSettingsService {
  private readonly logger = new Logger(ProjectSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async update(projectId: string, input: UpdateProjectInput, actorId: string): Promise<Project> {
    const project = await this.getProjectOrThrow(projectId);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('El nombre no puede estar vacío');
      data.name = name;
    }
    // "" y null limpian el campo: el modal manda string vacío cuando se borra el input.
    if (input.client !== undefined) data.client = input.client?.trim() || null;
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.startDate !== undefined) data.startDate = this.parseDate('startDate', input.startDate);
    if (input.endDate !== undefined) data.endDate = this.parseDate('endDate', input.endDate);

    // Se valida contra el estado resultante, no contra el body: mover solo el
    // fin a antes del inicio que ya estaba guardado también tiene que fallar.
    const startDate = (data.startDate !== undefined ? data.startDate : project.startDate) as Date | null;
    const endDate = (data.endDate !== undefined ? data.endDate : project.endDate) as Date | null;
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio');
    }

    const updated = await this.prisma.project.update({ where: { id: projectId }, data });

    // Una entrada por campo que de verdad cambió, con el valor anterior y el
    // nuevo: "quién movió la fecha de entrega" tiene que poder leerse.
    const messages = this.describeChanges(project, updated);
    for (const message of messages) {
      await this.activityLog.log({ projectId, userId: actorId, type: 'PROJECT_UPDATED', message });
    }
    return updated;
  }

  private describeChanges(before: Project, after: Project): string[] {
    const messages: string[] = [];
    if (before.name !== after.name) {
      messages.push(`renombró el proyecto de "${before.name}" a "${after.name}"`);
    }
    if (before.client !== after.client) {
      messages.push(`cambió el cliente de ${quote(before.client)} a ${quote(after.client)}`);
    }
    if (before.description !== after.description) {
      messages.push('editó el resumen del proyecto');
    }
    if (before.startDate?.getTime() !== after.startDate?.getTime()) {
      messages.push(`cambió la fecha de inicio de ${formatDate(before.startDate)} a ${formatDate(after.startDate)}`);
    }
    if (before.endDate?.getTime() !== after.endDate?.getTime()) {
      messages.push(`cambió la fecha de entrega de ${formatDate(before.endDate)} a ${formatDate(after.endDate)}`);
    }
    return messages;
  }

  async setArchived(projectId: string, archived: boolean, actorId: string): Promise<void> {
    const project = await this.getProjectOrThrow(projectId);
    // Idempotente: archivar uno ya archivado (o desarchivar uno activo) no
    // toca archivedAt ni ensucia la actividad con una entrada falsa.
    if (!!project.archivedAt === archived) return;

    await this.prisma.project.update({
      where: { id: projectId },
      data: { archivedAt: archived ? new Date() : null },
    });
    await this.activityLog.log({
      projectId,
      userId: actorId,
      type: archived ? 'PROJECT_ARCHIVED' : 'PROJECT_UNARCHIVED',
      message: archived ? 'archivó el proyecto' : 'desarchivó el proyecto',
    });
  }

  /// Borra el proyecto y, por cascada, tablero, columnas, tarjetas, miembros y
  /// actividad. Los archivos de adjuntos viven en Storage (no en la base), así
  /// que se juntan antes y se borran después: si Storage falla, el proyecto ya
  /// no existe y quedan archivos huérfanos — se loguea en vez de resucitar
  /// datos que el usuario acaba de confirmar borrar.
  async remove(projectId: string): Promise<void> {
    await this.getProjectOrThrow(projectId);

    const attachments = await this.prisma.cardAttachment.findMany({
      where: { card: { column: { board: { projectId } } } },
      select: { storagePath: true },
    });

    await this.prisma.project.delete({ where: { id: projectId } });

    for (const { storagePath } of attachments) {
      try {
        await this.storage.remove(storagePath);
      } catch (error) {
        this.logger.warn(`Adjunto huérfano tras borrar el proyecto ${projectId}: ${storagePath} (${String(error)})`);
      }
    }
  }

  private parseDate(field: string, value: string | null): Date | null {
    if (value === null || value === '') return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} no es una fecha válida`);
    }
    return parsed;
  }

  private async getProjectOrThrow(projectId: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} no encontrado`);
    }
    return project;
  }
}
