import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { ApiError } from '../../lib/apiClient';
import { formatFileSize } from '../../lib/formatFileSize';
import { Panel, SmallButton } from './detailUi';
import { AttachmentIcon } from './icons';
import { Attachment, downloadAttachment, MAX_ATTACHMENT_BYTES, useAttachments, useDeleteAttachment, useUploadAttachment } from './useBoard';

interface Pending {
  key: number;
  name: string;
  size: number;
  /// null = subiendo; texto = por qué falló.
  error: string | null;
}

/// Adjuntos de la tarjeta (Yunta-Tarjeta-Detalle): contador y "Añadir" en el
/// encabezado, filas con clip / nombre / peso / ×; se puede soltar archivos en el bloque. Sin previsualización. Ver y
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
  const total = count + pending.length;
  const row = { display: 'grid', gridTemplateColumns: '20px minmax(0,1fr) auto auto', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: '1px solid var(--line-soft)' } as const;
  const removeX = { fontFamily: 'var(--sans)', fontSize: 14, lineHeight: 1, color: 'var(--ink-4)', background: 'transparent', border: 0, padding: '2px 4px', cursor: 'pointer' } as const;

  // Todo el bloque recibe archivos arrastrados (además del botón "Añadir").
  const dropProps = readOnly
    ? {}
    : {
        onDragOver: (event: DragEvent) => {
          if (!isFileDrag(event)) return;
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: (event: DragEvent) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        },
        onDrop: (event: DragEvent) => {
          if (!isFileDrag(event)) return;
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        },
      };

  return (
    <div data-dropzone {...dropProps} style={{ borderRadius: 'var(--radius-card)', outline: dragging ? '2px dashed var(--accent)' : 'none', outlineOffset: 2 }}>
      <Panel
        title="Adjuntos"
        data-panel="adjuntos"
        extra={
          <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>
            {count} {count === 1 ? 'archivo' : 'archivos'}
          </span>
        }
        action={!readOnly && <SmallButton onClick={() => picker.current?.click()}>Añadir</SmallButton>}
      >
        {isLoading && <p style={{ margin: 0, padding: '15px 18px', fontSize: 13.5, color: 'var(--ink-3)' }}>Cargando…</p>}
        {isError && <p style={{ margin: 0, padding: '15px 18px', fontSize: 13.5, color: 'var(--accent-ink)' }}>No se pudieron cargar los adjuntos.</p>}

        {attachments?.map((attachment) => (
          <div key={attachment.id} style={row}>
            <span style={{ color: 'var(--ink-3)', display: 'flex' }}>
              <AttachmentIcon size={16} />
            </span>
            <button
              type="button"
              onClick={() => handleDownload(attachment)}
              title={`Descargar ${attachment.fileName}`}
              aria-label={`Descargar ${attachment.fileName}`}
              style={{ minWidth: 0, textAlign: 'left', padding: 0, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {attachment.fileName}
            </button>
            <span style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{formatFileSize(attachment.size)}</span>
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
                    : removeX
                }
              >
                {confirming === attachment.id ? 'Confirmar' : '×'}
              </button>
            )}
          </div>
        ))}

        {pending.map((p) => (
          <div key={p.key} style={row}>
            <span style={{ color: 'var(--ink-4)', display: 'flex' }}>
              <AttachmentIcon size={16} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 14, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              {p.error && <span style={{ fontSize: 12, color: 'var(--accent-ink)' }}>{p.error}</span>}
            </span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{p.error ? formatFileSize(p.size) : 'Subiendo…'}</span>
            {p.error ? (
              <button type="button" onClick={() => setPending((c) => c.filter((r) => r.key !== p.key))} title="Descartar" aria-label={`Descartar ${p.name}`} style={removeX}>
                ×
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}

        {!isLoading && !isError && total === 0 && (
          <p style={{ margin: 0, padding: '15px 18px', fontSize: 13.5, color: dragging ? 'var(--accent-ink)' : 'var(--ink-3)' }}>
            {dragging ? 'Soltá para adjuntar.' : readOnly ? 'Sin adjuntos.' : `Sin adjuntos. Podés arrastrar archivos acá (máx. ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB cada uno).`}
          </p>
        )}
        {total > 0 && dragging && <p style={{ margin: 0, padding: '11px 18px', fontSize: 13, color: 'var(--accent-ink)' }}>Soltá para adjuntar.</p>}
        {actionError && <p style={{ margin: 0, padding: '11px 18px', fontSize: 13, color: 'var(--accent-ink)' }}>{actionError}</p>}

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
      </Panel>
    </div>
  );
}
