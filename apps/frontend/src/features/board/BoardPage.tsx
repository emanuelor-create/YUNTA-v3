import { useEffect, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { ApiError } from '../../lib/apiClient';
import { formatShortDate } from '../../lib/formatRelativeTime';
import { ProjectShell } from '../projects/ProjectShell';
import { CardDetailModal } from './CardDetailModal';
import { CheckIcon, ClockIcon, PlusIcon } from './icons';
import { CardPriorityBadge, showsPriorityBadge } from './priority';
import { BoardCard, BoardColumn, BoardView, useAddColumn, useBoard, useCreateCard, useMoveCard } from './useBoard';

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      {move.isError && (
        <div style={{ margin: '16px 40px 0', fontSize: 13, color: 'var(--accent-ink)' }}>
          {move.error instanceof ApiError ? move.error.message : 'No se pudo mover la tarjeta.'}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          padding: '24px 40px 40px',
          overflowX: 'auto',
          flex: 1,
        }}
      >
        {board.columns.map((column) => (
          <Lane
            key={column.id}
            column={column}
            boardId={board.boardId}
            canEdit={board.canEdit}
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
        {board.canManage && <AddColumn boardId={board.boardId} />}
      </div>
    </div>
  );
}

function Lane({
  column,
  boardId,
  canEdit,
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
  boardId: string;
  canEdit: boolean;
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
        border: `1px solid ${over ? 'var(--accent-line)' : 'var(--line)'}`,
        background: over ? 'var(--accent-soft)' : 'var(--card)',
        borderRadius: 'var(--radius-card)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 14px 10px' }}>
        <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.005em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={column.name}>
          {column.name}
        </h2>
        {column.isDone && (
          <span title="Última columna: las tarjetas que llegan acá cuentan como hechas" style={{ display: 'flex', color: 'var(--ink-3)' }}>
            <CheckIcon size={14} />
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--ink-3)' }}>{column.cards.length}</span>
      </header>

      <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 10px 10px', minHeight: 24 }}>
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
          <span style={{ fontSize: 12.5, color: 'var(--ink-4)', padding: '6px 4px', opacity: dropTarget ? 0.4 : 1 }}>Sin tarjetas</span>
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
        gap: 8,
        padding: '11px 12px',
        background: 'var(--field)',
        border: `1px solid ${hover ? 'var(--line-strong)' : 'var(--line)'}`,
        borderRadius: 10,
        cursor: draggable && !container ? 'grab' : 'pointer',
        opacity: dragged ? 0.35 : 1,
      }}
    >
      <span style={{ fontFamily: 'var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 11.5, color: 'var(--ink-3)', letterSpacing: '0.02em' }}>
        {card.code}
        {card.parentCode && <span title={`Subtarea de ${card.parentCode}`}> · de {card.parentCode}</span>}
      </span>
      <span title={card.title} style={{ ...CLAMP_3, fontSize: 13.5, fontWeight: 500, lineHeight: 1.35, color: card.completed ? 'var(--ink-3)' : 'var(--ink)' }}>
        {card.title}
      </span>
      {container && (
        <span
          data-container-summary
          style={{ alignSelf: 'flex-start', fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-tick)', background: 'var(--neutral-soft)', color: 'var(--ink-2)' }}
        >
          {card.subtasks!.total} subtareas · {card.subtasks!.done} {card.subtasks!.done === 1 ? 'hecha' : 'hechas'}
        </span>
      )}
      {!container && (showsPriorityBadge(card.priority) || card.dueState || shown.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 22 }}>
          <CardPriorityBadge priority={card.priority} />
          {card.dueState && card.dueDate && <DueChip state={card.dueState} iso={card.dueDate} />}
          {shown.length > 0 && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }} title={card.assignees.map((a) => a.name).join(', ')}>
              {shown.map((person, i) => (
                <span key={person.id} style={{ marginLeft: i === 0 ? 0 : -6, borderRadius: '50%', border: '2px solid var(--field)', display: 'flex' }}>
                  <Avatar seed={person.id} name={person.name} size={22} />
                </span>
              ))}
              {extra > 0 && <span style={{ marginLeft: 4, fontSize: 11.5, color: 'var(--ink-3)' }}>+{extra}</span>}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

// La fecha solo se pinta cuando importa: vencida (acento) o próxima (los 7 días
// de "vence pronto", las mismas definiciones que el Dashboard).
function DueChip({ state, iso }: { state: 'overdue' | 'soon'; iso: string }) {
  const overdue = state === 'overdue';
  return (
    <span
      title={overdue ? 'Vencida' : 'Vence pronto'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11.5,
        fontWeight: 500,
        padding: '2px 7px',
        borderRadius: 'var(--radius-tick)',
        background: overdue ? 'var(--accent-soft)' : 'var(--neutral-soft)',
        color: overdue ? 'var(--accent-ink)' : 'var(--ink-2)',
        whiteSpace: 'nowrap',
      }}
    >
      <ClockIcon size={11} />
      {formatShortDate(iso)}
    </span>
  );
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
        style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 10px 10px', padding: '8px 6px', background: 'transparent', border: 0, cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink-3)', textAlign: 'left' }}
      >
        <PlusIcon size={14} /> Agregar tarjeta
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 10px 12px' }}>
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
        style={{ fontFamily: 'var(--sans)', fontSize: 13.5, padding: '9px 10px', border: '1px solid var(--line-strong)', borderRadius: 8, background: 'var(--field)', resize: 'none' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          // onMouseDown: que el blur del textarea no cierre el compositor antes del clic.
          onMouseDown={(event) => event.preventDefault()}
          onClick={submit}
          disabled={!title.trim() || create.isPending}
          style={{ fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--cream)', cursor: 'pointer', opacity: !title.trim() ? 0.5 : 1 }}
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

function AddColumn({ boardId }: { boardId: string }) {
  const add = useAddColumn(boardId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  function submit() {
    const value = name.trim();
    if (!value) return;
    add.mutate(value, {
      onSuccess: () => {
        setName('');
        setOpen(false);
      },
    });
  }

  return (
    <div style={{ width: COLUMN_WIDTH, flex: 'none' }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '13px 14px', background: 'transparent', border: '1px dashed var(--line-strong)', borderRadius: 'var(--radius-card)', cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--ink-3)' }}
        >
          <PlusIcon size={14} /> Agregar columna
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 'var(--radius-card)' }}>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
              if (event.key === 'Escape') setOpen(false);
            }}
            placeholder="Nombre de la columna"
            maxLength={60}
            style={{ fontFamily: 'var(--sans)', fontSize: 13.5, padding: '9px 10px', border: '1px solid var(--line-strong)', borderRadius: 8, background: 'var(--field)' }}
          />
          <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--ink-3)' }}>
            Se agrega al final y pasa a ser la última columna (la de "hecho"): las tarjetas cerradas de la anterior se reabren.
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={submit}
              disabled={!name.trim() || add.isPending}
              style={{ fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--cream)', cursor: 'pointer', opacity: !name.trim() ? 0.5 : 1 }}
            >
              {add.isPending ? 'Agregando…' : 'Agregar columna'}
            </button>
            <button onClick={() => setOpen(false)} style={{ fontFamily: 'var(--sans)', fontSize: 13, background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink-3)' }}>
              Cancelar
            </button>
          </div>
          {add.isError && (
            <span style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>
              {add.error instanceof ApiError ? add.error.message : 'No se pudo agregar la columna.'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
