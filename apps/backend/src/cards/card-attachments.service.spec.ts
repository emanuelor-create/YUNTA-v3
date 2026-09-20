import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ActivityLogService } from '../activity/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../supabase/supabase-storage.service';
import { CardAttachmentsService, decodeFileName, safeKeyName } from './card-attachments.service';

const ACTOR = 'actor-1';
const CARD = { id: 'card-1', title: 'Una tarjeta', column: { board: { projectId: 'proj-1' } } };

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'informe.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('contenido de prueba'),
    destination: '',
    filename: '',
    path: '',
    stream: undefined as any,
    ...overrides,
  };
}

describe('nombres de archivo', () => {
  it('safeKeyName deja solo ASCII seguro: sin acentos, ñ, espacios, ? # & ni barras', () => {
    expect(safeKeyName('informe.pdf')).toBe('informe.pdf');
    expect(safeKeyName('Presupuesto ñandú (v2) #final.pdf')).toBe('Presupuesto_nandu_v2_final.pdf');
    expect(safeKeyName('con espacios y acentos áéíóú.txt')).toBe('con_espacios_y_acentos_aeiou.txt');
    expect(safeKeyName('a?b&c=d.txt')).toBe('a_b_c_d.txt');
    expect(safeKeyName('../../etc/passwd')).toBe('passwd');
    expect(safeKeyName('carpeta/archivo.txt')).toBe('archivo.txt');
    expect(safeKeyName('C:\\Users\\yo\\informe final.pdf')).toBe('informe_final.pdf');
  });

  it('safeKeyName conserva la extensión, acota el largo y nunca devuelve vacío', () => {
    expect(safeKeyName(`${'x'.repeat(200)}.pdf`)).toBe(`${'x'.repeat(80)}.pdf`);
    expect(safeKeyName('日本語.pdf')).toBe('archivo.pdf');
    expect(safeKeyName('???')).toBe('archivo');
    expect(safeKeyName('.env')).toBe('env');
    expect(safeKeyName('sin-extension')).toBe('sin-extension');
    expect(safeKeyName('archivo.tar.gz')).toBe('archivo.tar.gz');
  });

  it('decodeFileName arregla el latin1 de multer ("Ã±" → "ñ") y no rompe lo que ya venía bien', () => {
    const mojibake = Buffer.from('Presupuesto ñandú.pdf', 'utf8').toString('latin1');
    expect(mojibake).not.toBe('Presupuesto ñandú.pdf');
    expect(decodeFileName(mojibake)).toBe('Presupuesto ñandú.pdf');
    expect(decodeFileName('informe.pdf')).toBe('informe.pdf');
    expect(decodeFileName('Presupuesto ñandú.pdf')).toBe('Presupuesto ñandú.pdf'); // ya era UTF-8 válido
  });
});

describe('CardAttachmentsService', () => {
  let prisma: {
    card: { findUnique: jest.Mock };
    cardAttachment: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; delete: jest.Mock };
  };
  let storage: { upload: jest.Mock; createSignedUrl: jest.Mock; remove: jest.Mock };
  let activityLog: { log: jest.Mock };
  let service: CardAttachmentsService;

  beforeEach(() => {
    prisma = {
      card: { findUnique: jest.fn().mockResolvedValue(CARD) },
      cardAttachment: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    };
    storage = { upload: jest.fn(), createSignedUrl: jest.fn(), remove: jest.fn().mockResolvedValue(undefined) };
    activityLog = { log: jest.fn() };
    service = new CardAttachmentsService(
      prisma as unknown as PrismaService,
      storage as unknown as SupabaseStorageService,
      activityLog as unknown as ActivityLogService,
    );
  });

  describe('upload', () => {
    beforeEach(() => {
      prisma.cardAttachment.create.mockImplementation(async ({ data }) => ({ id: 'att-1', createdAt: new Date('2026-09-20'), ...data }));
    });

    it('sube a Storage y crea la fila con nombre original, tamaño y ruta', async () => {
      const file = makeFile();
      await service.upload('card-1', file, ACTOR);

      expect(storage.upload).toHaveBeenCalledWith(expect.stringMatching(/^card-1\/.+-informe\.pdf$/), file.buffer, 'application/pdf');
      expect(prisma.cardAttachment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          cardId: 'card-1',
          fileName: 'informe.pdf',
          size: 1024,
          storagePath: expect.stringMatching(/^card-1\/.+-informe\.pdf$/),
        }),
      });
    });

    it('un nombre con ñ, acentos y espacios: la clave de Storage es ASCII y el nombre visible es el verdadero', async () => {
      // Lo que llega de multer: UTF-8 leído como latin1.
      const raw = Buffer.from('Presupuesto ñandú (v2).pdf', 'utf8').toString('latin1');
      const view = await service.upload('card-1', makeFile({ originalname: raw }), ACTOR);

      const key = storage.upload.mock.calls[0][0] as string;
      expect(key).toMatch(/^card-1\/[0-9a-f-]{36}-Presupuesto_nandu_v2\.pdf$/);
      expect(key).toMatch(/^[A-Za-z0-9/._-]+$/); // nada que Supabase rechace ni que cambie la URL
      expect(view.fileName).toBe('Presupuesto ñandú (v2).pdf');
    });

    it('no expone storagePath al cliente', async () => {
      const view = await service.upload('card-1', makeFile(), ACTOR);
      expect(Object.keys(view).sort()).toEqual(['createdAt', 'fileName', 'id', 'size']);
    });

    it('registra quién adjuntó qué en la actividad del proyecto', async () => {
      await service.upload('card-1', makeFile(), ACTOR);
      expect(activityLog.log).toHaveBeenCalledWith({
        projectId: 'proj-1',
        userId: ACTOR,
        type: 'CARD_UPDATED',
        message: 'adjuntó "informe.pdf"',
        cardId: 'card-1',
        cardTitle: 'Una tarjeta',
      });
    });

    it('rechaza archivos que superan el máximo o vacíos, sin llegar a subir nada', async () => {
      await expect(service.upload('card-1', makeFile({ size: 21 * 1024 * 1024 }), ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.upload('card-1', makeFile({ size: 0 }), ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('tira 404 si la tarjeta no existe', async () => {
      prisma.card.findUnique.mockResolvedValue(null);
      await expect(service.upload('nope', makeFile(), ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('si Storage falla no se crea la fila ni queda actividad', async () => {
      storage.upload.mockRejectedValue(new Error('storage caído'));
      await expect(service.upload('card-1', makeFile(), ACTOR)).rejects.toThrow('storage caído');
      expect(prisma.cardAttachment.create).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('si falla el alta en la base después de subir, borra el archivo para no dejarlo huérfano', async () => {
      prisma.cardAttachment.create.mockRejectedValue(new Error('base caída'));
      await expect(service.upload('card-1', makeFile(), ACTOR)).rejects.toThrow('base caída');
      expect(storage.remove).toHaveBeenCalledWith(storage.upload.mock.calls[0][0]);
      expect(activityLog.log).not.toHaveBeenCalled();
    });
  });

  describe('getDownloadUrl', () => {
    it('pide una URL firmada nueva por la storagePath del adjunto, con el nombre original para guardar', async () => {
      prisma.cardAttachment.findUnique.mockResolvedValue({ id: 'att-1', cardId: 'card-1', storagePath: 'card-1/x-informe.pdf', fileName: 'Informe ñandú.pdf' });
      storage.createSignedUrl.mockResolvedValue('https://signed.example/x');

      const url = await service.getDownloadUrl('card-1', 'att-1');

      expect(storage.createSignedUrl).toHaveBeenCalledWith('card-1/x-informe.pdf', 'Informe ñandú.pdf');
      expect(url).toBe('https://signed.example/x');
    });

    it('tira 404 si el adjunto no pertenece a esa tarjeta', async () => {
      prisma.cardAttachment.findUnique.mockResolvedValue({ id: 'att-1', cardId: 'otra-card', storagePath: 'x' });
      await expect(service.getDownloadUrl('card-1', 'att-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('tira 404 si el adjunto no existe', async () => {
      prisma.cardAttachment.findUnique.mockResolvedValue(null);
      await expect(service.getDownloadUrl('card-1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    const attachment = { id: 'att-1', cardId: 'card-1', storagePath: 'card-1/x-informe.pdf', fileName: 'informe.pdf' };

    it('borra primero de Storage y después la fila, y lo deja en la actividad', async () => {
      prisma.cardAttachment.findUnique.mockResolvedValue(attachment);

      await service.remove('card-1', 'att-1', ACTOR);

      expect(storage.remove).toHaveBeenCalledWith('card-1/x-informe.pdf');
      expect(prisma.cardAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
      expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({ type: 'CARD_UPDATED', message: 'eliminó el adjunto "informe.pdf"' }));
    });

    it('si falla el borrado en Storage, no borra la fila (evita quedar sin referencia)', async () => {
      prisma.cardAttachment.findUnique.mockResolvedValue(attachment);
      storage.remove.mockRejectedValue(new Error('storage down'));

      await expect(service.remove('card-1', 'att-1', ACTOR)).rejects.toThrow('storage down');
      expect(prisma.cardAttachment.delete).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('devuelve los adjuntos de la tarjeta ordenados por fecha, sin la ruta interna', async () => {
      prisma.cardAttachment.findMany.mockResolvedValue([
        { id: 'att-1', cardId: 'card-1', fileName: 'a.pdf', size: 10, storagePath: 'card-1/secreto-a.pdf', createdAt: new Date('2026-09-20') },
      ]);

      const result = await service.list('card-1');

      expect(prisma.cardAttachment.findMany).toHaveBeenCalledWith({ where: { cardId: 'card-1' }, orderBy: { createdAt: 'asc' } });
      expect(result).toEqual([{ id: 'att-1', fileName: 'a.pdf', size: 10, createdAt: new Date('2026-09-20') }]);
    });
  });
});
