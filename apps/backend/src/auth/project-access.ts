import { ProjectRole, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ProjectAccess {
  role: ProjectRole | null;
  isAdmin: boolean;
  /// Crear y mover tarjetas: OWNER o EDITOR (o ADMIN global, que el RolesGuard
  /// deja pasar igual).
  canEdit: boolean;
  /// Columnas, configuración y personas: OWNER (o ADMIN).
  canManage: boolean;
}

/// Qué puede hacer `userId` en `projectId`, con el mismo criterio que
/// RolesGuard. La UI lo usa para esconder lo que igual devolvería 403; la
/// autorización real sigue siendo la del guard.
export async function projectAccess(prisma: PrismaService, projectId: string, userId: string): Promise<ProjectAccess> {
  const [membership, user] = await Promise.all([
    prisma.projectMember.findUnique({ where: { userId_projectId: { userId, projectId } }, select: { role: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ]);
  const isAdmin = user?.role === UserRole.ADMIN;
  const role = membership?.role ?? null;
  return {
    role,
    isAdmin,
    canEdit: isAdmin || role === ProjectRole.OWNER || role === ProjectRole.EDITOR,
    canManage: isAdmin || role === ProjectRole.OWNER,
  };
}
