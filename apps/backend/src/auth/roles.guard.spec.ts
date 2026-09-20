import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectRole, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from './roles.guard';
import { AuthenticatedRequest } from './types';

function makeContext(params: Record<string, string> = {}, auth?: { userId: string; email: string }) {
  const request: Partial<AuthenticatedRequest> = { params, auth: auth as any };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return context;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock };
    projectMember: { findUnique: jest.Mock };
    board: { findUnique: jest.Mock };
    card: { findUnique: jest.Mock };
  };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    prisma = {
      user: { findUnique: jest.fn() },
      projectMember: { findUnique: jest.fn() },
      board: { findUnique: jest.fn() },
      card: { findUnique: jest.fn() },
    };
    guard = new RolesGuard(reflector as unknown as Reflector, prisma as unknown as PrismaService);
  });

  it('permite el paso sin consultar nada si la ruta no tiene @Roles ni @ProjectRoles', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const result = await guard.canActivate(makeContext());

    expect(result).toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza con 401 si no corrió antes el AuthGuard (falta request.auth)', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce([UserRole.ADMIN]).mockReturnValueOnce(undefined);

    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe('@Roles (rol global)', () => {
    it('permite el paso si el rol global del usuario está en la lista', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce([UserRole.ADMIN]).mockReturnValueOnce(undefined);
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: UserRole.ADMIN });

      const result = await guard.canActivate(makeContext({}, { userId: 'u1', email: 'a@a.com' }));

      expect(result).toBe(true);
    });

    it('rechaza con 403 si el rol global no alcanza', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce([UserRole.ADMIN]).mockReturnValueOnce(undefined);
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: UserRole.DEVELOPER });

      await expect(
        guard.canActivate(makeContext({}, { userId: 'u1', email: 'a@a.com' })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('@ProjectRoles (rol de proyecto)', () => {
    it('un ADMIN global pasa sin necesidad de ser ProjectMember', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(undefined).mockReturnValueOnce([ProjectRole.EDITOR]);
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: UserRole.ADMIN });

      const result = await guard.canActivate(
        makeContext({ projectId: 'proj-1' }, { userId: 'u1', email: 'a@a.com' }),
      );

      expect(result).toBe(true);
      expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    });

    it('permite el paso si el ProjectMember tiene uno de los roles requeridos', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(undefined).mockReturnValueOnce([ProjectRole.EDITOR, ProjectRole.OWNER]);
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: UserRole.DEVELOPER });
      prisma.projectMember.findUnique.mockResolvedValue({ userId: 'u1', projectId: 'proj-1', role: ProjectRole.EDITOR });

      const result = await guard.canActivate(
        makeContext({ projectId: 'proj-1' }, { userId: 'u1', email: 'a@a.com' }),
      );

      expect(result).toBe(true);
      expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({
        where: { userId_projectId: { userId: 'u1', projectId: 'proj-1' } },
      });
    });

    it('usa params.id como projectId cuando no hay params.projectId', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(undefined).mockReturnValueOnce([ProjectRole.VIEWER]);
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: UserRole.DEVELOPER });
      prisma.projectMember.findUnique.mockResolvedValue({ userId: 'u1', projectId: 'proj-1', role: ProjectRole.VIEWER });

      await guard.canActivate(makeContext({ id: 'proj-1' }, { userId: 'u1', email: 'a@a.com' }));

      expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({
        where: { userId_projectId: { userId: 'u1', projectId: 'proj-1' } },
      });
    });

    it('rechaza con 403 si no es miembro del proyecto', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(undefined).mockReturnValueOnce([ProjectRole.EDITOR]);
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: UserRole.DEVELOPER });
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        guard.canActivate(makeContext({ projectId: 'proj-1' }, { userId: 'u1', email: 'a@a.com' })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rechaza con 403 si es miembro pero con un rol distinto al requerido', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(undefined).mockReturnValueOnce([ProjectRole.OWNER]);
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: UserRole.DEVELOPER });
      prisma.projectMember.findUnique.mockResolvedValue({ userId: 'u1', projectId: 'proj-1', role: ProjectRole.VIEWER });

      await expect(
        guard.canActivate(makeContext({ projectId: 'proj-1' }, { userId: 'u1', email: 'a@a.com' })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('@ProjectScope (proyecto resuelto vía board o card)', () => {
    it('resource "board": resuelve el projectId a partir de Board.projectId', async () => {
      reflector.getAllAndOverride
        .mockReturnValueOnce(undefined) // ROLES_KEY
        .mockReturnValueOnce([ProjectRole.OWNER]) // PROJECT_ROLES_KEY
        .mockReturnValueOnce({ resource: 'board', param: 'boardId' }); // PROJECT_SCOPE_KEY
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: UserRole.DEVELOPER });
      prisma.board.findUnique.mockResolvedValue({ id: 'board-1', projectId: 'proj-1' });
      prisma.projectMember.findUnique.mockResolvedValue({
        userId: 'u1',
        projectId: 'proj-1',
        role: ProjectRole.OWNER,
      });

      const result = await guard.canActivate(
        makeContext({ boardId: 'board-1' }, { userId: 'u1', email: 'a@a.com' }),
      );

      expect(result).toBe(true);
      expect(prisma.board.findUnique).toHaveBeenCalledWith({ where: { id: 'board-1' } });
      expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({
        where: { userId_projectId: { userId: 'u1', projectId: 'proj-1' } },
      });
    });

    it('resource "card": resuelve el projectId a partir de Card → Column → Board', async () => {
      reflector.getAllAndOverride
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce([ProjectRole.EDITOR, ProjectRole.OWNER])
        .mockReturnValueOnce({ resource: 'card', param: 'id' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: UserRole.DEVELOPER });
      prisma.card.findUnique.mockResolvedValue({
        id: 'card-1',
        column: { id: 'col-1', board: { id: 'board-1', projectId: 'proj-1' } },
      });
      prisma.projectMember.findUnique.mockResolvedValue({
        userId: 'u1',
        projectId: 'proj-1',
        role: ProjectRole.EDITOR,
      });

      const result = await guard.canActivate(
        makeContext({ id: 'card-1' }, { userId: 'u1', email: 'a@a.com' }),
      );

      expect(result).toBe(true);
      expect(prisma.card.findUnique).toHaveBeenCalledWith({
        where: { id: 'card-1' },
        include: { column: { include: { board: true } } },
      });
    });

    it('rechaza con 403 si el board/card referenciado no existe', async () => {
      reflector.getAllAndOverride
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce([ProjectRole.OWNER])
        .mockReturnValueOnce({ resource: 'board', param: 'boardId' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: UserRole.DEVELOPER });
      prisma.board.findUnique.mockResolvedValue(null);

      await expect(
        guard.canActivate(makeContext({ boardId: 'nope' }, { userId: 'u1', email: 'a@a.com' })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
