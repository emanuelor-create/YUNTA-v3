import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Avatar } from '../../components/Avatar';
import { ApiError } from '../../lib/apiClient';
import { formatFullDate } from '../../lib/formatRelativeTime';
import { SectionTitle } from './detailUi';
import { Comment, MAX_COMMENT_LENGTH, useAddComment, useComments, useDeleteComment, useEditComment } from './useBoard';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/// "24 ago, 13:46" (el formato del diseño).
function when(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const TEXTAREA = {
  fontFamily: 'var(--sans)',
  fontSize: 14,
  lineHeight: 1.55,
  color: 'var(--ink)',
  background: 'var(--field)',
  border: '1px solid var(--line-strong)',
  padding: '11px 12px',
  width: '100%',
  boxSizing: 'border-box' as const,
  resize: 'vertical' as const,
  borderRadius: 'var(--radius)',
};

/// Panel de comentarios, a la derecha del detalle (Yunta-Tarjeta-Detalle):
/// encabezado con contador, el cuadro para escribir arriba y cada comentario en
/// su tarjeta. "Responder" arranca un comentario mencionando a quien escribió;
/// editar y eliminar, solo lo propio (lo decide el servidor con `mine`).
export function CommentsSection({ cardId }: { cardId: string }) {
  const { data: comments, isLoading, isError } = useComments(cardId);
  const add = useAddComment(cardId);
  const edit = useEditComment(cardId);
  const remove = useDeleteComment(cardId);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const error = [add, edit, remove].find((m) => m.isError)?.error;
  const canPost = draft.trim().length > 0 && !add.isPending;

  function send() {
    const text = draft.trim();
    if (!text || add.isPending) return;
    add.mutate(text, { onSuccess: () => setDraft('') });
  }

  // Enter envía, Shift+Enter hace salto de línea.
  function draftKey(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  function reply(comment: Comment) {
    const mention = `@${comment.author.name.split(' ')[0]} `;
    setDraft((current) => (current.startsWith(mention) ? current : mention + current));
    requestAnimationFrame(() => {
      const el = composer.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
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
    <div data-comments style={{ minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--neutral-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 15px', borderBottom: '1px solid var(--line-strong)' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" strokeWidth="1.8">
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        <SectionTitle color="var(--ink-2)">Comentarios</SectionTitle>
        <span
          aria-label={`${count} comentarios`}
          style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--cream)', background: 'var(--ink)', padding: '2px 7px', borderRadius: 'var(--radius-tick)' }}
        >
          {count}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '16px 20px', borderBottom: '1px solid var(--line-strong)' }}>
        <textarea
          ref={composer}
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={draftKey}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder="Escribir un comentario…"
          aria-label="Nuevo comentario"
          style={TEXTAREA}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Enter para enviar · Shift+Enter salto de línea</span>
          <button
            type="button"
            onClick={send}
            disabled={!canPost}
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 13.5,
              fontWeight: 600,
              color: canPost ? 'var(--cream)' : 'var(--ink-3)',
              background: canPost ? 'var(--ink)' : 'var(--line-x-soft)',
              border: `1px solid ${canPost ? 'var(--ink)' : 'var(--line-x-soft)'}`,
              padding: '9px 18px',
              cursor: canPost ? 'pointer' : 'default',
              borderRadius: 'var(--radius)',
              flex: 'none',
            }}
          >
            {add.isPending ? 'Enviando…' : 'Comentar'}
          </button>
        </div>
        {error && <span style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>{error instanceof ApiError ? error.message : 'No se pudo completar la acción.'}</span>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isLoading && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Cargando…</span>}
        {isError && <span style={{ fontSize: 13, color: 'var(--accent-ink)' }}>No se pudieron cargar los comentarios.</span>}
        {!isLoading && !isError && count === 0 && (
          <div style={{ border: '1px dashed var(--neutral)', padding: 20, textAlign: 'center', borderRadius: 'var(--radius-card)' }}>
            <span style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>Sin comentarios todavía.</span>
          </div>
        )}

        {comments?.map((comment) => (
          <div
            key={comment.id}
            data-comment-id={comment.id}
            style={{ border: '1px solid var(--line-x-soft)', background: 'var(--card)', display: 'flex', flexDirection: 'column', borderRadius: 'var(--radius-card)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', borderBottom: '1px solid var(--line-soft)' }}>
              <Avatar seed={comment.author.id} name={comment.author.name} size={24} />
              <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.01em', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {comment.author.name}
              </span>
              <span title={formatFullDate(comment.createdAt)} style={{ fontSize: 11, color: 'var(--ink-3)', flex: 'none' }}>
                {when(comment.createdAt)}
                {comment.editedAt && ' · editado'}
              </span>
            </div>

            {editing?.id === comment.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 13px' }}>
                <textarea
                  autoFocus
                  value={editing.text}
                  onChange={(e) => setEditing({ id: comment.id, text: e.target.value })}
                  onKeyDown={editKey}
                  maxLength={MAX_COMMENT_LENGTH}
                  rows={3}
                  aria-label="Editar comentario"
                  style={{ ...TEXTAREA, fontSize: 13.5 }}
                />
                <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <button type="button" onClick={saveEdit} disabled={!editing.text.trim() || edit.isPending} style={{ ...action, color: 'var(--ink)', fontWeight: 600 }}>
                    {edit.isPending ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button type="button" onClick={() => setEditing(null)} style={action}>
                    Cancelar
                  </button>
                </span>
              </div>
            ) : (
              <>
                <p style={{ margin: 0, padding: '12px 13px', fontSize: 14, lineHeight: 1.55, color: 'var(--ink)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {comment.text}
                </p>
                <div style={{ display: 'flex', gap: 14, padding: '0 13px 11px' }}>
                  <ActionLink onClick={() => reply(comment)}>Responder</ActionLink>
                  {comment.mine && <ActionLink onClick={() => setEditing({ id: comment.id, text: comment.text })}>Editar</ActionLink>}
                  {comment.mine && (
                    <ActionLink danger confirming={confirming === comment.id} onClick={() => handleDelete(comment)} onLeave={() => confirming === comment.id && setConfirming(null)}>
                      {confirming === comment.id ? 'Confirmar: eliminar' : 'Eliminar'}
                    </ActionLink>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const action = {
  fontFamily: 'var(--sans)',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--ink-3)',
  background: 'transparent',
  border: 0,
  padding: 0,
  cursor: 'pointer',
} as const;

function ActionLink({
  children,
  onClick,
  onLeave,
  danger,
  confirming,
}: {
  children: string;
  onClick: () => void;
  onLeave?: () => void;
  danger?: boolean;
  confirming?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        onLeave?.();
      }}
      style={
        confirming
          ? { ...action, fontWeight: 600, color: 'var(--cream)', background: 'var(--accent)', padding: '2px 8px', borderRadius: 'var(--radius)' }
          : { ...action, color: hover ? (danger ? 'var(--accent)' : 'var(--ink)') : 'var(--ink-3)' }
      }
    >
      {children}
    </button>
  );
}
