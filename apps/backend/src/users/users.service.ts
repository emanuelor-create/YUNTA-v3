import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProjectRole, User, UserRole, UserStatus } from '@prisma/client';
import { tallyOpenAssignments } from '../cards/card-metrics';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ListUsersParams {
  page?: number;
  pageSize?: number;
  q?: string;
  role?: UserRole;
  status?: UserStatus;
}

export interface UserListItem {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  projectCount: number;
  /// Hasta 3, para las marcas de color de la grilla (README §5).
  projects: { id: string; name: string; color: string }[];
  openCount: number;
  overdueCount: number;
  lastActiveAt: Date | null;
}

export interface ListUsersResult {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  /// GET /users?page&pageSize&q&role&status — la grilla necesita, además del
  /// perfil, projectCount/openCount/overdueCount/lastActiveAt por usuario
  /// (BACKEND.md §3.3). Todo en pocas consultas por página, no N+1: una para
  /// la página de usuarios, una para memberships, una para asignaciones
  /// abiertas y una a auth.users para lastActiveAt.
  async list(params: ListUsersParams): Promise<ListUsersResult> {
    const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(Math.floor(params.pageSize), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (params.role) where.role = params.role;
    if (params.status) where.status = params.status;
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const userIds = users.map((user) => user.id);

    const [memberships, openAssignments, lastActiveByUser] = await Promise.all([
      userIds.length
        ? this.prisma.projectMember.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true, project: { select: { id: true, name: true, color: true } } },
            orderBy: { createdAt: 'asc' },
          })
        : [],
      userIds.length
        ? this.prisma.cardAssignee.findMany({
            where: { userId: { in: userIds }, card: { completedAt: null } },
            select: { userId: true, card: { select: { dueDate: true } } },
          })
        : [],
      userIds.length ? this.getLastActiveMap(userIds) : new Map<string, Date | null>(),
    ]);

    const projectCountByUser = new Map<string, number>();
    const projectsByUser = new Map<string, { id: string; name: string; color: string }[]>();
    for (const membership of memberships) {
      projectCountByUser.set(membership.userId, (projectCountByUser.get(membership.userId) ?? 0) + 1);
      const list = projectsByUser.get(membership.userId) ?? [];
      if (list.length < 3) list.push(membership.project);
      projectsByUser.set(membership.userId, list);
    }

    const { open: openByUser, overdue: overdueByUser } = tallyOpenAssignments(openAssignments, new Date());

    const items: UserListItem[] = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      projectCount: projectCountByUser.get(user.id) ?? 0,
      projects: projectsByUser.get(user.id) ?? [],
      openCount: openByUser.get(user.id) ?? 0,
      overdueCount: overdueByUser.get(user.id) ?? 0,
      lastActiveAt: lastActiveByUser.get(user.id) ?? null,
    }));

    return { items, total, page, pageSize };
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    await this.getUserOrThrow(id);
    this.validateUpdateDto(dto);

    if (dto.email !== undefined) {
      // auth.users es la fuente de identidad (ARCHITECTURE.md §2): si cambia
      // el email hay que cambiarlo ahí también, o el login queda con el viejo.
      await this.supabaseAdmin.updateAuthUser(id, { email: dto.email });
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.status = dto.isActive ? UserStatus.ACTIVE : UserStatus.INACTIVE;

    return this.prisma.user.update({ where: { id }, data });
  }

  async sendResetPasswordEmail(id: string): Promise<void> {
    const user = await this.getUserOrThrow(id);
    await this.supabaseAdmin.sendPasswordRecoveryEmail(user.email);
  }

  async setPassword(id: string, password: string): Promise<void> {
    await this.getUserOrThrow(id);
    if (password.length < 8) {
      throw new BadRequestException('La contraseña tiene que tener al menos 8 caracteres');
    }
    await this.supabaseAdmin.updateAuthUser(id, { password });
  }

  /// Soft delete: separado de INACTIVE (BACKEND.md §3.3 y §3.4 son cosas
  /// distintas — desactivar es reversible y visible en la grilla; borrar no).
  async softDelete(id: string): Promise<void> {
    await this.getUserOrThrow(id);
    await this.assertNotSoleOwnerAnywhere(id);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: UserStatus.INACTIVE },
    });
  }

  /// Sin esto, borrar al único OWNER de un proyecto deja al proyecto sin
  /// nadie que lo administre — la invariante de ProjectMembersService no lo
  /// ve porque esas filas quedan intactas (BACKEND.md §3.5).
  private async assertNotSoleOwnerAnywhere(userId: string): Promise<void> {
    const ownedMemberships = await this.prisma.projectMember.findMany({
      where: { userId, role: ProjectRole.OWNER },
      include: { project: { select: { name: true } } },
    });
    if (!ownedMemberships.length) return;

    const projectIds = ownedMemberships.map((membership) => membership.projectId);
    const otherOwners = await this.prisma.projectMember.findMany({
      where: {
        projectId: { in: projectIds },
        role: ProjectRole.OWNER,
        userId: { not: userId },
        user: { deletedAt: null },
      },
      select: { projectId: true },
      distinct: ['projectId'],
    });
    const projectsWithAnotherOwner = new Set(otherOwners.map((row) => row.projectId));

    const orphaned = ownedMemberships.filter(
      (membership) => !projectsWithAnotherOwner.has(membership.projectId),
    );
    if (orphaned.length) {
      const names = orphaned.map((membership) => membership.project.name).join(', ');
      throw new ConflictException(
        `Es el único OWNER de: ${names}. Asigná otro OWNER en ese proyecto antes de borrarlo.`,
      );
    }
  }

  private validateUpdateDto(dto: UpdateUserDto): void {
    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException('name no puede quedar vacío');
    }
    if (dto.email !== undefined && !EMAIL_RE.test(dto.email)) {
      throw new BadRequestException('email inválido');
    }
    if (dto.role !== undefined && !Object.values(UserRole).includes(dto.role)) {
      throw new BadRequestException(`role inválido: ${dto.role}`);
    }
    if (dto.isActive !== undefined && typeof dto.isActive !== 'boolean') {
      throw new BadRequestException('isActive tiene que ser boolean');
    }
  }

  private async getUserOrThrow(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) {
      throw new NotFoundException(`User ${id} no encontrado`);
    }
    return user;
  }

  /// last_sign_in_at vive en auth.users (lo gestiona Supabase), no en
  /// nuestro schema — se lee con una consulta cruzada de solo lectura.
  private async getLastActiveMap(userIds: string[]): Promise<Map<string, Date | null>> {
    const rows = await this.prisma.$queryRaw<{ id: string; last_sign_in_at: Date | null }[]>(
      Prisma.sql`SELECT id::text as id, last_sign_in_at FROM auth.users WHERE id::text = ANY(${userIds})`,
    );
    return new Map(rows.map((row) => [row.id, row.last_sign_in_at]));
  }
}
