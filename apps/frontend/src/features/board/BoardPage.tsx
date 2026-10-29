import { useEffect, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { ApiError } from '../../lib/apiClient';
import { formatShortDate } from '../../lib/formatRelativeTime';
import { ProjectShell } from '../projects/ProjectShell';
import { CardDetailModal } from './CardDetailModal';
import { columnDot, LabelPill, LABEL_TONE_STYLE } from './detailUi';
import { PRIORITY_LABEL } from './priority';
import { BoardCard, BoardColumn, BoardView, useAddColumn, useBoard, useCreateCard, useDeleteColumn, useMoveCard } from './useBoard';

const COLUMN_WIDTH = 300;

export function BoardPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = id!;
  return (
    <ProjectShell projectId={projectId} active="tablero">
      {() => <BoardBody projectId={projectId} />}
    </ProjectShell>
  );
}

function BoardBody({ projectId }: { projectId: string }) {
  const { data: board, isLoading, isError } = useBoard(projectId);
  const [params, setParams] = useSearchParams();
  const openCardId = params.get('card');

  if (isLoading) return <Message>Cargando el tablero…</Message>;
  if (isError || !board) return <Message>No se pudo cargar el tablero.</Message>;

  function setOpenCard(cardId: string | null) {
    const next = new URLSearchParams(params);
    if (cardId) next.set('card', cardId);
    else next.delete('card');
    setParams(next, { replace: false });
  }

  return (
    <>
      <Lanes
        board={board}
        projectId={projectId}
        openComposerFirst={params.get('nueva') === '1'}
        onComposerConsumed={() => {
          const next = new URLSearchParams(params);
          next.delete('nueva');
          setParams(next, { replace: true });
        }}
        onOpenCard={setOpenCard}
      />
      {openCardId && <CardDetailModal cardId={openCardId} onClose={() => setOpenCard(null)} onOpenCard={setOpenCard} />}
    </>
  );
}

function Message({ children }: { children: string }) {
  return <div style={{ padding: 56, textAlign: 'center', fontSize: 14, color: 'var(--ink-3)' }}>{children}</div>;
}

// ── Carriles ─────────────────────────────────────────────────────────────

interface DropTarget {
  columnId: string;
  /// Índice entre las OTRAS tarjetas de la columna (sin contar la que se arrastra).
  index: number;
}

function Lanes({
  board,
  projectId,
  openComposerFirst,
  onComposerConsumed,
  onOpenCard,
}: {
  board: BoardView;
  projectId: string;
  openComposerFirst: boolean;
  onComposerConsumed: () => void;
  onOpenCard: (cardId: string) => void;
}) {
  const move = useMoveCard(projectId);
  // `dragging` (estado) solo pinta la tarjeta semitransparente; la decisión de
  // aceptar o no el drop se toma con la ref, que se escribe en el mismo instante
  // del dragstart. Con el estado solo, un arrastre rápido soltaba antes del
  // re-render y la tarjeta no se movía.
  const draggingRef = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [composerColumn, setComposerColumn] = useState<string | null>(openComposerFirst ? (board.columns[0]?.id ?? null) : null);

  // "Nueva tarea" del encabezado abre el compositor de la primera columna.
  useEffect(() => {
    if (openComposerFirst) onComposerConsumed();
  }, [openComposerFirst, onComposerConsumed]);

  function drop(columnId: string, cardId: string | null, index: number) {
    draggingRef.current = null;
    setDragging(null);
    setDropTarget(null);
    if (!cardId) return;
    move.mutate({ cardId, columnId, position: index });
  }

  const open = board.columns.reduce((sum, column) => sum + column.cards.filter((card) => !card.completed).length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1, minHeight: 0, paddingTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', padding: '0 40px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>Tablero principal</h2>
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            {open} {open === 1 ? 'abierta' : 'abiertas'} · {board.columns.length} {board.columns.length === 1 ? 'columna' : 'columnas'}
          </span>
        </div>
        {board.canManage && <AddColumn boardId={board.boardId} />}
      </div>
      {move.isError && (
        <div style={{ margin: '0 40px', fontSize: 13, color: 'var(--accent-ink)' }}>
          {move.error instanceof ApiError ? move.error.message : 'No se pudo mover la tarjeta.'}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          padding: '0 40px 40px',
          overflowX: 'auto',
          flex: 1,
        }}
      >
        {board.columns.map((column, index) => (
          <Lane
            key={column.id}
            column={column}
            dot={columnDot(index, board.columns.length)}
            boardId={board.boardId}
            canEdit={board.canEdit}
            canManage={board.canManage && board.columns.length > 1}
            dragging={dragging}
            draggingRef={draggingRef}
            dropTarget={dropTarget?.columnId === column.id ? dropTarget : null}
            composerOpen={composerColumn === column.id}
            onOpenComposer={() => setComposerColumn(column.id)}
            onCloseComposer={() => setComposerColumn(null)}
            onDragStart={(cardId) => {
              draggingRef.current = cardId;
              // El re-render con la tarjeta semitransparente va después del
              // frame: si no, el navegador arma la imagen del arrastre ya apagada.
              setTimeout(() => setDragging(cardId), 0);
            }}
            onDragEnd={() => {
              draggingRef.current = null;
              setDragging(null);
              setDropTarget(null);
            }}
            onDropTarget={setDropTarget}
            onDrop={(cardId, index) => drop(column.id, cardId, index)}
            onOpenCard={onOpenCard}
          />
        ))}
      </div>
    </div>
  );
}

function Lane({
  column,
  dot,
  boardId,
  canEdit,
  canManage,
  dragging,
  draggingRef,
  dropTarget,
  composerOpen,
  onOpenComposer,
  onCloseComposer,
  onDragStart,
  onDragEnd,
  onDropTarget,
  onDrop,
  onOpenCard,
}: {
  column: BoardColumn;
  dot: string;
  boardId: string;
  canEdit: boolean;
  /// Puede borrar columnas (OWNER) y no es la única.
  canManage: boolean;
  dragging: string | null;
  draggingRef: { current: string | null };
  dropTarget: DropTarget | null;
  composerOpen: boolean;
  onOpenComposer: () => void;
  onCloseComposer: () => void;
  onDragStart: (cardId: string) => void;
  onDragEnd: () => void;
  onDropTarget: (target: DropTarget | null) => void;
  onDrop: (cardId: string | null, index: number) => void;
  onOpenCard: (cardId: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Dónde caería la tarjeta: cuántas de las otras tarjetas quedan por encima
  // del puntero, comparando con el punto medio de cada una. Se calcula del
  // evento mismo (no del estado) para que el drop use la posición real.
  function indexAt(clientY: number, draggedId: string | null): number {
    const tiles = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-card-id]') ?? [])].filter(
      (el) => el.dataset.cardId !== draggedId,
    );
    for (let i = 0; i < tiles.length; i += 1) {
      const rect = tiles[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return tiles.length;
  }

  function handleDragOver(event: DragEvent) {
    if (!draggingRef.current || !canEdit) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const index = indexAt(event.clientY, draggingRef.current);
    if (dropTarget?.index !== index || dropTarget.columnId !== column.id) onDropTarget({ columnId: column.id, index });
  }

  function handleDragLeave(event: DragEvent) {
    // Solo si el puntero salió de la columna, no al pasar por encima de una tarjeta.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDropTarget(null);
  }

  const over = !!dropTarget;
  let othersSeen = 0;

  return (
    <section
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => {
        if (!canEdit) return;
        event.preventDefault();
        const cardId = draggingRef.current ?? event.dataTransfer.getData('text/plain');
        onDrop(cardId, indexAt(event.clientY, cardId));
      }}
      data-column-id={column.id}
      style={{
        width: COLUMN_WIDTH,
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 14,
        border: `1px solid ${over ? 'var(--accent-line)' : 'var(--line)'}`,
        background: over ? 'var(--accent-soft)' : 'var(--neutral-soft)',
        borderRadius: 'var(--radius-card)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          title={column.isDone ? 'Última columna: las tarjetas que llegan acá cuentan como hechas' : undefined}
          style={{ width: 3, height: 16, flex: 'none', borderRadius: 3, background: dot }}
        />
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={column.name}>
          {column.name}
        </h2>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)' }}>{column.cards.length}</span>
        {canManage && <DeleteColumnButton boardId={boardId} column={column} />}
      </header>

      <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 24 }}>
        {column.cards.map((card) => {
          const isDragged = card.id === dragging;
          const showIndicatorBefore = !isDragged && dropTarget?.index === othersSeen;
          if (!isDragged) othersSeen += 1;
          return (
            <div key={card.id} style={{ display: 'contents' }}>
              {showIndicatorBefore && <DropLine />}
              <CardTile
                card={card}
                draggable={canEdit}
                dragged={isDragged}
                onDragStart={() => onDragStart(card.id)}
                onDragEnd={onDragEnd}
                onOpen={() => onOpenCard(card.id)}
              />
            </div>
          );
        })}
        {dropTarget && dropTarget.index >= othersSeen && <DropLine />}
        {/* No se desmonta al arrastrar por encima: es el elemento bajo el puntero, y si desaparece a mitad del arrastre el navegador se queda sin objetivo de drop. */}
        {column.cards.length === 0 && (
          <span style={{ fontSize: 12.5, color: 'var(--ink-4)', padding: '4px 2px', opacity: dropTarget ? 0.4 : 1 }}>Sin tarjetas</span>
        )}
      </div>

      {canEdit && (
        <AddCard boardId={boardId} columnId={column.id} open={composerOpen} onOpen={onOpenComposer} onClose={onCloseComposer} />
      )}
    </section>
  );
}

function DropLine() {
  return <div aria-hidden style={{ height: 3, borderRadius: 2, background: 'var(--accent)', margin: '-2px 0' }} />;
}

// ── Tarjeta ──────────────────────────────────────────────────────────────

const CLAMP_3 = {
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
} as const;

/// Tarjeta del tablero (vista Tablero de Yunta-Proyecto-Tabs): etiquetas arriba,
/// título, y abajo código · comentarios · fecha · personas. La prioridad Alta y
/// Media va como una etiqueta más, para que siga viéndose de un vistazo.
function CardTile({
  card,
  draggable,
  dragged,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  card: BoardCard;
  draggable: boolean;
  dragged: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const [hover, setHover] = useState(false);
  const container = card.subtasks !== null;
  const shown = card.assignees.slice(0, 3);
  const extra = card.assignees.length - shown.length;
  const due = dueText(card);
  const priorityPill = card.priority === 'ALTA' || card.priority === 'MEDIA';
  const hasTop = priorityPill || card.labels.length > 0 || container;

  return (
    <article
      data-card-id={card.id}
      draggable={draggable && !container}
      data-container={container ? '' : undefined}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', card.id);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '13px 14px',
        background: 'var(--card)',
        border: `1px solid ${hover ? 'var(--neutral)' : 'var(--line)'}`,
        borderRadius: 'var(--radius-card)',
        cursor: draggable && !container ? 'grab' : 'pointer',
        opacity: dragged ? 0.35 : 1,
      }}
    >
      {hasTop && (
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {priorityPill && (
            <span
              data-priority={card.priority}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 'var(--radius-pill)',
                ...(card.priority === 'ALTA'
                  ? { color: LABEL_TONE_STYLE.ACCENT.fg, background: LABEL_TONE_STYLE.ACCENT.bg, border: `1px solid ${LABEL_TONE_STYLE.ACCENT.bc}` }
                  : { color: 'var(--ink-2)', background: 'var(--field)', border: '1px solid var(--line-strong)' }),
              }}
            >
              {PRIORITY_LABEL[card.priority!]}
            </span>
          )}
          {card.labels.map((label) => (
            <LabelPill key={label.id} name={label.name} tone={label.tone} size="sm" />
          ))}
          {container && (
            <span
              data-container-summary
              style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--neutral-soft)', color: 'var(--ink-2)', border: '1px solid var(--line-x-soft)' }}
            >
              {card.subtasks!.total} subtareas · {card.subtasks!.done} {card.subtasks!.done === 1 ? 'hecha' : 'hechas'}
            </span>
          )}
        </span>
      )}

      <span
        title={card.title}
        style={{ ...CLAMP_3, fontSize: 14, fontWeight: 500, lineHeight: 1.4, color: card.completed ? 'var(--ink-3)' : 'var(--ink)', textDecoration: card.completed ? 'line-through' : 'none' }}
      >
        {card.title}
      </span>

      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 24 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--ink-4)', whiteSpace: 'nowrap' }} title={card.parentCode ? `Subtarea de ${card.parentCode}` : undefined}>
          {card.code}
          {card.parentCode && <span style={{ letterSpacing: 0, fontWeight: 500 }}> · de {card.parentCode}</span>}
        </span>
        {!container && (
          <span title={`${card.commentCount} ${card.commentCount === 1 ? 'comentario' : 'comentarios'}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-3)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 5h16v11H9l-5 4z" />
            </svg>
            {card.commentCount}
          </span>
        )}
        {!container && (
          <span
            title={card.dueDate ? `Vence el ${formatShortDate(card.dueDate)}` : 'Sin fecha de vencimiento'}
            style={{ fontSize: 12, fontWeight: 500, color: due.urgent ? 'var(--accent)' : 'var(--ink-3)', whiteSpace: 'nowrap' }}
          >
            {due.text}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {shown.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center' }} title={card.assignees.map((a) => a.name).join(', ')}>
            {shown.map((person, i) => (
              <span key={person.id} style={{ marginLeft: i === 0 ? 0 : -7, borderRadius: '50%', border: '2px solid var(--card)', display: 'flex' }}>
                <Avatar seed={person.id} name={person.name} size={24} />
              </span>
            ))}
            {extra > 0 && <span style={{ marginLeft: 4, fontSize: 11.5, color: 'var(--ink-3)' }}>+{extra}</span>}
          </span>
        )}
      </span>
    </article>
  );
}

/// Vencimiento como en el diseño: "hoy", "en 3 d", "atrasada 2 d", "cerrada" o "—".
/// Hoy y atrasada van en acento.
function dueText(card: BoardCard): { text: string; urgent: boolean } {
  if (card.completed) return { text: 'cerrada', urgent: false };
  if (!card.dueDate) return { text: '—', urgent: false };
  const due = new Date(card.dueDate);
  const today = new Date();
  const days = Math.round(
    (new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000,
  );
  if (days < 0) return { text: `atrasada ${-days} d`, urgent: true };
  if (days === 0) return { text: 'hoy', urgent: true };
  return { text: `en ${days} d`, urgent: false };
}

// ── Agregar tarjeta / columna ────────────────────────────────────────────

function AddCard({
  boardId,
  columnId,
  open,
  onOpen,
  onClose,
}: {
  boardId: string;
  columnId: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const create = useCreateCard(boardId);
  const [title, setTitle] = useState('');
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  function submit() {
    const value = title.trim();
    if (!value) return;
    create.mutate({ title: value, columnId }, { onSuccess: () => setTitle('') });
  }

  function handleKey(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      setTitle('');
      onClose();
    }
  }

  if (!open) {
    return (
      <button
        onClick={onOpen}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 13.5,
          fontWeight: 500,
          color: hover ? 'var(--ink)' : 'var(--ink-2)',
          background: hover ? 'var(--card)' : 'transparent',
          border: `1px dashed ${hover ? 'var(--ink)' : 'var(--neutral)'}`,
          borderRadius: 'var(--radius)',
          padding: 11,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        + Agregar tarjeta
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        ref={ref}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={handleKey}
        onBlur={() => {
          if (!title.trim()) onClose();
        }}
        placeholder="Título de la tarjeta"
        rows={2}
        maxLength={200}
        style={{ fontFamily: 'var(--sans)', fontSize: 14, padding: '10px 12px', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-card)', background: 'var(--card)', color: 'var(--ink)', resize: 'none' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          // onMouseDown: que el blur del textarea no cierre el compositor antes del clic.
          onMouseDown={(event) => event.preventDefault()}
          onClick={submit}
          disabled={!title.trim() || create.isPending}
          style={{ fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, padding: '7px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--cream)', cursor: 'pointer', opacity: !title.trim() ? 0.5 : 1 }}
        >
          {create.isPending ? 'Agregando…' : 'Agregar'}
        </button>
        <button
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setTitle('');
            onClose();
          }}
          style={{ fontFamily: 'var(--sans)', fontSize: 13, background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink-3)' }}
        >
          Cancelar
        </button>
      </div>
      {create.isError && (
        <span style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>
          {create.error instanceof ApiError ? create.error.message : 'No se pudo crear la tarjeta.'}
        </span>
      )}
    </div>
  );
}

/// "Nombre de la columna" + "Agregar columna", arriba a la derecha del tablero.
function AddColumn({ boardId }: { boardId: string }) {
  const add = useAddColumn(boardId);
  const [name, setName] = useState('');
  const ready = name.trim().length > 0 && !add.isPending;

  function submit() {
    const value = name.trim();
    if (!value || add.isPending) return;
    add.mutate(value, { onSuccess: () => setName('') });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <div style={{ display: 'flex', gap: 9 }}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
            if (event.key === 'Escape') setName('');
          }}
          placeholder="Nombre de la columna"
          maxLength={60}
          aria-label="Nombre de la columna nueva"
          style={{ fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--field)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)', padding: '10px 13px', width: 200 }}
        />
        <button
          onClick={submit}
          disabled={!ready}
          title="Se agrega al final y pasa a ser la última columna (la de «hecho»): las tarjetas cerradas de la anterior se reabren."
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 13.5,
            fontWeight: 600,
            color: ready ? 'var(--cream)' : 'var(--ink-3)',
            background: ready ? 'var(--ink)' : 'var(--line-x-soft)',
            border: `1px solid ${ready ? 'var(--ink)' : 'var(--line-x-soft)'}`,
            borderRadius: 'var(--radius)',
            padding: '10px 16px',
            cursor: ready ? 'pointer' : 'default',
          }}
        >
          {add.isPending ? 'Agregando…' : 'Agregar columna'}
        </button>
      </div>
      {add.isError && (
        <span style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>{add.error instanceof ApiError ? add.error.message : 'No se pudo agregar la columna.'}</span>
      )}
    </div>
  );
}

/// × de la columna. Dos pasos: el primer clic pide confirmación y explica qué
/// pasa con sus tarjetas (van a la primera columna).
function DeleteColumnButton({ boardId, column }: { boardId: string; column: BoardColumn }) {
  const remove = useDeleteColumn(boardId);
  const [confirming, setConfirming] = useState(false);
  const [hover, setHover] = useState(false);
  const n = column.cards.length;

  if (confirming) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={() => remove.mutate(column.id, { onSettled: () => setConfirming(false) })}
          disabled={remove.isPending}
          title={n ? `Sus ${n} ${n === 1 ? 'tarjeta pasa' : 'tarjetas pasan'} a la primera columna.` : 'La columna está vacía.'}
          style={{ fontFamily: 'var(--sans)', fontSize: 11.5, fontWeight: 600, color: 'var(--cream)', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: '2px 8px', cursor: 'pointer' }}
        >
          {remove.isPending ? 'Eliminando…' : 'Eliminar'}
        </button>
        <button onClick={() => setConfirming(false)} title="Cancelar" style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--ink-3)', background: 'transparent', border: 0, cursor: 'pointer', padding: 0 }}>
          No
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Eliminar columna"
      aria-label={`Eliminar la columna ${column.name}`}
      style={{ fontFamily: 'var(--sans)', fontSize: 14, lineHeight: 1, color: hover ? 'var(--accent)' : 'var(--ink-4)', background: 'transparent', border: 0, padding: '2px 3px', cursor: 'pointer', borderRadius: 'var(--radius)' }}
    >
      ×
    </button>
  );
}
