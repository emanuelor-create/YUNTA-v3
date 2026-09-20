import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CardAttachment } from '@prisma/client';
import { ActivityLogService } from '../activity/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../supabase/supabase-storage.service';

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB — no está en el documento, es un límite razonable propio.
const MAX_KEY_NAME_LENGTH = 80;

/// Lo que ve el cliente. `storagePath` es interno (schema: "nunca se expone
/// directo, las descargas van por URL firmada de corta duración").
export interface AttachmentView {
  id: string;
  fileName: string;
  size: number;
  createdAt: Date;
}

const toView = (a: CardAttachment): AttachmentView => ({ id: a.id, fileName: a.fileName, size: a.size, createdAt: a.createdAt });

/// multer decodifica los nombres de archivo como latin1: "ñandú.pdf" llega como
/// "Ã±andÃº.pdf". Si al reinterpretarlo como UTF-8 queda un nombre válido, ese es
/// el verdadero; si no (ya venía bien, o no era UTF-8), se deja como llegó.
export function decodeFileName(raw: string): string {
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  // U+FFFD (carácter de reemplazo): los bytes no eran UTF-8, el nombre ya venía bien.
  return decoded.includes('�') ? raw : decoded;
}

/// Clave de Storage: solo ASCII seguro. Supabase rechaza con InvalidKey los
/// nombres con ñ, acentos o espacios, y un "?" o "#" en la ruta se interpreta
/// como query/fragmento y el archivo se guarda bajo otra clave. El nombre que ve
/// la persona vive aparte, en `fileName`.
export function safeKeyName(rawName: string): string {
  // Solo el nombre: una ruta ("../../x", "carpeta/y") no tiene sentido como clave.
  const fileName = rawName.split(/[\\/]/).pop() ?? '';
  const dot = fileName.lastIndexOf('.');
  const hasExt = dot > 0 && dot < fileName.length - 1;
  const clean = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // marcas de acento que deja normalize('NFD')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^[._-]+|[._-]+$/g, '');
  const ext = hasExt ? clean(fileName.slice(dot + 1)).slice(0, 12) : '';
  const base = clean(hasExt ? fileName.slice(0, dot) : fileName).slice(0, MAX_KEY_NAME_LENGTH) || 'archivo';
  return ext ? `${base}.${ext}` : base;
}

@Injectable()
export class CardAttachmentsService {
  private readonly logger = new Logger(CardAttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async list(cardId: string): Promise<AttachmentView[]> {
    await this.getCardOrThrow(cardId);
    const rows = await this.prisma.cardAttachment.findMany({ where: { cardId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toView);
  }

  /// Sube a Storage primero: si falla, no queda una fila en la base
  /// apuntando a un archivo que no existe. Y si la fila falla después de subir,
  /// se intenta borrar el archivo para no dejarlo huérfano.
  async upload(cardId: string, file: Express.Multer.File, actorId: string): Promise<AttachmentView> {
    const card = await this.getCardOrThrow(cardId);
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException(`El archivo supera el máximo de ${MAX_SIZE_BYTES / 1024 / 1024}MB`);
    }
    if (file.size === 0) {
      throw new BadRequestException('El archivo está vacío');
    }

    const fileName = decodeFileName(file.originalname);
    const storagePath = `${cardId}/${randomUUID()}-${safeKeyName(fileName)}`;
    await this.storage.upload(storagePath, file.buffer, file.mimetype);

    let attachment: CardAttachment;
    try {
      attachment = await this.prisma.cardAttachment.create({
        data: { cardId, fileName, size: file.size, storagePath },
      });
    } catch (error) {
      await this.storage.remove(storagePath).catch((cleanupError) => {
        this.logger.warn(`Archivo huérfano en Storage tras fallar el alta: ${storagePath} (${String(cleanupError)})`);
      });
      throw error;
    }

    await this.activityLog.log({
      projectId: card.column.board.projectId,
      userId: actorId,
      type: 'CARD_UPDATED',
      message: `adjuntó "${fileName}"`,
      cardId: card.id,
      cardTitle: card.title,
    });
    return toView(attachment);
  }

  /// URL firmada de corta duración — se genera en el momento, nunca se
  /// persiste (ARCHITECTURE.md §8). Con el nombre original para que el
  /// navegador guarde "ñandú.pdf" y no la clave interna.
  async getDownloadUrl(cardId: string, attachmentId: string): Promise<string> {
    const attachment = await this.getAttachmentOrThrow(cardId, attachmentId);
    return this.storage.createSignedUrl(attachment.storagePath, attachment.fileName);
  }

  async remove(cardId: string, attachmentId: string, actorId: string): Promise<void> {
    const card = await this.getCardOrThrow(cardId);
    const attachment = await this.getAttachmentOrThrow(cardId, attachmentId);
    await this.storage.remove(attachment.storagePath);
    await this.prisma.cardAttachment.delete({ where: { id: attachment.id } });

    await this.activityLog.log({
      projectId: card.column.board.projectId,
      userId: actorId,
      type: 'CARD_UPDATED',
      message: `eliminó el adjunto "${attachment.fileName}"`,
      cardId: card.id,
      cardTitle: card.title,
    });
  }

  private async getCardOrThrow(cardId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: { column: { include: { board: true } } },
    });
    if (!card) {
      throw new NotFoundException(`Card ${cardId} no encontrada`);
    }
    return card;
  }

  private async getAttachmentOrThrow(cardId: string, attachmentId: string): Promise<CardAttachment> {
    const attachment = await this.prisma.cardAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.cardId !== cardId) {
      throw new NotFoundException(`Attachment ${attachmentId} no encontrado en esta tarjeta`);
    }
    return attachment;
  }
}
