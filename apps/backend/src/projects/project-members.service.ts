import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectMember, ProjectRole } from '@prisma/client';
import { ActivityLogService } from '../activity/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /// POST /projects/:id/members — invita por email (BACKEND.md §3.5), no
  /// recibe userId. Si no hay usuario con ese correo, lo crea en Supabase
  /// Auth (manda la invitación) y deja que el trigger del paso 4 lo
  /// sincronice como PENDING antes de agregarlo como ProjectMember.
  async addMember(projectId: string, email: string, role: ProjectRole, actorId: string): Promise<ProjectMember> {
    if (!EMAIL_RE.test(email)) {
      throw new BadRequestException('email inválido');
    }
    this.assertValidRole(role);
    await this.getProjectOrThrow(projectId);

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      const authUserId = await this.supabaseAdmin.inviteUserByEmail(email);
      user = await this.prisma.user.findUnique({ where: { id: authUserId } });
      if (!user) {
        throw new InternalServerErrorException(
          'El usuario se invitó en Supabase pero su perfil todavía no existe — revisá el trigger de auth.users',
        );
      }
    }

    const existing = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: user.id, projectId } },
    });
    if (existing) {
      throw new ConflictException('Ese usuario ya es miembro del proyecto');
    }

    const membership = await this.prisma.projectMember.create({ data: { userId: user.id, projectId, role } });

    await this.activityLog.log({
      projectId,
      userId: actorId,
      type: 'MEMBER_ADDED',
      message: `invitó a ${email} como ${role}`,
    });
    return membership;
  }

  async updateMemberRole(
    projectId: string,
    userId: string,
    role: ProjectRole,
    actorId: string,
  ): Promise<ProjectMember> {
    this.assertValidRole(role);
    const membership = await this.getMembershipOrThrow(projectId, userId);
    if (role !== ProjectRole.OWNER) {
      await this.assertNotLastOwner(projectId, membership);
    }
    const updated = await this.prisma.projectMember.update({ where: { id: membership.id }, data: { role } });

    await this.activityLog.log({
      projectId,
      userId: actorId,
      type: 'MEMBER_ROLE_CHANGED',
      message: `cambió el rol de ${membership.user.name} a ${role}`,
    });
    return updated;
  }

  async removeMember(projectId: string, userId: string, actorId: string): Promise<void> {
    const membership = await this.getMembershipOrThrow(projectId, userId);
    await this.assertNotLastOwner(projectId, membership);
    await this.prisma.projectMember.delete({ where: { id: membership.id } });

    await this.activityLog.log({
      projectId,
      userId: actorId,
      type: 'MEMBER_REMOVED',
      message: `quitó a ${membership.user.name} del proyecto`,
    });
  }

  /// El proyecto siempre tiene que conservar al menos un OWNER (BACKEND.md
  /// §3.5): sin esto, un OWNER puede dejarse afuera y nadie queda para
  /// administrar el proyecto — ni el "Cambiar" del responsable ni el "×" de
  /// cada miembro deberían poder llegar a ese estado.
  private async assertNotLastOwner(projectId: string, membership: ProjectMember): Promise<void> {
    if (membership.role !== ProjectRole.OWNER) return;

    // Un OWNER soft-borrado (DELETE /users/:id) no cuenta como reemplazo
    // válido — la fila de ProjectMember le sobrevive, pero ya no hay nadie
    // ahí para administrar el proyecto.
    const ownerCount = await this.prisma.projectMember.count({
      where: { projectId, role: ProjectRole.OWNER, user: { deletedAt: null } },
    });
    if (ownerCount <= 1) {
      throw new ConflictException('El proyecto tiene que conservar al menos un OWNER');
    }
  }

  private assertValidRole(role: ProjectRole): void {
    if (!Object.values(ProjectRole).includes(role)) {
      throw new BadRequestException(`role inválido: ${role}`);
    }
  }

  private async getProjectOrThrow(projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} no encontrado`);
    }
    return project;
  }

  private async getMembershipOrThrow(projectId: string, userId: string) {
    const membership = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
      include: { user: { select: { name: true } } },
    });
    if (!membership) {
      throw new NotFoundException('Ese usuario no es miembro del proyecto');
    }
    return membership;
  }
}
