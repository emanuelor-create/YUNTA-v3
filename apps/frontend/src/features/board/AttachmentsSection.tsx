import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Label } from '../../components/ui';
import { ApiError } from '../../lib/apiClient';
import { formatFileSize } from '../../lib/formatFileSize';
import { AttachmentIcon } from './icons';
import { Attachment, downloadAttachment, MAX_ATTACHMENT_BYTES, useAttachments, useDeleteAttachment, useUploadAttachment } from './useBoard';

interface Pending {
  key: number;
  name: string;
  size: number;
  /// null = subiendo; texto = por qué falló.
  error: string | null;
}

/// Adjuntos de la tarjeta, en su propio recuadro (README §6, sector 4): contador
/// en el header, filas con clip / nombre / peso / ×. Sin previsualización. Ver y
/// descargar lo puede cualquier miembro; subir y borrar, solo quien puede editar.
export function AttachmentsSection({ cardId, readOnly }: { cardId: string; readOnly: boolean }) {
  const { data: attachments, isLoading, isError } = useAttachments(cardId);
  const upload = useUploadAttachment(cardId);
  const remove = useDeleteAttachment(cardId);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const counter = useRef(0);

  async function handleFiles(list: FileList | File[]) {
    setActionError(null);
    const files = [...list];
    // Todos aparecen enseguida; se suben de a uno para no abrir N conexiones de 20 MB.
    const rows: Pending[] = files.map((file) => ({
      key: (counter.current += 1),
      name: file.name,
      size: file.size,
      error: file.size === 0 ? 'El archivo está vacío' : file.size > MAX_ATTACHMENT_BYTES ? `Supera el máximo de ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB` : null,
    }));
    setPending((current) => [...current, ...rows]);

    for (const [index, file] of files.entries()) {
      const row = rows[index];
      if (row.error) continue;
      try {
        await upload.mutateAsync(file);
        setPending((current) => current.filter((r) => r.key !== row.key));
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'No se pudo subir';
        setPending((current) => current.map((r) => (r.key === row.key ? { ...r, error: message } : r)));
      }
    }
  }

  const isFileDrag = (event: DragEvent) => [...event.dataTransfer.types].includes('Files');

  async function handleDownload(attachment: Attachment) {
    setActionError(null);
    try {
      await downloadAttachment(cardId, attachment);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'No se pudo descargar el archivo.');
    }
  }

  function handleDelete(attachment: Attachment) {
    // Dos pasos (README, interacciones): el primer clic pide confirmación.
    if (confirming !== attachment.id) return setConfirming(attachment.id);
    setConfirming(null);
    setActionError(null);
    remove.mutate(attachment.id, {
      onError: (error) => setActionError(error instanceof ApiError ? error.message : 'No se pudo eliminar el adjunto.'),
    });
  }

  const count = attachments?.length ?? 0;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', background: 'var(--card)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px 0' }}>
        <Label track="0.13em">Adjuntos</Label>
        <span
          aria-label={`${count} adjuntos`}
          style={{ minWidth: 20, padding: '1px 7px', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: 'var(--cream)', background: 'var(--ink)', borderRadius: 'var(--radius-pill)' }}
        >
          {count}
        </span>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 18px 18px' }}>
        {isLoading && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Cargando…</span>}
        {isError && <span style={{ fontSize: 13, color: 'var(--accent-ink)' }}>No se pudieron cargar los adjuntos.</span>}

        {(count > 0 || pending.length > 0) && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {attachments?.map((attachment, i) => (
              <li
                key={attachment.id}
                style={{ display: 'grid', gridTemplateColumns: '20px minmax(0,1fr) auto auto', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: i === 0 ? undefined : '1px solid var(--line-soft)' }}
              >
                <span style={{ color: 'var(--ink-3)', display: 'flex' }}><AttachmentIcon size={16} /></span>
                <button
                  type="button"
                  onClick={() => handleDownload(attachment)}
                  title={`Descargar ${attachment.fileName}`}
                  aria-label={`Descargar ${attachment.fileName}`}
                  style={{ minWidth: 0, textAlign: 'left', padding: 0, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {attachment.fileName}
                </button>
                <span style={{ fontSize: 12.5, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{formatFileSize(attachment.size)}</span>
                {readOnly ? (
                  <span />
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDelete(attachment)}
                    onMouseLeave={() => confirming === attachment.id && setConfirming(null)}
                    title={confirming === attachment.id ? 'Se borra el archivo. No se puede deshacer.' : 'Eliminar'}
                    aria-label={confirming === attachment.id ? `Confirmar eliminar ${attachment.fileName}` : `Eliminar ${attachment.fileName}`}
                    style={
                      confirming === attachment.id
                        ? { fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 600, padding: '3px 9px', color: 'var(--cream)', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', cursor: 'pointer' }
                        : { background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink-4)', fontSize: 16, padding: '0 6px' }
                    }
                  >
                    {confirming === attachment.id ? 'Confirmar' : '×'}
                  </button>
                )}
              </li>
            ))}

            {pending.map((row) => (
              <li
                key={row.key}
                style={{ display: 'grid', gridTemplateColumns: '20px minmax(0,1fr) auto auto', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--line-soft)' }}
              >
                <span style={{ color: 'var(--ink-4)', display: 'flex' }}><AttachmentIcon size={16} /></span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                  {row.error && <span style={{ fontSize: 12, color: 'var(--accent-ink)' }}>{row.error}</span>}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{row.error ? formatFileSize(row.size) : 'Subiendo…'}</span>
                {row.error ? (
                  <button type="button" onClick={() => setPending((c) => c.filter((r) => r.key !== row.key))} title="Descartar" aria-label={`Descartar ${row.name}`} style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink-4)', fontSize: 16, padding: '0 6px' }}>
                    ×
                  </button>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        )}

        {!readOnly && (
          <div
            data-dropzone
            onDragOver={(event) => {
              if (!isFileDrag(event)) return;
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(event) => {
              if (!isFileDrag(event)) return;
              event.preventDefault();
              setDragging(false);
              handleFiles(event.dataTransfer.files);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: 8,
              padding: '14px 12px',
              textAlign: 'center',
              fontSize: 13,
              color: dragging ? 'var(--accent-ink)' : 'var(--ink-3)',
              background: dragging ? 'var(--accent-soft)' : 'transparent',
              border: `1px dashed ${dragging ? 'var(--accent)' : 'var(--neutral)'}`,
              borderRadius: 'var(--radius)',
            }}
          >
            <span>{dragging ? 'Soltá para adjuntar' : count === 0 && pending.length === 0 ? 'Sin adjuntos. Arrastrá archivos acá o' : 'Arrastrá archivos acá o'}</span>
            {!dragging && (
              <button
                type="button"
                onClick={() => picker.current?.click()}
                style={{ fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', background: 'var(--field)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)', padding: '5px 10px', cursor: 'pointer' }}
              >
                Elegir archivos
              </button>
            )}
            {!dragging && <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>· máx. {MAX_ATTACHMENT_BYTES / 1024 / 1024} MB cada uno</span>}
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              aria-label="Elegir archivos para adjuntar"
              onChange={(event) => {
                if (event.target.files?.length) handleFiles(event.target.files);
                event.target.value = ''; // permite volver a elegir el mismo archivo
              }}
            />
          </div>
        )}

        {readOnly && count === 0 && !isLoading && <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>Sin adjuntos.</span>}
        {actionError && <span style={{ fontSize: 13, color: 'var(--accent-ink)' }}>{actionError}</span>}
      </div>
    </section>
  );
}
