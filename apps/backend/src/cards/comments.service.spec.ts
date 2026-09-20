import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { ActivityLogService } from '../activity/activity-log.service';
import { PROJECT_ROLES_KEY } from '../auth/project-roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

// AuthGuard arrastra `jose` (ESM puro), que Jest no procesa; acá solo se leen
// los metadatos de los decoradores, no se ejecuta ningún guard.
jest.mock('../auth/auth.guard', () => ({ AuthGuard: class AuthGuard {} }));

const ME = 'user-me';
const OTHER = 'user-other';
const CARD = { id: 'card-1', title: 'Una tarjeta', column: { board: { projectId: 'proj-1' } } };

const row = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  cardId: 'card-1',
  authorId: ME,
  text: 'Hola equipo',
  createdAt: new Date('2026-09-20T10:00:00Z'),
  editedAt: null,
  author: { id: ME, name: 'Emanuel' },
  ...over,
});

describe('CommentsService', () => {
  let prisma: { card: { findUnique: jest.Mock }; comment: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock } };
  let activityLog: { log: jest.Mock };
  let service: CommentsService;

  beforeEach(() => {
    prisma = {
      card: { findUnique: jest.fn().mockResolvedValue(CARD) },
      comment: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    };
    activityLog = { log: jest.fn() };
    service = new CommentsService(prisma as unknown as PrismaService, activityLog as unknown as ActivityLogService);
  });

  describe('list', () => {
    it('devuelve los comentarios de la más vieja a la más nueva, con autor y si son míos', async () => {
      prisma.comment.findMany.mockResolvedValue([row(), row({ id: 'c2', authorId: OTHER, author: { id: OTHER, name: 'Ana' } })]);

      const list = await service.list('card-1', ME);

      expect(prisma.comment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { cardId: 'card-1' }, orderBy: { createdAt: 'asc' } }));
      expect(list.map((c) => [c.id, c.author.name, c.mine])).toEqual([['c1', 'Emanuel', true], ['c2', 'Ana', false]]);
    });

    it('404 si la tarjeta no existe', async () => {
      prisma.card.findUnique.mockResolvedValue(null);
      await expect(service.list('nope', ME)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    beforeEach(() => prisma.comment.create.mockImplementation(async ({ data }) => row({ id: 'new', text: data.text, authorId: data.authorId })));

    it('guarda el texto recortado a nombre del que llama, y lo cuenta en Actividad', async () => {
      const view = await service.create('card-1', '  Revisé el diseño  ', ME);

      expect(prisma.comment.create).toHaveBeenCalledWith(expect.objectContaining({ data: { cardId: 'card-1', authorId: ME, text: 'Revisé el diseño' } }));
      expect(view).toMatchObject({ text: 'Revisé el diseño', mine: true, editedAt: null });
      expect(activityLog.log).toHaveBeenCalledWith({
        projectId: 'proj-1',
        userId: ME,
        type: 'COMMENT_ADDED',
        message: 'comentó: "Revisé el diseño"',
        cardId: 'card-1',
        cardTitle: 'Una tarjeta',
      });
    });

    it('en Actividad el comentario largo va cortado y en un solo renglón', async () => {
      await service.create('card-1', `Primera línea\n\n${'palabra '.repeat(40)}`, ME);
      const message = activityLog.log.mock.calls[0][0].message as string;
      expect(message).not.toContain('\n');
      expect(message.endsWith('…"')).toBe(true);
      expect(message.length).toBeLessThan(100);
    });

    it('rechaza vacío, solo espacios, no-texto y más de 2000 caracteres, sin escribir', async () => {
      for (const bad of ['', '   \n ', undefined, null, 42]) {
        await expect(service.create('card-1', bad, ME)).rejects.toBeInstanceOf(BadRequestException);
      }
      await expect(service.create('card-1', 'x'.repeat(2001), ME)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.comment.create).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('conserva los saltos de línea del medio', async () => {
      await service.create('card-1', 'uno\ndos', ME);
      expect(prisma.comment.create.mock.calls[0][0].data.text).toBe('uno\ndos');
    });
  });

  describe('edit', () => {
    beforeEach(() => {
      prisma.comment.findUnique.mockResolvedValue(row());
      prisma.comment.update.mockImplementation(async ({ data }) => row({ text: data.text, editedAt: data.editedAt }));
    });

    it('el autor edita: cambia el texto, queda marcado como editado y en Actividad', async () => {
      const view = await service.edit('card-1', 'c1', 'Hola equipo, corregido', ME);

      expect(prisma.comment.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1' }, data: { text: 'Hola equipo, corregido', editedAt: expect.any(Date) } }));
      expect(view.editedAt).toBeInstanceOf(Date);
      expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({ type: 'COMMENT_EDITED', message: 'editó un comentario' }));
    });

    it('no se puede editar el comentario de otra persona (403), aunque sea OWNER o ADMIN', async () => {
      prisma.comment.findUnique.mockResolvedValue(row({ authorId: OTHER, author: { id: OTHER, name: 'Ana' } }));
      await expect(service.edit('card-1', 'c1', 'Lo pisé', ME)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.comment.update).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('guardar el mismo texto no lo marca como editado ni registra nada', async () => {
      const view = await service.edit('card-1', 'c1', '  Hola equipo  ', ME);
      expect(prisma.comment.update).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
      expect(view.editedAt).toBeNull();
    });

    it('404 si el comentario es de otra tarjeta o no existe; 400 con texto vacío', async () => {
      prisma.comment.findUnique.mockResolvedValue(row({ cardId: 'otra' }));
      await expect(service.edit('card-1', 'c1', 'x', ME)).rejects.toBeInstanceOf(NotFoundException);
      prisma.comment.findUnique.mockResolvedValue(null);
      await expect(service.edit('card-1', 'nope', 'x', ME)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.edit('card-1', 'c1', '  ', ME)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('el autor lo borra y queda en Actividad', async () => {
      prisma.comment.findUnique.mockResolvedValue(row());
      await service.remove('card-1', 'c1', ME);
      expect(prisma.comment.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
      expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({ type: 'COMMENT_DELETED', message: 'eliminó un comentario' }));
    });

    it('no se puede borrar el de otra persona (403)', async () => {
      prisma.comment.findUnique.mockResolvedValue(row({ authorId: OTHER }));
      await expect(service.remove('card-1', 'c1', ME)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.comment.delete).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('404 si no existe en esa tarjeta', async () => {
      prisma.comment.findUnique.mockResolvedValue(row({ cardId: 'otra' }));
      await expect(service.remove('card-1', 'c1', ME)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe('CommentsController — permisos por ruta', () => {
  const proto = CommentsController.prototype;
  const rolesOf = (handler: (...args: never[]) => unknown): ProjectRole[] =>
    (Reflect.getMetadata(PROJECT_ROLES_KEY, handler) ?? Reflect.getMetadata(PROJECT_ROLES_KEY, CommentsController)) as ProjectRole[];

  it('leer y comentar: cualquier miembro, VIEWER incluido ("consulta el tablero y comenta")', () => {
    for (const handler of [proto.list, proto.create]) {
      expect(rolesOf(handler)).toEqual(expect.arrayContaining([ProjectRole.OWNER, ProjectRole.EDITOR, ProjectRole.VIEWER]));
    }
  });

  it('editar y borrar pasan el guard de rol para cualquier miembro: la restricción real es "solo el autor", en el servicio', () => {
    for (const handler of [proto.edit, proto.remove]) {
      expect(rolesOf(handler)).toEqual(expect.arrayContaining([ProjectRole.OWNER, ProjectRole.EDITOR, ProjectRole.VIEWER]));
    }
  });
});
