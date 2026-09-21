import { useState } from 'react';
import { Button, Label, Modal } from '../../components/ui';
import { ApiError } from '../../lib/apiClient';
import { EFFORT_SCALE } from './effortProgress';
import { CardDetail, MAX_SUBTASKS, useDivideCard } from './useBoard';

/// Una tarjeta de 13 "debería dividirse" (BACKEND.md §2): la suma de las partes
/// debería quedar cerca de 13. Fuera de este rango se avisa, no se bloquea.
const SUM_NEAR_MIN = 9;
const SUM_NEAR_MAX = 20;

interface Row {
  key: number;
  title: string;
  storyPoints: number | null;
}

/// Pantalla de división: una lista de título + esfuerzo por subtarea. Cada
/// subtarea es una tarjeta completa (código propio, avance, esfuerzo, asignados).
export function DivideCardModal({ card, onClose }: { card: CardDetail; onClose: () => void }) {
  const divide = useDivideCard(card.id);
  const [nextKey, setNextKey] = useState(3);
  const [rows, setRows] = useState<Row[]>([
    { key: 1, title: '', storyPoints: null },
    { key: 2, title: '', storyPoints: null },
  ]);

  const sum = rows.reduce((total, row) => total + (row.storyPoints ?? 0), 0);
  const unestimated = rows.filter((row) => row.storyPoints === null).length;
  const allTitled = rows.every((row) => row.title.trim().length > 0);
  const canSubmit = rows.length >= 2 && allTitled && !divide.isPending;
  const far = sum > 0 && (sum < SUM_NEAR_MIN || sum > SUM_NEAR_MAX);

  function patch(key: number, change: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  function submit() {
    if (!canSubmit) return;
    divide.mutate(
      rows.map((row) => ({ title: row.title.trim(), storyPoints: row.storyPoints })),
      { onSuccess: onClose },
    );
  }

  return (
    <Modal
      title="Dividir en subtareas"
      kicker={card.code}
      width={640}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          {divide.isError && (
            <span style={{ fontSize: 13, color: 'var(--accent-ink)', marginRight: 'auto' }}>
              {divide.error instanceof ApiError ? divide.error.message : 'No se pudo dividir la tarjeta.'}
            </span>
          )}
          <span style={{ marginLeft: divide.isError ? 0 : 'auto', display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={!canSubmit} onClick={submit}>
              {divide.isPending ? 'Dividiendo…' : `Dividir en ${rows.length} subtareas`}
            </Button>
          </span>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>
          «{card.title}» pasa a ser un contenedor: deja de contar por sí sola y cuentan sus subtareas. Su esfuerzo,
          prioridad, fecha y asignados se pasan a las subtareas, y su avance y estado se calculan a partir de ellas.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Label track="0.13em">Subtareas</Label>
          {rows.map((row, index) => (
            <div key={row.key} data-subtask-row style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '11px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius)', background: 'var(--card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', width: 18 }}>{index + 1}</span>
                <input
                  value={row.title}
                  onChange={(event) => patch(row.key, { title: event.target.value })}
                  maxLength={200}
                  placeholder="Título de la subtarea"
                  aria-label={`Título de la subtarea ${index + 1}`}
                  autoFocus={index === 0}
                  style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--ink)', background: 'var(--field)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)', padding: '8px 10px' }}
                />
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                  disabled={rows.length <= 2}
                  title={rows.length <= 2 ? 'Hacen falta al menos dos subtareas' : 'Quitar subtarea'}
                  aria-label={`Quitar la subtarea ${index + 1}`}
                  style={{ background: 'transparent', border: 0, cursor: rows.length <= 2 ? 'default' : 'pointer', color: 'var(--ink-4)', fontSize: 18, padding: '0 6px', opacity: rows.length <= 2 ? 0.4 : 1 }}
                >
                  ×
                </button>
              </div>
              <div role="radiogroup" aria-label={`Esfuerzo de la subtarea ${index + 1}`} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 26 }}>
                {EFFORT_SCALE.map((level) => {
                  const selected = row.storyPoints === level.value;
                  return (
                    <button
                      key={level.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      title={`${level.value} · ${level.magnitude}`}
                      onClick={() => patch(row.key, { storyPoints: selected ? null : level.value })}
                      style={{
                        width: 36,
                        height: 34,
                        fontFamily: 'var(--sans)',
                        fontSize: 14,
                        fontWeight: 700,
                        borderRadius: 'var(--radius)',
                        cursor: 'pointer',
                        color: selected ? 'var(--cream)' : 'var(--ink)',
                        background: selected ? 'var(--ink)' : 'var(--field)',
                        border: `1px solid ${selected ? 'var(--ink)' : 'var(--line-strong)'}`,
                      }}
                    >
                      {level.value}
                    </button>
                  );
                })}
                <span style={{ marginLeft: 6, fontSize: 12.5, color: 'var(--ink-3)' }}>
                  {row.storyPoints === null ? 'Sin estimar' : EFFORT_SCALE.find((l) => l.value === row.storyPoints)?.magnitude}
                </span>
              </div>
            </div>
          ))}
          <div>
            <Button variant="ghost" disabled={rows.length >= MAX_SUBTASKS} onClick={() => { setRows((current) => [...current, { key: nextKey, title: '', storyPoints: null }]); setNextKey((k) => k + 1); }}>
              + Agregar subtarea
            </Button>
            {rows.length >= MAX_SUBTASKS && <span style={{ marginLeft: 10, fontSize: 12.5, color: 'var(--ink-3)' }}>Máximo {MAX_SUBTASKS}.</span>}
          </div>
        </div>

        <div
          aria-live="polite"
          data-subtask-sum
          style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '11px 14px', borderRadius: 'var(--radius)', background: far ? 'var(--accent-soft)' : 'var(--row-hover)', border: `1px solid ${far ? 'var(--accent-line)' : 'var(--line)'}` }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 700, color: far ? 'var(--accent-ink)' : 'var(--ink)' }}>
            Suma de las subtareas: {sum} <span style={{ fontWeight: 500, color: 'var(--ink-3)' }}>(la original era {card.storyPoints ?? '—'})</span>
          </span>
          {far && (
            <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--accent-ink)' }}>
              {sum < SUM_NEAR_MIN
                ? 'Queda bastante por debajo de 13: revisá si las partes cubren todo el trabajo o si la original estaba sobreestimada.'
                : 'Queda bastante por encima de 13: revisá si alguna parte se puede achicar o si conviene dividirla más.'}{' '}
              Podés dividir igual.
            </span>
          )}
          {unestimated > 0 && (
            <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
              {unestimated === 1 ? '1 subtarea sin estimar no suma' : `${unestimated} subtareas sin estimar no suman`}; se pueden estimar después.
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
