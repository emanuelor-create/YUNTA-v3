import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ActivityLogService } from '../activity/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../supabase/supabase-storage.service';
import { CardsService } from './cards.service';

/// Fecha de inicio y etiquetas (detalle de tarjeta, Yunta-Tarjeta-Detalle).
const PROJECT_ID = 'proj-1';
const ACTOR = 'u1';

const cardRow = (over: Record<string, unknown> = {}) => ({
  id: 'a',
  title: 'Revisar wireframes',
  startDate: null,
  dueDate: null,
  parentId: null,
  _count: { children: 0 },
  column: { id: 'doing', board: { projectId: PROJECT_ID } },
  ...over,
});

describe('CardsService — fecha de inicio y etiquetas', () => {
  let prisma: Record<string, any>;
  let activityLog: { log: jest.Mock };
  let service: CardsService;

  beforeEach(() => {
    prisma = {
      card: {
        findUnique: jest.fn().mockResolvedValue(cardRow()),
        update: jest.fn(async ({ data }: { data: object }) => ({ ...cardRow(), ...data })),
      },
      label: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(async ({ data }: { data: { name: string; tone: string } }) => ({ id: 'l-new', name: data.name, tone: data.tone })),
      },
      cardLabel: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
    activityLog = { log: jest.fn() };
    service = new CardsService(
      prisma as unknown as PrismaService,
      activityLog as unknown as ActivityLogService,
      { remove: jest.fn() } as unknown as SupabaseStorageService,
    );
  });

  describe('updateStartDate', () => {
    it('guarda la fecha a las 15:00 UTC y lo anota en Actividad', async () => {
      await service.updateStartDate('a', '2026-08-20', ACTOR);

      expect(prisma.card.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { startDate: new Date('2026-08-20T15:00:00.000Z') } });
      expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({ type: 'CARD_UPDATED', message: 'fijó el inicio para el 20 de agosto de 2026' }));
    });

    it('null la quita; la misma fecha no escribe ni anota nada', async () => {
      prisma.card.findUnique.mockResolvedValue(cardRow({ startDate: new Date('2026-08-20T15:00:00.000Z') }));
      await service.updateStartDate('a', '2026-08-20', ACTOR);
      expect(prisma.card.update).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();

      await service.updateStartDate('a', null, ACTOR);
      expect(prisma.card.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { startDate: null } });
      expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({ message: 'quitó la fecha de inicio' }));
    });

    it('rechaza formatos inválidos y fechas que no existen', async () => {
      await expect(service.updateStartDate('a', '20/08/2026', ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.updateStartDate('a', '2026-02-31', ACTOR)).rejects.toThrow('startDate no es una fecha válida');
    });

    it('un contenedor no tiene inicio propio', async () => {
      prisma.card.findUnique.mockResolvedValue(cardRow({ _count: { children: 2 } }));
      await expect(service.updateStartDate('a', '2026-08-20', ACTOR)).rejects.toThrow('no tiene fecha de inicio propia');
    });
  });

  describe('addLabel', () => {
    it('crea la etiqueta en el proyecto con el tono que toca y la agrega a la tarjeta', async () => {
      prisma.label.count.mockResolvedValue(1); // ya hay una: esta es la segunda → NEUTRAL

      const label = await service.addLabel('a', '  Diseño   web ', ACTOR);

      expect(label).toEqual({ id: 'l-new', name: 'Diseño web', tone: 'NEUTRAL' });
      expect(prisma.label.create).toHaveBeenCalledWith(expect.objectContaining({ data: { projectId: PROJECT_ID, name: 'Diseño web', tone: 'NEUTRAL' } }));
      expect(prisma.cardLabel.create).toHaveBeenCalledWith({ data: { cardId: 'a', labelId: 'l-new' } });
      expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({ message: 'agregó la etiqueta "Diseño web"' }));
    });

    it('reutiliza la del proyecto sin distinguir mayúsculas', async () => {
      prisma.label.findFirst.mockResolvedValue({ id: 'l1', name: 'Diseño', tone: 'ACCENT' });

      const label = await service.addLabel('a', 'diseño', ACTOR);

      expect(label).toEqual({ id: 'l1', name: 'Diseño', tone: 'ACCENT' });
      expect(prisma.label.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: PROJECT_ID, name: { equals: 'diseño', mode: 'insensitive' } } }),
      );
      expect(prisma.label.create).not.toHaveBeenCalled();
      expect(prisma.cardLabel.create).toHaveBeenCalledWith({ data: { cardId: 'a', labelId: 'l1' } });
    });

    it('si la tarjeta ya la tiene no la duplica ni anota nada', async () => {
      prisma.label.findFirst.mockResolvedValue({ id: 'l1', name: 'Diseño', tone: 'ACCENT' });
      prisma.cardLabel.findUnique.mockResolvedValue({ cardId: 'a', labelId: 'l1' });

      await service.addLabel('a', 'Diseño', ACTOR);

      expect(prisma.cardLabel.create).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('rechaza un nombre vacío o de más de 30 caracteres', async () => {
      await expect(service.addLabel('a', '   ', ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.addLabel('a', undefined, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.addLabel('a', 'x'.repeat(31), ACTOR)).rejects.toThrow('hasta 30 caracteres');
    });
  });

  describe('removeLabel', () => {
    it('la quita de la tarjeta (la etiqueta sigue en el proyecto) y lo anota', async () => {
      prisma.label.findUnique.mockResolvedValue({ name: 'Diseño', projectId: PROJECT_ID });

      await service.removeLabel('a', 'l1', ACTOR);

      expect(prisma.cardLabel.deleteMany).toHaveBeenCalledWith({ where: { cardId: 'a', labelId: 'l1' } });
      expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({ message: 'quitó la etiqueta "Diseño"' }));
    });

    it('una etiqueta de otro proyecto da 404', async () => {
      prisma.label.findUnique.mockResolvedValue({ name: 'Ajena', projectId: 'otro' });
      await expect(service.removeLabel('a', 'l9', ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.cardLabel.deleteMany).not.toHaveBeenCalled();
    });

    it('si la tarjeta no la tenía, no anota nada', async () => {
      prisma.label.findUnique.mockResolvedValue({ name: 'Diseño', projectId: PROJECT_ID });
      prisma.cardLabel.deleteMany.mockResolvedValue({ count: 0 });

      await service.removeLabel('a', 'l1', ACTOR);

      expect(activityLog.log).not.toHaveBeenCalled();
    });
  });
});
