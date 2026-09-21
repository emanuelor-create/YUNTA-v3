import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { Button, Label, Modal } from '../../components/ui';
import { ApiError } from '../../lib/apiClient';
import { formatFullDate } from '../../lib/formatRelativeTime';
import { AttachmentsSection } from './AttachmentsSection';
import { CommentsSection } from './CommentsSection';
import { EffortProgressSection } from './EffortProgressSection';
import { SubtasksSection } from './SubtasksSection';
import { CardPriority, PRIORITY_LABEL } from './priority';
import { useAssignees, useCardDetail, useDeleteCard, useMoveCard, useSetDueDate, useSetPriority, useUpdateCard } from './useBoard';

const FIELD: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'var(--sans)',
  fontSize: 14,
  color: 'var(--ink)',
  background: 'var(--field)',
  border: '1px solid var(--line-strong)',
  borderRadius: 'var(--radius)',
  padding: '9px 11px',
};

const PRIORITY_OPTIONS: (CardPriority | '')[] = ['', 'ALTA', 'MEDIA', 'BAJA'];

/// Shell del detalle de tarjeta con lo que ya tiene backend: título, código,
/// estado, prioridad, asignados, fecha de entrega, descripción, esfuerzo, avance,
/// adjuntos, comentarios y borrar la tarjeta.
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

function DetailBody({ card, onClose, onOpenCard }: { card: NonNullable<ReturnType<typeof useCardDetail>['data']>; onClose: () => void; onOpenCard: (cardId: string) => void }) {
  const update = useUpdateCard(card.id);
  const setPriority = useSetPriority(card.id);
  const assignees = useAssignees(card.id);
  const move = useMoveCard(card.project.id);
  const setDueDate = useSetDueDate(card.id);
  const remove = useDeleteCard(card.id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // La fecha se guarda tras una pausa de tipeo, no en cada cambio: el navegador
  // dispara `change` por cada dígito del año (0002, 0020, 0202, 2026) y cada uno
  // sería una fecha guardada y una entrada en Actividad.
  const serverDue = card.dueDate ? card.dueDate.slice(0, 10) : '';
  const [dueInput, setDueInput] = useState(serverDue);
  useEffect(() => setDueInput(serverDue), [serverDue]);
  useEffect(() => {
    if (dueInput === serverDue) return;
    const year = Number(dueInput.slice(0, 4));
    if (dueInput !== '' && !(year >= 2000 && year <= 2100)) return;
    const timer = setTimeout(() => setDueDate.mutate(dueInput || null), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueInput, serverDue]);

  const [title, setTitle] = useState(card.title);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [description, setDescription] = useState(card.description ?? '');
  // Si la tarjeta cambia desde afuera (otro usuario, otra pestaña), se refleja.
  useEffect(() => setTitle(card.title), [card.title]);
  useEffect(() => setDescription(card.description ?? ''), [card.description]);

  // El título es un campo que crece con el texto: en un input de una línea un
  // título largo quedaba cortado y no se podía leer entero.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  const error = [update, setPriority, assignees, move, setDueDate, remove].find((m) => m.isError)?.error;
  const readOnly = !card.canEdit;

  function saveTitle() {
    const value = title.trim();
    if (!value) return setTitle(card.title); // vacío: vuelve al que tenía
    if (value !== card.title) update.mutate({ title: value });
  }

  function saveDescription() {
    if (description.trim() !== (card.description ?? '')) update.mutate({ description });
  }

  const unassigned = card.members.filter((m) => !card.assignees.some((a) => a.id === m.id));

  return (
    <Modal
      width={780}
      onClose={onClose}
      header={
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '22px 26px 18px', borderBottom: '1px solid var(--line-strong)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-3)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: card.project.color }} />
              {card.project.name}
              <span style={{ fontFamily: 'var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)', letterSpacing: '0.02em', color: 'var(--ink-2)' }}>· {card.code}</span>
              {card.parent && (
                <button
                  type="button"
                  data-parent-link
                  onClick={() => onOpenCard(card.parent!.id)}
                  title={card.parent.title}
                  style={{ fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--accent-ink)', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  subtarea de {card.parent.code}
                </button>
              )}
            </span>
            <textarea
              ref={titleRef}
              value={title}
              disabled={readOnly}
              rows={1}
              onChange={(event) => setTitle(event.target.value.replace(/\n/g, ' '))}
              onBlur={saveTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  (event.target as HTMLTextAreaElement).blur();
                }
              }}
              maxLength={200}
              aria-label="Título"
              style={{ fontFamily: 'var(--sans)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.028em', lineHeight: 1.2, color: 'var(--ink)', background: 'transparent', border: '1px solid transparent', borderRadius: 8, padding: '4px 8px', margin: '0 -8px', resize: 'none', overflow: 'hidden' }}
            />
          </div>
          <Button variant="ghost" onClick={onClose} style={{ fontSize: 20, lineHeight: 1, color: 'var(--ink-3)', padding: '6px 11px' }}>
            ×
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 250px', gap: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Label track="0.13em">Descripción</Label>
          <textarea
            value={description}
            disabled={readOnly}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={saveDescription}
            placeholder={readOnly ? 'Sin descripción.' : 'Agregá contexto, criterios de aceptación, links…'}
            rows={5}
            style={{ ...FIELD, resize: 'vertical', lineHeight: 1.5 }}
          />
          <div style={{ marginTop: 10 }}>
            {card.isContainer ? <SubtasksSection card={card} onOpen={onOpenCard} /> : <EffortProgressSection card={card} readOnly={readOnly} />}
          </div>
          <AttachmentsSection cardId={card.id} readOnly={readOnly} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Field label="Estado">
            <select
              value={card.column.id}
              disabled={readOnly || move.isPending || card.isContainer}
              onChange={(event) => move.mutate({ cardId: card.id, columnId: event.target.value })}
              style={FIELD}
            >
              {card.columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </select>
          </Field>

          {card.isContainer && (
            <span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-3)', marginTop: -10 }}>
              Derivado de las subtareas: la columna de la más atrasada, o «{card.columns[card.columns.length - 1].name}» si están todas hechas.
            </span>
          )}

          {!card.isContainer && (
          <Field label="Prioridad">
            <select
              value={card.priority ?? ''}
              disabled={readOnly || setPriority.isPending}
              onChange={(event) => setPriority.mutate((event.target.value || null) as CardPriority | null)}
              style={FIELD}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option || 'none'} value={option}>
                  {option ? PRIORITY_LABEL[option] : 'Sin clasificar'}
                </option>
              ))}
            </select>
          </Field>
          )}

          {!card.isContainer && (
          <Field label="Asignados">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {card.assignees.length === 0 && <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>Nadie asignado.</span>}
              {card.assignees.map((person) => (
                <div key={person.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Avatar seed={person.id} name={person.name} size={24} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</span>
                  {!readOnly && (
                    <button
                      onClick={() => assignees.mutate({ userId: person.id, assign: false })}
                      title="Quitar"
                      disabled={assignees.isPending}
                      style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink-4)', fontSize: 16, padding: '0 4px' }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {!readOnly && unassigned.length > 0 && (
                <select
                  value=""
                  disabled={assignees.isPending}
                  onChange={(event) => event.target.value && assignees.mutate({ userId: event.target.value, assign: true })}
                  style={{ ...FIELD, fontSize: 13, color: 'var(--ink-3)' }}
                >
                  <option value="">+ Asignar…</option>
                  {unassigned.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </Field>
          )}

          {!card.isContainer && (
          <Field label="Entrega">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {readOnly ? (
                <span style={{ fontSize: 13.5, color: card.dueState === 'overdue' ? 'var(--accent-ink)' : 'var(--ink)' }}>
                  {card.dueDate ? formatFullDate(card.dueDate) : 'Sin fecha'}
                </span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="date"
                    aria-label="Fecha de entrega"
                    value={dueInput}
                    min="2000-01-01"
                    max="2100-12-31"
                    onChange={(event) => setDueInput(event.target.value)}
                    style={{ ...FIELD, flex: 1, minWidth: 0 }}
                  />
                  {dueInput && (
                    <button
                      type="button"
                      onClick={() => setDueInput('')}
                      disabled={setDueDate.isPending}
                      title="Quitar la fecha"
                      style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink-4)', fontSize: 16, padding: '0 4px' }}
                    >
                      ×
                    </button>
                  )}
                </div>
              )}
              {(card.dueState || !card.dueDate) && (
                <span style={{ fontSize: 12.5, color: card.dueState === 'overdue' ? 'var(--accent-ink)' : 'var(--ink-3)' }}>
                  {!card.dueDate && 'Sin fecha'}
                  {card.dueState === 'overdue' && 'Vencida'}
                  {card.dueState === 'soon' && 'Vence pronto'}
                </span>
              )}
            </div>
          </Field>
          )}

          <Field label="Creada">
            <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{formatFullDate(card.createdAt)}</span>
          </Field>
        </div>
      </div>

      {/* Al pie del modal, ancho completo: es lo último del detalle. Comentar está abierto a todo miembro, VIEWER incluido. */}
      <div style={{ marginTop: 24 }}>
        <CommentsSection cardId={card.id} />
      </div>

      {!readOnly && (
        <div data-delete-zone style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line-soft)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          {card.isContainer ? (
            <>
              <Button variant="ghost" disabled title="Dividida en subtareas">
                Eliminar tarjeta
              </Button>
              <span style={{ flex: 1, minWidth: 220, fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-3)' }}>
                No se puede eliminar mientras esté dividida en {card.subtasks.length} {card.subtasks.length === 1 ? 'subtarea' : 'subtareas'}: sin decidir qué pasa con ellas quedarían huérfanas o
                desaparecerían de golpe. Eliminá primero cada subtarea.
              </span>
            </>
          ) : confirmingDelete ? (
            <>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                ¿Eliminar {card.parent ? 'esta subtarea' : 'la tarjeta'} «{card.title}»? Se borran también sus adjuntos y comentarios. No se puede deshacer.
              </span>
              <Button variant="primary" disabled={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: onClose })}>
                {remove.isPending ? 'Eliminando…' : 'Sí, eliminar'}
              </Button>
              <Button variant="ghost" disabled={remove.isPending} onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
              {card.parent ? 'Eliminar subtarea' : 'Eliminar tarjeta'}
            </Button>
          )}
        </div>
      )}

      {readOnly && <p style={{ margin: '18px 0 0', fontSize: 12.5, color: 'var(--ink-3)' }}>Solo lectura: tu rol en este proyecto no permite editar tarjetas.</p>}
      {error && <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--accent-ink)' }}>{error instanceof ApiError ? error.message : 'No se pudo guardar el cambio.'}</p>}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <Label track="0.13em">{label}</Label>
      {children}
    </div>
  );
}
