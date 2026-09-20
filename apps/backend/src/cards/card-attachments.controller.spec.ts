import { ProjectRole } from '@prisma/client';
import { PROJECT_ROLES_KEY } from '../auth/project-roles.decorator';
import { CardAttachmentsController } from './card-attachments.controller';

// AuthGuard arrastra `jose` (ESM puro), que Jest no procesa; acá solo se leen
// los metadatos de los decoradores, no se ejecuta ningún guard.
jest.mock('../auth/auth.guard', () => ({ AuthGuard: class AuthGuard {} }));

/// Los roles de cada ruta, tal como los lee RolesGuard (getAllAndOverride: la
/// ruta pisa a la clase). Un VIEWER "consulta el tablero": tiene que poder ver y
/// descargar los adjuntos de una tarjeta que ve, pero no subir ni borrar.
function rolesOf(handler: (...args: never[]) => unknown): ProjectRole[] {
  return (Reflect.getMetadata(PROJECT_ROLES_KEY, handler) ?? Reflect.getMetadata(PROJECT_ROLES_KEY, CardAttachmentsController)) as ProjectRole[];
}

describe('CardAttachmentsController — permisos por ruta', () => {
  const proto = CardAttachmentsController.prototype;

  it('listar y descargar: cualquier miembro, VIEWER incluido (es lectura)', () => {
    expect(rolesOf(proto.list)).toEqual(expect.arrayContaining([ProjectRole.OWNER, ProjectRole.EDITOR, ProjectRole.VIEWER]));
    expect(rolesOf(proto.download)).toEqual(expect.arrayContaining([ProjectRole.OWNER, ProjectRole.EDITOR, ProjectRole.VIEWER]));
  });

  it('subir y borrar: solo OWNER y EDITOR — un VIEWER no escribe', () => {
    for (const handler of [proto.upload, proto.remove]) {
      const roles = rolesOf(handler);
      expect(roles).toEqual(expect.arrayContaining([ProjectRole.OWNER, ProjectRole.EDITOR]));
      expect(roles).not.toContain(ProjectRole.VIEWER);
    }
  });
});
