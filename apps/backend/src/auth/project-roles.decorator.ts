import { SetMetadata } from '@nestjs/common';
import { ProjectRole } from '@prisma/client';

/// Rol requerido dentro del proyecto de la request (OWNER/EDITOR/VIEWER).
/// RolesGuard busca el id del proyecto en `request.params.projectId` o,
/// si no está, en `request.params.id` (rutas tipo `/projects/:id/...`).
/// Un usuario con rol global ADMIN pasa este check sin ser ProjectMember.
export const PROJECT_ROLES_KEY = 'projectRoles';
export const ProjectRoles = (...roles: ProjectRole[]) => SetMetadata(PROJECT_ROLES_KEY, roles);
