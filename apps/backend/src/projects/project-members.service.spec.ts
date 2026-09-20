import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { ActivityLogService } from '../activity/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { ProjectMembersService } from './project-members.service';

const ACTOR_ID = 'actor-1';

describe('ProjectMembersService', () => {
  let prisma: {
    project: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    projectMember: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
  };
  let supabaseAdmin: { inviteUserByEmail: jest.Mock };
  let activityLog: { log: jest.Mock };
  let service: ProjectMembersService;

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      projectMember: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
    };
    supabaseAdmin = { inviteUserByEmail: jest.fn() };
    activityLog = { log: jest.fn() };
    service = new ProjectMembersService(
      prisma as unknown as PrismaService,
      supabaseAdmin as unknown as SupabaseAdminService,
      activityLog as unknown as ActivityLogService,
    );
  });

  describe('addMember', () => {
    it('si el usuario ya existe por email, no invita a Supabase — solo crea el ProjectMember', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'ya@existe.com' });
      prisma.projectMember.findUnique.mockResolvedValue(null);
      prisma.projectMember.create.mockResolvedValue({ id: 'pm-1', userId: 'user-1', projectId: 'proj-1', role: 'EDITOR' });

      await service.addMember('proj-1', 'ya@existe.com', ProjectRole.EDITOR, ACTOR_ID);

      expect(supabaseAdmin.inviteUserByEmail).not.toHaveBeenCalled();
      expect(prisma.projectMember.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', projectId: 'proj-1', role: ProjectRole.EDITOR },
      });
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'proj-1', userId: ACTOR_ID, type: 'MEMBER_ADDED' }),
      );
    });

    it('si no existe usuario con ese email, lo invita en Supabase y usa el perfil que dejó el trigger', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1' });
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // primer lookup por email: no existe
        .mockResolvedValueOnce({ id: 'new-user-id', email: 'nuevo@x.com' }); // segundo lookup por id, tras el trigger
      supabaseAdmin.inviteUserByEmail.mockResolvedValue('new-user-id');
      prisma.projectMember.findUnique.mockResolvedValue(null);
      prisma.projectMember.create.mockResolvedValue({});

      await service.addMember('proj-1', 'nuevo@x.com', ProjectRole.VIEWER, ACTOR_ID);

      expect(supabaseAdmin.inviteUserByEmail).toHaveBeenCalledWith('nuevo@x.com');
      expect(prisma.projectMember.create).toHaveBeenCalledWith({
        data: { userId: 'new-user-id', projectId: 'proj-1', role: ProjectRole.VIEWER },
      });
    });

    it('rechaza si ya es miembro del proyecto (409)', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@a.com' });
      prisma.projectMember.findUnique.mockResolvedValue({ id: 'pm-1' });

      await expect(
        service.addMember('proj-1', 'a@a.com', ProjectRole.EDITOR, ACTOR_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.projectMember.create).not.toHaveBeenCalled();
    });

    it('rechaza un email con formato inválido', async () => {
      await expect(
        service.addMember('proj-1', 'no-es-email', ProjectRole.EDITOR, ACTOR_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.project.findUnique).not.toHaveBeenCalled();
    });

    it('rechaza un role fuera del enum', async () => {
      await expect(
        service.addMember('proj-1', 'a@a.com', 'SUPERUSER' as ProjectRole, ACTOR_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tira 404 si el proyecto no existe', async () => {
      prisma.project.findUnique.mockResolvedValue(null);
      await expect(
        service.addMember('nope', 'a@a.com', ProjectRole.EDITOR, ACTOR_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateMemberRole', () => {
    it('actualiza el rol de un miembro existente', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        id: 'pm-1',
        userId: 'u1',
        projectId: 'proj-1',
        role: 'VIEWER',
        user: { name: 'Ana' },
      });
      prisma.projectMember.update.mockResolvedValue({ id: 'pm-1', role: 'OWNER' });

      await service.updateMemberRole('proj-1', 'u1', ProjectRole.OWNER, ACTOR_ID);

      expect(prisma.projectMember.update).toHaveBeenCalledWith({
        where: { id: 'pm-1' },
        data: { role: ProjectRole.OWNER },
      });
      // No es OWNER el que se está bajando, así que ni consulta el conteo.
      expect(prisma.projectMember.count).not.toHaveBeenCalled();
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'proj-1', userId: ACTOR_ID, type: 'MEMBER_ROLE_CHANGED' }),
      );
    });

    it('tira 404 si el usuario no es miembro del proyecto', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);
      await expect(
        service.updateMemberRole('proj-1', 'u1', ProjectRole.OWNER, ACTOR_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    describe('invariante del último OWNER', () => {
      it('rechaza con 409 bajarle el rol al único OWNER', async () => {
        prisma.projectMember.findUnique.mockResolvedValue({
          id: 'pm-1',
          userId: 'u1',
          projectId: 'proj-1',
          role: ProjectRole.OWNER,
          user: { name: 'Ana' },
        });
        prisma.projectMember.count.mockResolvedValue(1);

        await expect(
          service.updateMemberRole('proj-1', 'u1', ProjectRole.EDITOR, ACTOR_ID),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.projectMember.update).not.toHaveBeenCalled();
      });

      it('permite bajarle el rol a un OWNER si hay otro OWNER en el proyecto', async () => {
        prisma.projectMember.findUnique.mockResolvedValue({
          id: 'pm-1',
          userId: 'u1',
          projectId: 'proj-1',
          role: ProjectRole.OWNER,
          user: { name: 'Ana' },
        });
        prisma.projectMember.count.mockResolvedValue(2);
        prisma.projectMember.update.mockResolvedValue({ id: 'pm-1', role: ProjectRole.EDITOR });

        await service.updateMemberRole('proj-1', 'u1', ProjectRole.EDITOR, ACTOR_ID);

        expect(prisma.projectMember.update).toHaveBeenCalledWith({
          where: { id: 'pm-1' },
          data: { role: ProjectRole.EDITOR },
        });
      });

      it('permite reafirmar OWNER->OWNER sin siquiera consultar el conteo', async () => {
        prisma.projectMember.findUnique.mockResolvedValue({
          id: 'pm-1',
          userId: 'u1',
          projectId: 'proj-1',
          role: ProjectRole.OWNER,
          user: { name: 'Ana' },
        });
        prisma.projectMember.update.mockResolvedValue({ id: 'pm-1', role: ProjectRole.OWNER });

        await service.updateMemberRole('proj-1', 'u1', ProjectRole.OWNER, ACTOR_ID);

        expect(prisma.projectMember.count).not.toHaveBeenCalled();
        expect(prisma.projectMember.update).toHaveBeenCalled();
      });

      it('el conteo excluye OWNERs con soft delete (no cuentan como reemplazo)', async () => {
        prisma.projectMember.findUnique.mockResolvedValue({
          id: 'pm-1',
          userId: 'u1',
          projectId: 'proj-1',
          role: ProjectRole.OWNER,
          user: { name: 'Ana' },
        });
        prisma.projectMember.count.mockResolvedValue(1); // el otro OWNER está borrado, no cuenta

        await expect(
          service.updateMemberRole('proj-1', 'u1', ProjectRole.EDITOR, ACTOR_ID),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.projectMember.count).toHaveBeenCalledWith({
          where: { projectId: 'proj-1', role: ProjectRole.OWNER, user: { deletedAt: null } },
        });
      });
    });
  });

  describe('removeMember', () => {
    it('quita al miembro del proyecto', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        id: 'pm-1',
        role: ProjectRole.VIEWER,
        user: { name: 'Ana' },
      });
      await service.removeMember('proj-1', 'u1', ACTOR_ID);
      expect(prisma.projectMember.delete).toHaveBeenCalledWith({ where: { id: 'pm-1' } });
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'proj-1', userId: ACTOR_ID, type: 'MEMBER_REMOVED' }),
      );
    });

    it('tira 404 si no es miembro', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);
      await expect(service.removeMember('proj-1', 'u1', ACTOR_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    describe('invariante del último OWNER', () => {
      it('rechaza con 409 quitar al único OWNER del proyecto', async () => {
        prisma.projectMember.findUnique.mockResolvedValue({
          id: 'pm-1',
          userId: 'u1',
          projectId: 'proj-1',
          role: ProjectRole.OWNER,
          user: { name: 'Ana' },
        });
        prisma.projectMember.count.mockResolvedValue(1);

        await expect(service.removeMember('proj-1', 'u1', ACTOR_ID)).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.projectMember.delete).not.toHaveBeenCalled();
      });

      it('permite quitar a un OWNER si hay otro OWNER en el proyecto', async () => {
        prisma.projectMember.findUnique.mockResolvedValue({
          id: 'pm-1',
          userId: 'u1',
          projectId: 'proj-1',
          role: ProjectRole.OWNER,
          user: { name: 'Ana' },
        });
        prisma.projectMember.count.mockResolvedValue(2);

        await service.removeMember('proj-1', 'u1', ACTOR_ID);

        expect(prisma.projectMember.delete).toHaveBeenCalledWith({ where: { id: 'pm-1' } });
      });
    });
  });
});
