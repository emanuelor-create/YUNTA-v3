import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { ApiError } from '../../lib/apiClient';
import { formatShortDate } from '../../lib/formatRelativeTime';
import { ProjectShell } from '../projects/ProjectShell';
import { CardDetailModal } from './CardDetailModal';
import { PlusIcon } from './icons';
import { CardPriority, PRIORITY_LABEL } from './priority';
import { BoardCard, BoardColumn, useBoard, useCreateCard } from './useBoard';

// Yunta-Proyecto-Tabs.html, vista "Backlog": las mismas tarjetas del tablero en
// lista, agrupadas por columna. Lee del mismo endpoint que el Tablero
// (GET /projects/:id/board), así que todo lo que se cambia en una se ve en la otra.
//
// Diferencia con el diseño: la columna de etiquetas se reemplaza por el esfuerzo
// (puntos), porque las tarjetas todavía no tienen etiquetas.

type Filter = 'todas' | 'abiertas' | 'cerradas';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'abiertas', label: 'Abiertas' },
  { key: 'cerradas', label: 'Cerradas' },
];

// check · título · esfuerzo · vence · prioridad · personas
const ROW_GRID = '18px minmax(0,1fr) 64px 96px 92px 76px';

export function BacklogPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = id!;
  return (
    <ProjectShell projectId={projectId} active="backlog">
      {() => <BacklogBody projectId={projectId} />}
    </ProjectShell>
  );
}

function BacklogBody({ projectId }: { projectId: string }) {
  const { data: board, isLoading, isError } = useBoard(projectId);
  const [params, setParams] = useSearchParams();
  const openCardId = params.get('card');
  const filter = (FILTERS.find((f) => f.key === params.get('ver'))?.key ?? 'todas') as Filter;
  const [composerColumn, setComposerColumn] = useState<string | null>(null);

  if (isLoading) return <Message>Cargando el backlog…</Message>;
  if (isError || !board) return <Message>No se pudo cargar el backlog.</Message>;

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: key === 'ver' });
  }

  const matches = (card: BoardCard) =>
    filter === 'todas' ? true : filter === 'abiertas' ? !card.completed : card.completed;
  const total = board.columns.reduce((sum, column) => sum + column.cards.length, 0);
  const visible = board.columns.reduce((sum, column) => sum + column.cards.filter(matches).length, 0);

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '24px 40px 56px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            {FILTERS.map((f) => (
              <FilterChip key={f.key} active={f.key === filter} onClick={() => setParam('ver', f.key === 'todas' ? null : f.key)}>
                {f.label}
              </FilterChip>
            ))}
          </div>
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            {visible} de {total} {total === 1 ? 'tarea' : 'tareas'}
          </span>
        </div>

        {board.columns.map((column, index) => (
          <Group
            key={column.id}
            column={column}
            dot={dotFor(column, index)}
            rows={column.cards.filter(matches)}
            boardId={board.boardId}
            canEdit={board.canEdit}
            composerOpen={composerColumn === column.id}
            onOpenComposer={() => setComposerColumn(column.id)}
            onCloseComposer={() => setComposerColumn(null)}
            onOpenCard={(cardId) => setParam('card', cardId)}
          />
        ))}
      </div>
      {openCardId && (
        <CardDetailModal cardId={openCardId} onClose={() => setParam('card', null)} onOpenCard={(cardId) => setParam('card', cardId)} />
      )}
    </>
  );
}

/// Punto de color del grupo: la primera columna en neutro, la última ("hecho")
/// en verde y las del medio en las categorías de la paleta, como el diseño.
function dotFor(column: BoardColumn, index: number): string {
  if (column.isDone) return 'var(--ok)';
  if (index === 0) return 'var(--neutral)';
  const middle = ['var(--accent)', 'var(--clay)', 'var(--stone)'];
  return middle[(index - 1) % middle.length]!;
}

function Message({ children }: { children: string }) {
  return <div style={{ padding: 56, textAlign: 'center', fontSize: 14, color: 'var(--ink-3)' }}>{children}</div>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontFamily: 'var(--sans)',
        fontSize: 13.5,
        fontWeight: active ? 600 : 500,
        color: active ? 'var(--cream, #F2EFE9)' : 'var(--ink-2)',
        background: active ? 'var(--ink)' : 'transparent',
        border: `1px solid ${active ? 'var(--ink)' : 'var(--line-strong)'}`,
        borderRadius: 'var(--radius)',
        padding: '9px 15px',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ── Grupo (una columna del tablero) ──────────────────────────────────────

function Group({
  column,
  dot,
  rows,
  boardId,
  canEdit,
  composerOpen,
  onOpenComposer,
  onCloseComposer,
  onOpenCard,
}: {
  column: BoardColumn;
  dot: string;
  rows: BoardCard[];
  boardId: string;
  canEdit: boolean;
  composerOpen: boolean;
  onOpenComposer: () => void;
  onCloseComposer: () => void;
  onOpenCard: (cardId: string) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <section
      data-column-id={column.id}
      style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', background: 'var(--card)', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flex: 'none' }} />
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{column.name}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ink-3)',
            background: 'var(--neutral-soft)',
            borderRadius: 'var(--radius-pill)',
            padding: '2px 9px',
          }}
        >
          {rows.length}
        </span>
        <span style={{ flex: 1 }} />
        {canEdit && (
          <button
            onClick={onOpenComposer}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 12.5,
              fontWeight: 500,
              color: hover ? 'var(--ink)' : 'var(--ink-2)',
              background: 'transparent',
              border: `1px solid ${hover ? 'var(--ink)' : 'var(--line-strong)'}`,
              borderRadius: 'var(--radius)',
              padding: '6px 13px',
              cursor: 'pointer',
            }}
          >
            Nueva tarea
          </button>
        )}
      </div>

      {composerOpen && <AddRow boardId={boardId} columnId={column.id} onClose={onCloseComposer} />}

      {rows.map((card) => (
        <Row key={card.id} card={card} onOpen={() => onOpenCard(card.id)} />
      ))}

      {rows.length === 0 && !composerOpen && (
        <p style={{ margin: 0, padding: '16px 20px', fontSize: 13.5, color: 'var(--ink-3)' }}>Sin tareas en esta columna.</p>
      )}
    </section>
  );
}

// ── Fila ─────────────────────────────────────────────────────────────────

const PRIORITY_PILL: Record<CardPriority, { bg: string; fg: string }> = {
  ALTA: { bg: 'var(--accent-soft)', fg: 'var(--accent-ink)' },
  MEDIA: { bg: 'var(--neutral-soft)', fg: 'var(--ink-2)' },
  BAJA: { bg: 'var(--field)', fg: 'var(--ink-3)' },
};

function Row({ card, onOpen }: { card: BoardCard; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const done = card.completed;
  const container = card.subtasks !== null;
  const shown = card.assignees.slice(0, 3);
  const extra = card.assignees.length - shown.length;

  return (
    <div
      role="button"
      tabIndex={0}
      data-card-id={card.id}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: ROW_GRID,
        alignItems: 'center',
        gap: 16,
        padding: '14px 20px',
        borderBottom: '1px solid var(--line-soft)',
        cursor: 'pointer',
        background: hover ? 'var(--row-hover)' : 'transparent',
      }}
    >
      {/* Indicador de cerrada (no es un control: cerrar = llevarla a la última columna). */}
      <span
        aria-label={done ? 'Cerrada' : 'Abierta'}
        style={{
          width: 18,
          height: 18,
          boxSizing: 'border-box',
          border: `1.5px solid ${done ? 'var(--ink)' : 'var(--neutral)'}`,
          borderRadius: 6,
          background: done ? 'var(--ink)' : 'var(--field)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--card)" strokeWidth="3.5" style={{ opacity: done ? 1 : 0 }}>
          <polyline points="4 13 9 18 20 6" />
        </svg>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span
          title={card.title}
          style={{
            fontSize: 14.5,
            fontWeight: 500,
            color: done ? 'var(--ink-3)' : 'var(--ink)',
            textDecoration: done ? 'line-through' : 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {card.title}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {card.code}
          {card.parentCode && ` · subtarea de ${card.parentCode}`}
          {container && ` · ${card.subtasks!.total} subtareas, ${card.subtasks!.done} ${card.subtasks!.done === 1 ? 'hecha' : 'hechas'}`}
        </span>
      </span>

      <span title="Esfuerzo" style={{ fontSize: 12.5, color: 'var(--ink-3)', textAlign: 'right' }}>
        {card.storyPoints !== null ? `${card.storyPoints} ${card.storyPoints === 1 ? 'pt' : 'pts'}` : ''}
      </span>

      <span
        title={card.dueState === 'overdue' ? 'Vencida' : card.dueState === 'soon' ? 'Vence pronto' : undefined}
        style={{
          fontSize: 12.5,
          fontWeight: 500,
          color: !done && card.dueState === 'overdue' ? 'var(--accent)' : 'var(--ink-3)',
          textAlign: 'right',
          whiteSpace: 'nowrap',
        }}
      >
        {done ? 'cerrada' : card.dueDate ? formatShortDate(card.dueDate) : '—'}
      </span>

      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          textAlign: 'center',
          borderRadius: 'var(--radius-pill)',
          padding: '4px 0',
          color: card.priority ? PRIORITY_PILL[card.priority].fg : 'var(--ink-4)',
          background: card.priority ? PRIORITY_PILL[card.priority].bg : 'transparent',
          border: card.priority === 'BAJA' ? '1px solid var(--line)' : '1px solid transparent',
        }}
      >
        {card.priority ? PRIORITY_LABEL[card.priority] : container ? '' : 'Sin prioridad'}
      </span>

      <span style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }} title={card.assignees.map((a) => a.name).join(', ')}>
        {shown.map((person, i) => (
          <span
            key={person.id}
            style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: '50%', border: '2px solid var(--card)', display: 'flex' }}
          >
            <Avatar seed={person.id} name={person.name} size={26} />
          </span>
        ))}
        {extra > 0 && <span style={{ marginLeft: 4, fontSize: 11.5, color: 'var(--ink-3)' }}>+{extra}</span>}
      </span>
    </div>
  );
}

// ── Alta rápida dentro del grupo ─────────────────────────────────────────

function AddRow({ boardId, columnId, onClose }: { boardId: string; columnId: string; onClose: () => void }) {
  const create = useCreateCard(boardId);
  const [title, setTitle] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  function submit() {
    const value = title.trim();
    if (!value || create.isPending) return;
    // Queda abierto para cargar varias seguidas, como en el Tablero.
    create.mutate({ title: value, columnId }, { onSuccess: () => setTitle('') });
  }

  function handleKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      onClose();
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 20px', borderBottom: '1px solid var(--line-soft)', background: 'var(--row-hover)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PlusIcon size={14} />
        <input
          ref={ref}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={handleKey}
          onBlur={() => {
            if (!title.trim()) onClose();
          }}
          placeholder="Título de la tarea y Enter"
          maxLength={200}
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--sans)',
            fontSize: 14,
            padding: '9px 12px',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--radius)',
            background: 'var(--field)',
            color: 'var(--ink)',
          }}
        />
        <button
          onMouseDown={(event) => event.preventDefault()}
          onClick={submit}
          disabled={!title.trim() || create.isPending}
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 13px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--ink)',
            background: 'var(--ink)',
            color: 'var(--cream, #F2EFE9)',
            cursor: 'pointer',
            opacity: !title.trim() ? 0.5 : 1,
          }}
        >
          {create.isPending ? 'Agregando…' : 'Agregar'}
        </button>
        <button
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClose}
          style={{ fontFamily: 'var(--sans)', fontSize: 13, background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink-3)' }}
        >
          Cancelar
        </button>
      </div>
      {create.isError && (
        <span style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>
          {create.error instanceof ApiError ? create.error.message : 'No se pudo crear la tarea.'}
        </span>
      )}
    </div>
  );
}
