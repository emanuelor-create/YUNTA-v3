import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/// Rol global requerido (ADMIN/PM/DEVELOPER). Lo lee RolesGuard.
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
