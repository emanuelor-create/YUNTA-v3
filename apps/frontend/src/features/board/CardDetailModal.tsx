import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { Modal } from '../../components/ui';
import { ApiError } from '../../lib/apiClient';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import { AttachmentsSection } from './AttachmentsSection';
import { CommentsSection } from './CommentsSection';
import { columnDot, DETAIL_FIELD, FieldTitle, LabelPill, Panel, SmallButton } from './detailUi';
import { EffortProgressSection } from './EffortProgressSection';
import { SubtasksSection } from './SubtasksSection';
import { CardPriority, PRIORITY_LABEL } from './priority';
import {
  CardDetail,
  useAddLabel,
  useAssignees,
  useCardDetail,
  useDeleteCard,
  useMoveCard,
  useRemoveLabel,
  useSetDueDate,
  useSetPriority,
  useSetStartDate,
  useUpdateCard,
} from './useBoard';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAY_MS = 86_400_000;

/// "20 ago 2026, 04:21"
function stamp(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/// Detalle de tarjeta (Yunta-Tarjeta-Detalle.html): encabezado con la casilla de
/// completar, código y título; a la izquierda los bloques (estado y propiedades,
/// esfuerzo y avance, personas y etiquetas, descripción, adjuntos) y el pie; a la
/// derecha, los comentarios.
export function CardDetailModal({ cardId, onClose, onOpenCard }: { cardId: string; onClose: () => void; onOpenCard: (cardId: string) => void }) {
  const { data: card, isLoading, isError } = useCardDetail(cardId);

  if (isLoading || isError || !card) {
    return (
      <Modal title={isError ? 'No se pudo cargar la tarjeta' : 'Cargando…'} width={780} onClose={onClose}>
        <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{isError ? 'Puede que ya no exista o no tengas acceso.' : ' '}</span>
      </Modal>
    );
  }
  return <DetailBody card={card} onClose={onClose} onOpenCard={onOpenCard} />;
}

function DetailBody({ card, onClose, onOpenCard }: { card: CardDetail; onClose: () => void; onOpenCard: (cardId: string) => void }) {
  const update = useUpdateCard(card.id);
  const move = useMoveCard(card.project.id);
  const remove = useDeleteCard(card.id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const readOnly = !card.canEdit;

  const last = card.columns[card.columns.length - 1]!;
  const done = card.column.id === last.id;
  // Completar = llevarla a la última columna; desmarcar = a la anterior.
  const toggleDone = () => {
    if (readOnly || card.isContainer || move.isPending) return;
    const target = done ? (card.columns[card.columns.length - 2] ?? card.columns[0]!) : last;
    move.mutate({ cardId: card.id, columnId: target.id });
  };

  const [title, setTitle] = useState(card.title);
  useEffect(() => setTitle(card.title), [card.title]);
  function saveTitle() {
    const value = title.trim();
    if (!value) return setTitle(card.title); // vacío: vuelve al que tenía
    if (value !== card.title) update.mutate({ title: value });
  }

  const error = [update, move, remove].find((m) => m.isError)?.error;

  return (
    <Modal
      width={1080}
      height={820}
      onClose={onClose}
      bodyStyle={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 348px', flex: 1, minHeight: 0, alignItems: 'stretch' }}
      header={
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '18px 22px 16px', borderBottom: '1px solid var(--line-strong)', background: 'var(--page)' }}>
          <button
            type="button"
            onClick={toggleDone}
            disabled={readOnly || card.isContainer}
            title={card.isContainer ? 'Se completa cuando se completan sus subtareas' : done ? 'Marcar como pendiente' : 'Marcar como completada'}
            aria-label={done ? 'Marcar como pendiente' : 'Marcar como completada'}
            aria-pressed={done}
            style={{
              width: 22,
              height: 22,
              flex: 'none',
              marginTop: 6,
              border: `1.5px solid ${done ? 'var(--ink)' : 'var(--neutral)'}`,
              background: done ? 'var(--ink)' : 'var(--field)',
              padding: 0,
              cursor: readOnly || card.isContainer ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--cream)" strokeWidth="3.5" style={{ opacity: done ? 1 : 0 }}>
              <polyline points="4 13 9 18 20 6" />
            </svg>
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 11, fontWeight: 600, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
              <span>{card.code}</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--neutral)' }} />
              <span>{card.project.name} · Tablero</span>
              {card.parent && (
                <>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--neutral)' }} />
                  <button
                    type="button"
                    data-parent-link
                    onClick={() => onOpenCard(card.parent!.id)}
                    title={card.parent.title}
                    style={{ fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 600, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--accent-ink)', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Subtarea de {card.parent.code}
                  </button>
                </>
              )}
            </div>
            <input
              value={title}
              disabled={readOnly}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={saveTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
              }}
              maxLength={200}
              aria-label="Título"
              title={title}
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 23,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                color: done ? 'var(--ink-3)' : 'var(--ink)',
                textDecoration: done ? 'line-through' : 'none',
                background: 'transparent',
                border: 0,
                borderBottom: '1px solid transparent',
                padding: '0 0 2px',
                width: '100%',
                borderRadius: 0,
                outline: 'none',
              }}
              onFocus={(e) => (e.currentTarget.style.borderBottomColor = 'var(--ink)')}
              onBlurCapture={(e) => (e.currentTarget.style.borderBottomColor = 'transparent')}
            />
          </div>

          <CloseButton onClick={onClose} />
        </div>
      }
    >
      <div style={{ minWidth: 0, overflowY: 'auto', padding: '20px 22px 26px', display: 'flex', flexDirection: 'column', gap: 18, borderRight: '1px solid var(--line-strong)' }}>
        <PropertiesPanel card={card} readOnly={readOnly} />
        {card.isContainer ? <SubtasksSection card={card} onOpen={onOpenCard} /> : <EffortProgressSection card={card} readOnly={readOnly} />}
        <PeoplePanel card={card} readOnly={readOnly} />
        <DescriptionPanel card={card} readOnly={readOnly} />
        <AttachmentsSection cardId={card.id} readOnly={readOnly} />

        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)' }}>
          Creada el {stamp(card.createdAt)}
          {card.createdBy && ` por ${card.createdBy}`} · actualizada {formatRelativeTime(card.updatedAt)}
        </p>

        {readOnly ? (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)' }}>Solo lectura: tu rol en este proyecto no permite editar tarjetas.</p>
        ) : (
          <div data-delete-zone style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderTop: '1px solid var(--line-strong)', paddingTop: 16 }}>
            <button
              type="button"
              onClick={toggleDone}
              disabled={card.isContainer || move.isPending}
              title={card.isContainer ? 'Se completa cuando se completan sus subtareas' : undefined}
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 14,
                fontWeight: 600,
                color: done ? 'var(--ink)' : 'var(--cream)',
                background: done ? 'transparent' : 'var(--ink)',
                border: `1px solid ${done ? 'var(--line-strong)' : 'var(--ink)'}`,
                padding: '11px 18px',
                cursor: card.isContainer ? 'default' : 'pointer',
                borderRadius: 'var(--radius)',
                opacity: card.isContainer ? 0.45 : 1,
              }}
            >
              {done ? 'Marcar como pendiente' : 'Marcar como completada'}
            </button>

            {card.isContainer ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 260, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-3)', textAlign: 'right' }}>
                  Dividida en {card.subtasks.length} {card.subtasks.length === 1 ? 'subtarea' : 'subtareas'}: eliminá primero cada subtarea.
                </span>
                <DeleteButton disabled label="Eliminar tarjeta" />
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {confirmingDelete && (
                  <>
                    <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Se borran también sus adjuntos y comentarios.</span>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink-3)', background: 'transparent', border: 0, cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                  </>
                )}
                <DeleteButton
                  confirming={confirmingDelete}
                  disabled={remove.isPending}
                  label={remove.isPending ? 'Eliminando…' : confirmingDelete ? 'Confirmar: eliminar' : card.parent ? 'Eliminar subtarea' : 'Eliminar tarjeta'}
                  onClick={() => (confirmingDelete ? remove.mutate(undefined, { onSuccess: onClose }) : setConfirmingDelete(true))}
                />
              </span>
            )}
          </div>
        )}

        {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--accent-ink)' }}>{error instanceof ApiError ? error.message : 'No se pudo guardar el cambio.'}</p>}
      </div>

      <CommentsSection cardId={card.id} />
    </Modal>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title="Cerrar"
      aria-label="Cerrar"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: 'var(--sans)',
        fontSize: 19,
        lineHeight: 1,
        color: hover ? 'var(--ink)' : 'var(--ink-3)',
        background: 'transparent',
        border: `1px solid ${hover ? 'var(--ink)' : 'var(--line-strong)'}`,
        padding: '6px 11px',
        cursor: 'pointer',
        flex: 'none',
        marginTop: 2,
        borderRadius: 'var(--radius)',
      }}
    >
      ×
    </button>
  );
}

function DeleteButton({ label, onClick, disabled, confirming }: { label: string; onClick?: () => void; disabled?: boolean; confirming?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: 'var(--sans)',
        fontSize: 13.5,
        fontWeight: 600,
        color: confirming ? 'var(--cream)' : 'var(--accent-ink)',
        background: confirming ? 'var(--accent)' : 'transparent',
        border: '1px solid var(--accent)',
        padding: '11px 18px',
        cursor: disabled ? 'default' : 'pointer',
        borderRadius: 'var(--radius)',
        opacity: disabled && !confirming ? 0.45 : 1,
      }}
    >
      {label}
    </button>
  );
}

// ── Estado y propiedades ─────────────────────────────────────────────────

const PRIORITY_TONE: Record<CardPriority, { bg: string; fg: string; bc: string }> = {
  ALTA: { bg: 'var(--accent-soft)', fg: 'var(--accent-ink)', bc: 'var(--accent-line)' },
  MEDIA: { bg: 'var(--neutral-soft)', fg: 'var(--ink-2)', bc: 'var(--line-x-soft)' },
  BAJA: { bg: 'var(--card)', fg: 'var(--ink-3)', bc: 'var(--line)' },
};

/// Una fecha 'AAAA-MM-DD' que se guarda tras una pausa de tipeo: el navegador
/// dispara `change` por cada dígito del año (0002, 0020, 0202, 2026) y cada uno
/// sería una fecha guardada y una entrada en Actividad.
function useDebouncedDate(serverIso: string | null, save: (value: string | null) => void) {
  const server = serverIso ? serverIso.slice(0, 10) : '';
  const [value, setValue] = useState(server);
  useEffect(() => setValue(server), [server]);
  useEffect(() => {
    if (value === server) return;
    const year = Number(value.slice(0, 4));
    if (value !== '' && !(year >= 2000 && year <= 2100)) return;
    const timer = setTimeout(() => save(value || null), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, server]);
  return [value, setValue] as const;
}

function PropertiesPanel({ card, readOnly }: { card: CardDetail; readOnly: boolean }) {
  const move = useMoveCard(card.project.id);
  const setPriority = useSetPriority(card.id);
  const setDue = useSetDueDate(card.id);
  const setStart = useSetStartDate(card.id);
  const [start, setStartInput] = useDebouncedDate(card.startDate, (v) => setStart.mutate(v));
  const [due, setDueInput] = useDebouncedDate(card.dueDate, (v) => setDue.mutate(v));
  const error = [move, setPriority, setDue, setStart].find((m) => m.isError)?.error;

  const columnIndex = card.columns.findIndex((c) => c.id === card.column.id);
  const done = columnIndex === card.columns.length - 1;
  const dates = !card.isContainer;

  // Nota del vencimiento: "vence hoy", "en 3 d", "atrasada 2 d" o "completada".
  let dueNote = '';
  let late = false;
  if (done) dueNote = card.dueDate ? 'completada' : '';
  else if (card.dueDate) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const d = new Date(card.dueDate);
    const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime() - today.getTime()) / DAY_MS);
    late = days < 0;
    dueNote = days < 0 ? `atrasada ${-days} d` : days === 0 ? 'vence hoy' : `en ${days} d`;
  }
  const crossed = !!start && !!due && start > due;

  const cell = (right: boolean, bottom: boolean) =>
    ({
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: '14px 18px',
      borderRight: right ? '1px solid var(--line-soft)' : undefined,
      borderBottom: bottom ? '1px solid var(--line-soft)' : undefined,
      minWidth: 0,
    }) as const;

  return (
    <Panel title="Estado y propiedades" data-panel="propiedades">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
        <label style={cell(true, true)}>
          <FieldTitle>Estado · columna del tablero</FieldTitle>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, flex: 'none', borderRadius: '50%', background: columnDot(Math.max(0, columnIndex), card.columns.length) }} />
            <select
              value={card.column.id}
              disabled={readOnly || move.isPending || card.isContainer}
              onChange={(event) => move.mutate({ cardId: card.id, columnId: event.target.value })}
              title={card.isContainer ? 'Derivado de las subtareas' : undefined}
              style={{ ...DETAIL_FIELD, fontSize: 14.5, fontWeight: 600, flex: 1, minWidth: 0, cursor: 'pointer' }}
            >
              {card.columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </select>
          </span>
          {card.isContainer && (
            <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--ink-3)' }}>
              Derivado de las subtareas: la columna de la más atrasada, o «{card.columns[card.columns.length - 1]!.name}» si están todas hechas.
            </span>
          )}
        </label>

        <div style={cell(false, true)}>
          <FieldTitle>Prioridad</FieldTitle>
          {card.isContainer ? (
            <span style={{ fontSize: 13, color: 'var(--ink-3)', padding: '9px 0' }}>La tienen sus subtareas.</span>
          ) : (
            <span role="radiogroup" aria-label="Prioridad" style={{ display: 'flex', gap: 7 }}>
              {(['ALTA', 'MEDIA', 'BAJA'] as CardPriority[]).map((p) => {
                const on = card.priority === p;
                const tone = PRIORITY_TONE[p];
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={readOnly || setPriority.isPending}
                    // Tocar la elegida la quita: queda "sin clasificar".
                    onClick={() => setPriority.mutate(on ? null : p)}
                    title={on ? 'Tocá de nuevo para dejarla sin clasificar' : undefined}
                    style={{
                      fontFamily: 'var(--sans)',
                      fontSize: 13.5,
                      fontWeight: 500,
                      padding: '9px 10px',
                      cursor: readOnly ? 'default' : 'pointer',
                      flex: 1,
                      border: `1px solid ${on ? 'var(--ink)' : tone.bc}`,
                      background: on ? 'var(--ink)' : tone.bg,
                      color: on ? 'var(--cream)' : tone.fg,
                      borderRadius: 'var(--radius)',
                    }}
                  >
                    {PRIORITY_LABEL[p]}
                  </button>
                );
              })}
            </span>
          )}
        </div>

        <label style={cell(true, false)}>
          <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <FieldTitle>Inicio</FieldTitle>
            {crossed && <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent)' }}>después del vencimiento</span>}
          </span>
          {dates ? (
            <DateInput value={start} disabled={readOnly} onChange={setStartInput} label="Fecha de inicio" warn={crossed} />
          ) : (
            <span style={{ fontSize: 13, color: 'var(--ink-3)', padding: '9px 0' }}>La tienen sus subtareas.</span>
          )}
        </label>

        <label style={cell(false, false)}>
          <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <FieldTitle>Vencimiento</FieldTitle>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: late ? 'var(--accent)' : 'var(--ink-3)' }}>{dueNote}</span>
          </span>
          {dates ? (
            <DateInput value={due} disabled={readOnly} onChange={setDueInput} label="Fecha de vencimiento" warn={late} />
          ) : (
            <span style={{ fontSize: 13, color: 'var(--ink-3)', padding: '9px 0' }}>La tienen sus subtareas.</span>
          )}
        </label>
      </div>
      {error && (
        <p style={{ margin: 0, padding: '0 18px 14px', fontSize: 13, color: 'var(--accent-ink)' }}>
          {error instanceof ApiError ? error.message : 'No se pudo guardar el cambio.'}
        </p>
      )}
    </Panel>
  );
}

function DateInput({ value, onChange, disabled, label, warn }: { value: string; onChange: (v: string) => void; disabled: boolean; label: string; warn: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="date"
        aria-label={label}
        value={value}
        min="2000-01-01"
        max="2100-12-31"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        style={{ ...DETAIL_FIELD, flex: 1, minWidth: 0, borderColor: warn ? 'var(--accent)' : 'var(--line-strong)' }}
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onChange('');
          }}
          title="Quitar la fecha"
          aria-label={`Quitar ${label.toLowerCase()}`}
          style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink-4)', fontSize: 15, padding: '0 2px', flex: 'none' }}
        >
          ×
        </button>
      )}
    </span>
  );
}

// ── Personas y etiquetas ─────────────────────────────────────────────────

function PeoplePanel({ card, readOnly }: { card: CardDetail; readOnly: boolean }) {
  const assignees = useAssignees(card.id);
  const addLabel = useAddLabel(card.id);
  const removeLabel = useRemoveLabel(card.id);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const error = [assignees, addLabel, removeLabel].find((m) => m.isError)?.error;

  const candidates = card.members.filter((m) => !card.assignees.some((a) => a.id === m.id));
  const suggestions = card.projectLabels.filter((l) => !card.labels.some((c) => c.id === l.id));

  useEffect(() => {
    if (adding) input.current?.focus();
  }, [adding]);

  function submitLabel() {
    const value = name.trim();
    if (!value) return setAdding(false);
    addLabel.mutate(value, {
      onSuccess: () => {
        setName('');
        setAdding(false);
      },
    });
  }

  function labelKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitLabel();
    } else if (event.key === 'Escape') {
      event.stopPropagation(); // cancela, no cierra el modal
      setName('');
      setAdding(false);
    }
  }

  return (
    <Panel title="Personas y etiquetas" data-panel="personas">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--line-soft)' }}>
        <FieldTitle>Asignados</FieldTitle>
        {card.isContainer ? (
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Una tarjeta dividida no tiene asignados propios: los tienen sus subtareas.</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {card.assignees.length === 0 && readOnly && <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>Nadie asignado.</span>}
            {card.assignees.map((person) => (
              <span
                key={person.id}
                data-assignee={person.name}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--page)', border: '1px solid var(--line-x-soft)', padding: '5px 8px 5px 5px', borderRadius: 'var(--radius-card)' }}
              >
                <Avatar seed={person.id} name={person.name} size={22} />
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{person.name}</span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => assignees.mutate({ userId: person.id, assign: false })}
                    disabled={assignees.isPending}
                    title="Quitar"
                    aria-label={`Quitar a ${person.name}`}
                    style={{ fontFamily: 'var(--sans)', fontSize: 13, lineHeight: 1, color: 'var(--ink-4)', background: 'transparent', border: 0, padding: '0 2px', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {!readOnly && candidates.length > 0 && (
              <select
                value=""
                disabled={assignees.isPending}
                onChange={(event) => event.target.value && assignees.mutate({ userId: event.target.value, assign: true })}
                aria-label="Asignar a alguien"
                style={{ ...DETAIL_FIELD, width: 'auto', fontSize: 13.5, color: 'var(--ink-2)', cursor: 'pointer' }}
              >
                <option value="">+ Asignar…</option>
                {candidates.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '15px 18px' }}>
        <FieldTitle>Etiquetas</FieldTitle>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
          {card.labels.length === 0 && readOnly && <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>Sin etiquetas.</span>}
          {card.labels.map((label) => (
            <LabelPill key={label.id} name={label.name} tone={label.tone} onRemove={readOnly ? undefined : () => removeLabel.mutate(label.id)} />
          ))}
          {!readOnly &&
            (adding ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  ref={input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={labelKey}
                  onBlur={() => !name.trim() && setAdding(false)}
                  list={`labels-${card.id}`}
                  maxLength={30}
                  placeholder="Nombre y Enter"
                  aria-label="Nueva etiqueta"
                  style={{ ...DETAIL_FIELD, width: 170, fontSize: 13, padding: '6px 10px' }}
                />
                <datalist id={`labels-${card.id}`}>
                  {suggestions.map((l) => (
                    <option key={l.id} value={l.name} />
                  ))}
                </datalist>
                {addLabel.isPending && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Agregando…</span>}
              </span>
            ) : (
              <AddLabelButton onClick={() => setAdding(true)} />
            ))}
        </div>
        {!readOnly && adding && suggestions.length > 0 && (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Del proyecto:</span>
            {suggestions.slice(0, 8).map((l) => (
              <button
                key={l.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addLabel.mutate(l.name, { onSuccess: () => setAdding(false) })}
                style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}
              >
                <LabelPill name={l.name} tone={l.tone} size="sm" />
              </button>
            ))}
          </span>
        )}
      </div>
      {error && (
        <p style={{ margin: 0, padding: '0 18px 14px', fontSize: 13, color: 'var(--accent-ink)' }}>
          {error instanceof ApiError ? error.message : 'No se pudo guardar el cambio.'}
        </p>
      )}
    </Panel>
  );
}

function AddLabelButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: 'var(--sans)',
        fontSize: 13,
        fontWeight: 500,
        color: hover ? 'var(--ink)' : 'var(--ink-2)',
        background: 'transparent',
        border: `1px dashed ${hover ? 'var(--ink)' : 'var(--neutral)'}`,
        padding: '6px 12px',
        cursor: 'pointer',
        borderRadius: 'var(--radius)',
      }}
    >
      + Etiqueta
    </button>
  );
}

// ── Descripción ──────────────────────────────────────────────────────────

function DescriptionPanel({ card, readOnly }: { card: CardDetail; readOnly: boolean }) {
  const update = useUpdateCard(card.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.description ?? '');

  function save() {
    const value = draft.trim();
    if (value === (card.description ?? '').trim()) return setEditing(false);
    update.mutate({ description: value || null }, { onSuccess: () => setEditing(false) });
  }

  return (
    <Panel
      title="Descripción"
      data-panel="descripcion"
      action={
        !readOnly && (
          <SmallButton
            onClick={() => {
              if (!editing) setDraft(card.description ?? '');
              setEditing((v) => !v);
            }}
          >
            {editing ? 'Cerrar' : 'Editar'}
          </SmallButton>
        )
      }
    >
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '15px 18px' }}>
          <textarea
            autoFocus
            rows={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setEditing(false);
              }
            }}
            placeholder="Qué hay que hacer, criterios de aceptación, links…"
            style={{ ...DETAIL_FIELD, lineHeight: 1.55, padding: '11px 13px', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
            <PrimaryButton onClick={save} disabled={update.isPending}>
              {update.isPending ? 'Guardando…' : 'Guardar'}
            </PrimaryButton>
            <SmallButton onClick={() => setEditing(false)}>Cancelar</SmallButton>
            {update.isError && <span style={{ fontSize: 13, color: 'var(--accent-ink)' }}>No se pudo guardar.</span>}
          </div>
        </div>
      ) : (
        <p
          onDoubleClick={() => !readOnly && (setDraft(card.description ?? ''), setEditing(true))}
          style={{ margin: 0, padding: '15px 18px', fontSize: 14, lineHeight: 1.6, color: card.description ? 'var(--ink)' : 'var(--ink-3)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
        >
          {card.description || 'Sin descripción.'}
        </p>
      )}
    </Panel>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: 'var(--sans)',
        fontSize: 13.5,
        fontWeight: 600,
        color: 'var(--cream)',
        background: hover && !disabled ? 'var(--accent)' : 'var(--ink)',
        border: 0,
        padding: '9px 16px',
        cursor: disabled ? 'default' : 'pointer',
        borderRadius: 'var(--radius)',
      }}
    >
      {children}
    </button>
  );
}
