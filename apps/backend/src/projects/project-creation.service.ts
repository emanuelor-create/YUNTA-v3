import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, ProjectRole } from '@prisma/client';
import { ActivityLogService } from '../activity/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { deriveProjectKey, firstFreeKey } from './project-key';
import { assertDateOrder, parseProjectDate, PROJECT_COLORS } from './project-input';

/// El tablero nace con estas cuatro columnas (README §4 / Tablero). La última
/// es "hecho": la invariante de BACKEND.md §2 se apoya en eso.
export const DEFAULT_COLUMNS = ['Por hacer', 'En curso', 'En revisión', 'Hecho'] as const;

const MAX_NAME_LENGTH = 120;
const KEY_ATTEMPTS = 3;

export interface CreateProjectInput {
  name?: string;
  client?: string | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  color?: string;
}

@Injectable()
export class ProjectCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /// POST /projects: proyecto + tablero con las cuatro columnas + el creador
  /// como OWNER, todo en una sola escritura (Prisma la envuelve en una
  /// transacción): no puede quedar un proyecto sin dueño ni sin tablero.
  async create(input: CreateProjectInput, creatorId: string): Promise<{ id: string; key: string; name: string }> {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('El nombre es obligatorio');
    if (name.length > MAX_NAME_LENGTH) {
      throw new BadRequestException(`El nombre no puede pasar de ${MAX_NAME_LENGTH} caracteres`);
    }

    const startDate = parseProjectDate('startDate', input.startDate);
    const endDate = parseProjectDate('endDate', input.endDate);
    assertDateOrder(startDate, endDate);

    if (input.color !== undefined && !(PROJECT_COLORS as readonly string[]).includes(input.color)) {
      throw new BadRequestException(`color inválido: tiene que ser de la paleta (${PROJECT_COLORS.join(', ')})`);
    }
    // Sin color elegido se reparte por la paleta según cuántos proyectos hay,
    // para que los nuevos no salgan todos del mismo tono.
    const color = input.color ?? PROJECT_COLORS[(await this.prisma.project.count()) % PROJECT_COLORS.length];

    const prefix = deriveProjectKey(name);
    for (let attempt = 1; attempt <= KEY_ATTEMPTS; attempt += 1) {
      const taken = await this.prisma.project.findMany({ where: { key: { startsWith: prefix } }, select: { key: true } });
      const key = firstFreeKey(prefix, taken.map((row) => row.key));

      try {
        const project = await this.prisma.project.create({
          data: {
            name,
            key,
            client: input.client?.trim() || null,
            description: input.description?.trim() || null,
            color,
            startDate,
            endDate,
            members: { create: { userId: creatorId, role: ProjectRole.OWNER } },
            board: {
              create: { columns: { create: DEFAULT_COLUMNS.map((columnName, position) => ({ name: columnName, position })) } },
            },
          },
          select: { id: true, key: true, name: true },
        });

        await this.activityLog.log({ projectId: project.id, userId: creatorId, type: 'PROJECT_CREATED', message: 'creó el proyecto' });
        return project;
      } catch (error) {
        // Dos altas simultáneas con el mismo prefijo: la clave es única, así que
        // la segunda choca. Se reintenta con la siguiente libre.
        const isKeyClash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!isKeyClash) throw error;
        if (attempt === KEY_ATTEMPTS) throw new ConflictException('No se pudo asignar una clave al proyecto, probá de nuevo');
      }
    }
    throw new ConflictException('No se pudo asignar una clave al proyecto, probá de nuevo');
  }
}
