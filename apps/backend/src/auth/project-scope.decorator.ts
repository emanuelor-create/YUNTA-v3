import { SetMetadata } from '@nestjs/common';

/// Cómo resolver el proyecto de la request para @ProjectRoles cuando la ruta
/// no trae el projectId directo (ej. /boards/:id/columns, /cards/:id/move).
/// `param` es el nombre del param de ruta que trae el id del recurso
/// (default "id"); RolesGuard lo resuelve a un projectId según `resource`.
export type ProjectResourceType = 'project' | 'board' | 'card';

export interface ProjectScopeMeta {
  resource: ProjectResourceType;
  param: string;
}

export const PROJECT_SCOPE_KEY = 'projectScope';
export const ProjectScope = (resource: ProjectResourceType, param = 'id') =>
  SetMetadata(PROJECT_SCOPE_KEY, { resource, param });
