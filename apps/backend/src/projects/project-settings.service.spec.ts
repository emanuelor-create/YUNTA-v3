import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ActivityLogService } from '../activity/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../supabase/supabase-storage.service';
import { ProjectSettingsService } from './project-settings.service';

const ACTOR_ID = 'actor-1';

const EXISTING = {
  id: 'proj-1',
  name: 'Sitio web',
  client: 'Acme',
  description: null,
  startDate: new Date('2026-09-01T00:00:00.000Z'),
  endDate: new Date('2026-10-01T00:00:00.000Z'),
  archivedAt: null,
};

describe('ProjectSettingsService', () => {
  let prisma: {
    project: { findUnique: jest.Mock; update: jest.Mock; delete: jest.Mock };
    cardAttachment: { findMany: jest.Mock };
  };
  let storage: { remove: jest.Mock };
  let activityLog: { log: jest.Mock };
  let service: ProjectSettingsService;

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
      cardAttachment: { findMany: jest.fn() },
    };
    storage = { remove: jest.fn() };
    activityLog = { log: jest.fn() };
    // update devuelve la fila resultante: lo guardado pisa lo existente.
    prisma.project.update.mockImplementation(async ({ data }: { data: object }) => ({ ...EXISTING, ...data }));
    prisma.project.findUnique.mockResolvedValue(EXISTING);
    service = new ProjectSettingsService(
      prisma as unknown as PrismaService,
      storage as unknown as SupabaseStorageService,
      activityLog as unknown as ActivityLogService,
    );
  });

  describe('update', () => {
    it('tira 404 si el proyecto no existe', async () => {
      prisma.project.findUnique.mockResolvedValue(null);
      await expect(service.update('nope', { name: 'X' }, ACTOR_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('recorta el nombre y rechaza uno vacío', async () => {
      await service.update('proj-1', { name: '  Nuevo  ' }, ACTOR_ID);
      expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: 'proj-1' }, data: { name: 'Nuevo' } });

      await expect(service.update('proj-1', { name: '   ' }, ACTOR_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('un string vacío en cliente/resumen los limpia (null)', async () => {
      await service.update('proj-1', { client: '', description: '  ' }, ACTOR_ID);
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'proj-1' },
        data: { client: null, description: null },
      });
    });

    it('solo toca los campos que vienen en el body', async () => {
      await service.update('proj-1', { client: 'Otro' }, ACTOR_ID);
      expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: 'proj-1' }, data: { client: 'Otro' } });
    });

    it('rechaza una fecha inválida', async () => {
      await expect(service.update('proj-1', { endDate: 'no-es-fecha' }, ACTOR_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un fin anterior al inicio ya guardado, aunque el body traiga solo el fin', async () => {
      await expect(service.update('proj-1', { endDate: '2026-08-01' }, ACTOR_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('permite limpiar una fecha con null', async () => {
      await service.update('proj-1', { endDate: null }, ACTOR_ID);
      expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: 'proj-1' }, data: { endDate: null } });
    });
  });

  describe('actividad de update', () => {
    it('cambiar la fecha de entrega registra quién, y de qué fecha a cuál', async () => {
      await service.update('proj-1', { endDate: '2026-10-20' }, ACTOR_ID);

      expect(activityLog.log).toHaveBeenCalledTimes(1);
      expect(activityLog.log).toHaveBeenCalledWith({
        projectId: 'proj-1',
        userId: ACTOR_ID,
        type: 'PROJECT_UPDATED',
        message: 'cambió la fecha de entrega de 1 oct 2026 a 20 oct 2026',
      });
    });

    it('una entrada por campo que cambió, con valor anterior y nuevo', async () => {
      await service.update('proj-1', { name: 'Sitio nuevo', client: 'Globex', startDate: null }, ACTOR_ID);

      const messages = activityLog.log.mock.calls.map(([entry]) => entry.message);
      expect(messages).toEqual([
        'renombró el proyecto de "Sitio web" a "Sitio nuevo"',
        'cambió el cliente de "Acme" a "Globex"',
        'cambió la fecha de inicio de 1 sep 2026 a sin fecha',
      ]);
    });

    it('guardar sin cambios reales (mismo valor) no registra nada', async () => {
      await service.update('proj-1', { name: 'Sitio web', client: 'Acme', endDate: '2026-10-01T00:00:00.000Z' }, ACTOR_ID);

      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('un update rechazado por validación no registra nada', async () => {
      await expect(service.update('proj-1', { endDate: '2026-08-01' }, ACTOR_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(activityLog.log).not.toHaveBeenCalled();
    });
  });

  describe('setArchived', () => {
    it('archiva con la fecha actual y lo registra', async () => {
      await service.setArchived('proj-1', true, ACTOR_ID);

      expect(prisma.project.update.mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date);
      expect(activityLog.log).toHaveBeenCalledWith({
        projectId: 'proj-1',
        userId: ACTOR_ID,
        type: 'PROJECT_ARCHIVED',
        message: 'archivó el proyecto',
      });
    });

    it('desarchiva con null y lo registra', async () => {
      prisma.project.findUnique.mockResolvedValue({ ...EXISTING, archivedAt: new Date() });

      await service.setArchived('proj-1', false, ACTOR_ID);

      expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: 'proj-1' }, data: { archivedAt: null } });
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PROJECT_UNARCHIVED', message: 'desarchivó el proyecto' }),
      );
    });

    it('es idempotente: archivar uno ya archivado no cambia nada ni registra una entrada falsa', async () => {
      prisma.project.findUnique.mockResolvedValue({ ...EXISTING, archivedAt: new Date('2026-09-01') });

      await service.setArchived('proj-1', true, ACTOR_ID);

      expect(prisma.project.update).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('borra el proyecto y después los adjuntos de Storage', async () => {
      prisma.cardAttachment.findMany.mockResolvedValue([{ storagePath: 'c1/a.pdf' }, { storagePath: 'c2/b.png' }]);

      await service.remove('proj-1');

      expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: 'proj-1' } });
      expect(storage.remove).toHaveBeenCalledWith('c1/a.pdf');
      expect(storage.remove).toHaveBeenCalledWith('c2/b.png');
    });

    it('si Storage falla, no revierte ni tira: el proyecto ya se borró', async () => {
      prisma.cardAttachment.findMany.mockResolvedValue([{ storagePath: 'c1/a.pdf' }, { storagePath: 'c2/b.png' }]);
      storage.remove.mockRejectedValueOnce(new Error('storage caído'));

      await expect(service.remove('proj-1')).resolves.toBeUndefined();
      expect(storage.remove).toHaveBeenCalledTimes(2);
    });
  });
});
