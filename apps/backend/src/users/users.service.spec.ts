import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProjectRole, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { UsersService } from './users.service';

function user(overrides: Partial<{ id: string; email: string; name: string; role: UserRole; status: UserStatus; deletedAt: Date | null }> = {}) {
  return {
    id: overrides.id ?? 'user-1',
    email: overrides.email ?? 'ana@yunta.test',
    name: overrides.name ?? 'Ana',
    role: overrides.role ?? UserRole.DEVELOPER,
    status: overrides.status ?? UserStatus.ACTIVE,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: overrides.deletedAt ?? null,
  };
}

describe('UsersService', () => {
  let prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock; update: jest.Mock };
    projectMember: { findMany: jest.Mock };
    cardAssignee: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let supabaseAdmin: { updateAuthUser: jest.Mock; sendPasswordRecoveryEmail: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
      cardAssignee: { findMany: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    supabaseAdmin = { updateAuthUser: jest.fn(), sendPasswordRecoveryEmail: jest.fn() };
    service = new UsersService(
      prisma as unknown as PrismaService,
      supabaseAdmin as unknown as SupabaseAdminService,
    );
  });

  describe('list', () => {
    it('excluye siempre a los usuarios con soft delete', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);

      await service.list({});

      expect(prisma.user.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      );
    });

    it('trae projectCount, projects (color), openCount, overdueCount y lastActiveAt por usuario, sin N+1', async () => {
      const u1 = user({ id: 'u1' });
      const u2 = user({ id: 'u2' });
      prisma.user.count.mockResolvedValue(2);
      prisma.user.findMany.mockResolvedValue([u1, u2]);
      prisma.projectMember.findMany.mockResolvedValue([
        { userId: 'u1', project: { id: 'p1', name: 'CRM', color: '#b4552f' } },
        { userId: 'u1', project: { id: 'p2', name: 'App', color: '#8a5a2b' } },
        { userId: 'u1', project: { id: 'p3', name: 'Web', color: '#5c564d' } },
        { userId: 'u1', project: { id: 'p4', name: 'Extra', color: '#8a8378' } }, // no entra: máx 3
        { userId: 'u2', project: { id: 'p1', name: 'CRM', color: '#b4552f' } },
      ]);
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
      prisma.cardAssignee.findMany.mockResolvedValue([
        { userId: 'u1', card: { dueDate: past } }, // abierta y vencida
        { userId: 'u1', card: { dueDate: future } }, // abierta, no vencida
        { userId: 'u2', card: { dueDate: null } }, // abierta, sin vencimiento
      ]);
      prisma.$queryRaw.mockResolvedValue([{ id: 'u1', last_sign_in_at: past }]);

      const result = await service.list({});

      // Una sola consulta por tipo de dato, no una por usuario.
      expect(prisma.projectMember.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.cardAssignee.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);

      expect(result.items).toEqual([
        expect.objectContaining({
          id: 'u1',
          projectCount: 4,
          projects: [
            { id: 'p1', name: 'CRM', color: '#b4552f' },
            { id: 'p2', name: 'App', color: '#8a5a2b' },
            { id: 'p3', name: 'Web', color: '#5c564d' },
          ],
          openCount: 2,
          overdueCount: 1,
          lastActiveAt: past,
        }),
        expect.objectContaining({
          id: 'u2',
          projectCount: 1,
          projects: [{ id: 'p1', name: 'CRM', color: '#b4552f' }],
          openCount: 1,
          overdueCount: 0,
          lastActiveAt: null,
        }),
      ]);
      expect(result.total).toBe(2);
    });

    it('pageSize se acota a un máximo razonable', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.list({ pageSize: 10000 });

      expect(result.pageSize).toBe(100);
    });
  });

  describe('update', () => {
    it('actualiza name/role sin tocar Supabase Auth si no cambia el email', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      prisma.user.update.mockResolvedValue(user({ name: 'Ana P.' }));

      await service.update('user-1', { name: 'Ana P.' });

      expect(supabaseAdmin.updateAuthUser).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { name: 'Ana P.' } });
    });

    it('si cambia el email, actualiza primero Supabase Auth', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      prisma.user.update.mockResolvedValue(user({ email: 'nueva@yunta.test' }));

      await service.update('user-1', { email: 'nueva@yunta.test' });

      expect(supabaseAdmin.updateAuthUser).toHaveBeenCalledWith('user-1', { email: 'nueva@yunta.test' });
    });

    it('isActive:true mapea a status ACTIVE, isActive:false a INACTIVE', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      prisma.user.update.mockResolvedValue(user());

      await service.update('user-1', { isActive: false });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: UserStatus.INACTIVE },
      });

      await service.update('user-1', { isActive: true });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: UserStatus.ACTIVE },
      });
    });

    it('rechaza un email con formato inválido', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      await expect(service.update('user-1', { email: 'no-es-un-email' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(supabaseAdmin.updateAuthUser).not.toHaveBeenCalled();
    });

    it('rechaza un role fuera del enum', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      await expect(
        service.update('user-1', { role: 'SUPERADMIN' as UserRole }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tira 404 si el usuario no existe o está borrado', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.update('nope', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('sendResetPasswordEmail', () => {
    it('manda el correo al email actual del usuario', async () => {
      prisma.user.findUnique.mockResolvedValue(user({ email: 'ana@yunta.test' }));
      await service.sendResetPasswordEmail('user-1');
      expect(supabaseAdmin.sendPasswordRecoveryEmail).toHaveBeenCalledWith('ana@yunta.test');
    });
  });

  describe('setPassword', () => {
    it('rechaza contraseñas de menos de 8 caracteres', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      await expect(service.setPassword('user-1', 'short')).rejects.toBeInstanceOf(BadRequestException);
      expect(supabaseAdmin.updateAuthUser).not.toHaveBeenCalled();
    });

    it('actualiza la contraseña en Supabase Auth si tiene 8+ caracteres', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      await service.setPassword('user-1', 'password123');
      expect(supabaseAdmin.updateAuthUser).toHaveBeenCalledWith('user-1', { password: 'password123' });
    });
  });

  describe('softDelete', () => {
    it('setea deletedAt y status INACTIVE', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      await service.softDelete('user-1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { deletedAt: expect.any(Date), status: UserStatus.INACTIVE },
      });
    });

    it('tira 404 si ya estaba borrado (no se puede borrar dos veces)', async () => {
      prisma.user.findUnique.mockResolvedValue(user({ deletedAt: new Date() }));
      await expect(service.softDelete('user-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    describe('único OWNER de un proyecto', () => {
      it('rechaza con 409 si es el único OWNER (sin otro OWNER activo)', async () => {
        prisma.user.findUnique.mockResolvedValue(user());
        prisma.projectMember.findMany
          .mockResolvedValueOnce([
            { projectId: 'proj-1', role: ProjectRole.OWNER, project: { name: 'Proyecto Fénix' } },
          ]) // ownedMemberships
          .mockResolvedValueOnce([]); // otherOwners: ninguno

        await expect(service.softDelete('user-1')).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.user.update).not.toHaveBeenCalled();
      });

      it('un OWNER soft-borrado en otro lado no cuenta como reemplazo válido', async () => {
        prisma.user.findUnique.mockResolvedValue(user());
        prisma.projectMember.findMany
          .mockResolvedValueOnce([
            { projectId: 'proj-1', role: ProjectRole.OWNER, project: { name: 'Proyecto Fénix' } },
          ])
          .mockResolvedValueOnce([]); // el filtro user.deletedAt:null ya lo excluyó antes de llegar acá

        await expect(service.softDelete('user-1')).rejects.toBeInstanceOf(ConflictException);
      });

      it('permite borrar si hay otro OWNER activo en el proyecto', async () => {
        prisma.user.findUnique.mockResolvedValue(user());
        prisma.projectMember.findMany
          .mockResolvedValueOnce([
            { projectId: 'proj-1', role: ProjectRole.OWNER, project: { name: 'Proyecto Fénix' } },
          ])
          .mockResolvedValueOnce([{ projectId: 'proj-1' }]); // otro OWNER activo

        await service.softDelete('user-1');

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          data: { deletedAt: expect.any(Date), status: UserStatus.INACTIVE },
        });
      });

      it('permite borrar sin consultar nada más si no es OWNER de ningún proyecto', async () => {
        prisma.user.findUnique.mockResolvedValue(user());
        prisma.projectMember.findMany.mockResolvedValueOnce([]); // sin memberships OWNER

        await service.softDelete('user-1');

        expect(prisma.projectMember.findMany).toHaveBeenCalledTimes(1); // no llega a pedir otherOwners
        expect(prisma.user.update).toHaveBeenCalled();
      });
    });
  });
});
