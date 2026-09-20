import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Avatar } from '../../components/Avatar';
import { Label } from '../../components/ui';
import { ApiError } from '../../lib/apiClient';
import { formatFullDate, formatRelativeTime } from '../../lib/formatRelativeTime';
import { Comment, MAX_COMMENT_LENGTH, useAddComment, useComments, useDeleteComment, useEditComment } from './useBoard';

const TEXTAREA = {
  fontFamily: 'var(--sans)',
  fontSize: 13.5,
  lineHeight: 1.45,
  padding: '9px 11px',
  border: '1px solid var(--line-strong)',
  borderRadius: 'var(--radius)',
  background: 'var(--field)',
  resize: 'vertical' as const,
  width: '100%',
  boxSizing: 'border-box' as const,
};

/// Comentarios de la tarjeta, en su propio recuadro al pie del modal (README §6):
/// lista con avatar, nombre, cuándo y el texto; el compositor abajo. Editar y
/// eliminar solo lo propio — lo decide el servidor (`mine`), no este componente.
export function CommentsSection({ cardId }: { cardId: string }) {
  const { data: comments, isLoading, isError } = useComments(cardId);
  const add = useAddComment(cardId);
  const edit = useEditComment(cardId);
  const remove = useDeleteComment(cardId);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const error = [add, edit, remove].find((m) => m.isError)?.error;

  function send() {
    const text = draft.trim();
    if (!text || add.isPending) return;
    add.mutate(text, { onSuccess: () => setDraft('') });
  }

  // Enter envía, Shift+Enter hace salto de línea (README §6).
  function draftKey(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  function saveEdit() {
    if (!editing) return;
    const text = editing.text.trim();
    if (!text) return;
    edit.mutate({ commentId: editing.id, text }, { onSuccess: () => setEditing(null) });
  }

  function editKey(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      saveEdit();
    } else if (event.key === 'Escape') {
      event.stopPropagation(); // Escape cancela la edición, no cierra el modal
      setEditing(null);
    }
  }

  function handleDelete(comment: Comment) {
    // Dos pasos, como todo lo destructivo: el primer clic pide confirmación.
    if (confirming !== comment.id) return setConfirming(comment.id);
    setConfirming(null);
    remove.mutate(comment.id);
  }

  const count = comments?.length ?? 0;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', background: 'var(--card)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px 0' }}>
        <Label track="0.13em">Comentarios</Label>
        <span aria-label={`${count} comentarios`} style={{ minWidth: 20, padding: '1px 7px', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: 'var(--cream)', background: 'var(--ink)', borderRadius: 'var(--radius-pill)' }}>
          {count}
        </span>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '14px 18px 18px' }}>
        {isLoading && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Cargando…</span>}
        {isError && <span style={{ fontSize: 13, color: 'var(--accent-ink)' }}>No se pudieron cargar los comentarios.</span>}
        {!isLoading && !isError && count === 0 && <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>Todavía no hay comentarios.</span>}

        {count > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {comments!.map((comment) => (
              <li key={comment.id} data-comment-id={comment.id} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', gap: 12 }}>
                <Avatar seed={comment.author.id} name={comment.author.name} size={28} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 8px' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{comment.author.name}</span>
                    <span title={formatFullDate(comment.createdAt)} style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                      {formatRelativeTime(comment.createdAt)}
                    </span>
                    {comment.editedAt && (
                      <span title={`Editado ${formatRelativeTime(comment.editedAt)}`} style={{ fontSize: 12, color: 'var(--ink-4)' }}>
                        · editado
                      </span>
                    )}
                    {comment.mine && editing?.id !== comment.id && (
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
                        <button type="button" onClick={() => setEditing({ id: comment.id, text: comment.text })} style={linkButton}>
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(comment)}
                          onMouseLeave={() => confirming === comment.id && setConfirming(null)}
                          title={confirming === comment.id ? 'Se borra el comentario. No se puede deshacer.' : undefined}
                          style={confirming === comment.id ? { ...linkButton, color: 'var(--cream)', background: 'var(--accent)', borderRadius: 'var(--radius)', padding: '2px 8px', textDecoration: 'none', fontWeight: 600 } : linkButton}
                        >
                          {confirming === comment.id ? 'Confirmar' : 'Eliminar'}
                        </button>
                      </span>
                    )}
                  </div>

                  {editing?.id === comment.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        autoFocus
                        value={editing.text}
                        onChange={(e) => setEditing({ id: comment.id, text: e.target.value })}
                        onKeyDown={editKey}
                        maxLength={MAX_COMMENT_LENGTH}
                        rows={3}
                        aria-label="Editar comentario"
                        style={TEXTAREA}
                      />
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <button type="button" onClick={saveEdit} disabled={!editing.text.trim() || edit.isPending} style={primaryButton(!!editing.text.trim())}>
                          {edit.isPending ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button type="button" onClick={() => setEditing(null)} style={linkButton}>
                          Cancelar
                        </button>
                        <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>Enter guarda · Esc cancela</span>
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{comment.text}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: count > 0 ? 14 : 0, borderTop: count > 0 ? '1px solid var(--line-soft)' : undefined }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={draftKey}
            maxLength={MAX_COMMENT_LENGTH}
            rows={3}
            placeholder="Escribí un comentario…"
            aria-label="Nuevo comentario"
            style={TEXTAREA}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>Enter para enviar · Shift+Enter salto de línea</span>
            <button type="button" onClick={send} disabled={!draft.trim() || add.isPending} style={{ ...primaryButton(!!draft.trim()), marginLeft: 'auto' }}>
              {add.isPending ? 'Enviando…' : 'Comentar'}
            </button>
          </div>
        </div>

        {error && <span style={{ fontSize: 13, color: 'var(--accent-ink)' }}>{error instanceof ApiError ? error.message : 'No se pudo completar la acción.'}</span>}
      </div>
    </section>
  );
}

const linkButton = {
  fontFamily: 'var(--sans)',
  fontSize: 12.5,
  color: 'var(--ink-3)',
  background: 'transparent',
  border: 0,
  padding: 0,
  cursor: 'pointer',
  textDecoration: 'underline',
} as const;

// Primario apagado si no hay texto (README: fondo --line-x-soft, texto --ink-3).
const primaryButton = (enabled: boolean) =>
  ({
    fontFamily: 'var(--sans)',
    fontSize: 13,
    fontWeight: 600,
    padding: '7px 14px',
    borderRadius: 'var(--radius)',
    cursor: enabled ? 'pointer' : 'default',
    color: enabled ? 'var(--cream)' : 'var(--ink-3)',
    background: enabled ? 'var(--ink)' : 'var(--line-x-soft)',
    border: `1px solid ${enabled ? 'var(--ink)' : 'var(--line-x-soft)'}`,
  }) as const;
