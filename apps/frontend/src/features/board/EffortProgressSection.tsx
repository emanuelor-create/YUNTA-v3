import { useEffect, useState } from 'react';
import { Button } from '../../components/ui';
import { ApiError } from '../../lib/apiClient';
import { DivideCardModal } from './DivideCardModal';
import { FieldTitle, Panel, SmallButton } from './detailUi';
import { EFFORT_SCALE, effortLevel, PROGRESS_STAGES, progressStage } from './effortProgress';
import { CardDetail, useSetProgress, useSetStoryPoints } from './useBoard';

/// "Esfuerzo y avance" (Yunta-Tarjeta-Detalle): puntos de esfuerzo en seis
/// botones parejos, la escala de referencia desplegable y el avance como una
/// línea de cinco etapas. Sin horas: el avance es una etapa con nombre y el
/// esfuerzo un tamaño relativo.
export function EffortProgressSection({ card, readOnly }: { card: CardDetail; readOnly: boolean }) {
  const setProgress = useSetProgress(card.id);
  const setPoints = useSetStoryPoints(card.id);
  const [scaleOpen, setScaleOpen] = useState(false);
  const error = [setProgress, setPoints].find((m) => m.isError)?.error;

  return (
    <Panel
      title="Esfuerzo y avance"
      data-panel="esfuerzo"
      action={
        <SmallButton onClick={() => setScaleOpen((v) => !v)} ariaExpanded={scaleOpen}>
          {scaleOpen ? 'Ocultar escala' : 'Ver escala'}
        </SmallButton>
      }
    >
      <EffortPicker
        card={card}
        readOnly={readOnly}
        saving={setPoints.isPending}
        onPick={(storyPoints, note) => setPoints.mutate({ storyPoints, note })}
      />
      {card.storyPoints === 13 && (
        <SplitBlock card={card} readOnly={readOnly} saving={setPoints.isPending} onJustify={(note) => setPoints.mutate({ storyPoints: 13, note })} />
      )}
      {scaleOpen && <ScaleTable selected={card.storyPoints} />}
      <ProgressPicker card={card} readOnly={readOnly} onPick={(value) => setProgress.mutate(value)} />
      {error && (
        <p style={{ margin: 0, padding: '0 18px 14px', fontSize: 13, color: 'var(--accent-ink)' }}>
          {error instanceof ApiError ? error.message : 'No se pudo guardar el cambio.'}
        </p>
      )}
    </Panel>
  );
}

// ── Esfuerzo ─────────────────────────────────────────────────────────────

function EffortPicker({
  card,
  readOnly,
  saving,
  onPick,
}: {
  card: CardDetail;
  readOnly: boolean;
  saving: boolean;
  onPick: (storyPoints: number | null, note?: string | null) => void;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const shown = effortLevel(preview ?? card.storyPoints);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '15px 18px', borderBottom: '1px solid var(--line-soft)' }}>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <FieldTitle>Puntos de esfuerzo</FieldTitle>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: shown?.value === 13 ? 'var(--accent-ink)' : 'var(--ink-2)' }}>
          {shown ? shown.magnitude : 'Sin estimar'}
        </span>
      </span>

      <span role="radiogroup" aria-label="Puntos de esfuerzo" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 7 }}>
        {EFFORT_SCALE.map((level) => {
          const on = card.storyPoints === level.value;
          const warn = level.value === 13;
          return (
            <button
              key={level.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={readOnly || saving}
              // Tocar el elegido lo quita: queda "sin estimar".
              onClick={() => onPick(on ? null : level.value)}
              onMouseEnter={() => setPreview(level.value)}
              onMouseLeave={() => setPreview(null)}
              onFocus={() => setPreview(level.value)}
              onBlur={() => setPreview(null)}
              title={on ? `${level.description} (tocá de nuevo para quitar la estimación)` : level.description}
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                padding: '11px 0',
                cursor: readOnly ? 'default' : 'pointer',
                border: `1px solid ${on ? (warn ? 'var(--accent)' : 'var(--ink)') : 'var(--line-strong)'}`,
                background: on ? (warn ? 'var(--accent)' : 'var(--ink)') : 'var(--field)',
                color: on ? 'var(--cream)' : 'var(--ink-2)',
                borderRadius: 'var(--radius)',
              }}
            >
              {level.value}
            </button>
          );
        })}
      </span>

      <span style={{ fontSize: 12.5, lineHeight: 1.45, color: shown?.value === 13 ? 'var(--accent)' : 'var(--ink-3)', minHeight: 18 }}>
        {shown ? shown.description : 'Elegí un valor de la escala. Es un tamaño relativo, no horas.'}
      </span>
    </div>
  );
}

function ScaleTable({ selected }: { selected: number | null }) {
  return (
    <div role="table" aria-label="Escala de esfuerzo" style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--line-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '14px 18px 10px' }}>
        <FieldTitle>Tabla de referencia del equipo</FieldTitle>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Misma vara para todos</span>
      </div>
      {EFFORT_SCALE.map((level) => {
        const on = level.value === selected;
        return (
          <div
            key={level.value}
            role="row"
            style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr)', gap: 14, padding: '12px 18px', borderTop: '1px solid var(--line-soft)', background: on ? 'var(--accent-soft)' : 'transparent' }}
          >
            <span role="cell" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: on ? 'var(--accent-ink)' : 'var(--ink)' }}>{level.value}</span>
              <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>pts</span>
            </span>
            <span role="cell" style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.01em', color: on ? 'var(--accent-ink)' : 'var(--ink)' }}>
                {level.magnitude} · {level.gist}
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {level.examples.map((example) => (
                  <span key={example} style={{ fontSize: 12, color: 'var(--ink-2)', background: 'var(--page)', border: '1px solid var(--line)', padding: '3px 9px', borderRadius: 'var(--radius-card)' }}>
                    {example}
                  </span>
                ))}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// "¿Podemos dividirla?": el 13 significa "debería dividirse". No se bloquea: hay
// dos salidas — dividir, o dejarla y dejar dicho por qué.
function SplitBlock({
  card,
  readOnly,
  saving,
  onJustify,
}: {
  card: CardDetail;
  readOnly: boolean;
  saving: boolean;
  onJustify: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [dividing, setDividing] = useState(false);
  const [note, setNote] = useState(card.effortNote ?? '');
  useEffect(() => setNote(card.effortNote ?? ''), [card.effortNote]);
  const justified = !!card.effortNote;
  const ink = justified ? 'var(--ink-2)' : 'var(--accent-ink)';

  return (
    <div
      data-split
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        padding: '15px 18px',
        borderBottom: '1px solid var(--line-soft)',
        background: justified ? 'var(--row-hover)' : 'var(--accent-soft)',
      }}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="1.8" style={{ flex: 'none', marginTop: 2 }}>
        <path d="M12 3v6M12 21v-6M12 9l6-4M12 9L6 5M12 15l6 4M12 15l-6 4" />
      </svg>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: justified ? 'var(--ink)' : 'var(--accent-ink)' }}>
          {justified ? 'Se deja en 13' : '¿Podemos dividirla?'}
        </span>
        {justified && !editing ? (
          <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
            <strong style={{ fontWeight: 600 }}>Justificación:</strong> {card.effortNote}
          </span>
        ) : (
          <span style={{ fontSize: 13, lineHeight: 1.5, color: ink }}>
            13 puntos no es una estimación: es la señal de que la tarjeta no debería ejecutarse como una sola tarea. Partila en piezas de 5 o menos antes de
            asignarla.
          </span>
        )}

        {editing && (
          <>
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="¿Por qué no se puede dividir? Queda registrado en la actividad del proyecto."
              style={{ fontFamily: 'var(--sans)', fontSize: 13.5, padding: '9px 10px', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)', background: 'var(--field)', resize: 'vertical', color: 'var(--ink)' }}
            />
            <span style={{ display: 'flex', gap: 9 }}>
              <Button
                variant="primary"
                disabled={!note.trim() || saving}
                onClick={() => {
                  onJustify(note);
                  setEditing(false);
                }}
              >
                Guardar justificación
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setNote(card.effortNote ?? '');
                  setEditing(false);
                }}
              >
                Cancelar
              </Button>
            </span>
          </>
        )}

        {!editing && !readOnly && (
          <span style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            {card.canDivide && (
              <button type="button" onClick={() => setDividing(true)} style={splitButton(true)}>
                Dividir en subtareas
              </button>
            )}
            <button type="button" onClick={() => setEditing(true)} style={splitButton(false)}>
              {justified ? 'Editar justificación' : 'Dejar en 13 y justificar'}
            </button>
          </span>
        )}
      </span>
      {dividing && <DivideCardModal card={card} onClose={() => setDividing(false)} />}
    </div>
  );
}

const splitButton = (primary: boolean) =>
  ({
    fontFamily: 'var(--sans)',
    fontSize: 13,
    fontWeight: primary ? 600 : 500,
    color: primary ? 'var(--cream)' : 'var(--accent-ink)',
    background: primary ? 'var(--accent)' : 'transparent',
    border: `1px solid ${primary ? 'var(--accent)' : 'var(--accent-line)'}`,
    padding: '9px 15px',
    cursor: 'pointer',
    borderRadius: 'var(--radius)',
  }) as const;

// ── Avance ───────────────────────────────────────────────────────────────

function ProgressPicker({ card, readOnly, onPick }: { card: CardDetail; readOnly: boolean; onPick: (value: number) => void }) {
  // Al pasar o enfocar una etapa se muestra su definición (sin elegirla): la
  // persona decide por la frase, no por el número.
  const [preview, setPreview] = useState<number | null>(null);
  const current = Math.max(0, PROGRESS_STAGES.findIndex((s) => s.value === card.progress));
  const shown = progressStage(preview ?? card.progress) ?? PROGRESS_STAGES[0]!;
  const previewing = preview !== null && preview !== card.progress;

  // Lo que pasaría al elegirla (la invariante mueve la tarjeta de columna).
  const last = card.columns[card.columns.length - 1]!;
  const penultimate = card.columns[card.columns.length - 2] ?? last;
  const inLast = card.column.id === last.id;
  const consequence = !previewing
    ? null
    : shown.value === 100 && !inLast
      ? `Al elegirla la tarjeta pasa a «${last.name}» y cuenta como hecha.`
      : shown.value < 100 && inLast
        ? `Al elegirla la tarjeta sale de «${last.name}» y vuelve a «${penultimate.name}».`
        : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '15px 18px' }}>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <FieldTitle>Avance</FieldTitle>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>{progressStage(card.progress)?.name}</span>
      </span>

      <span role="radiogroup" aria-label="Avance" style={{ display: 'flex', alignItems: 'center' }}>
        {PROGRESS_STAGES.map((stage, i) => {
          const done = i <= current;
          const on = i === current;
          const dot = on ? 15 : 11;
          return (
            <button
              key={stage.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={readOnly}
              onClick={() => !on && onPick(stage.value)}
              onMouseEnter={() => setPreview(stage.value)}
              onMouseLeave={() => setPreview(null)}
              onFocus={() => setPreview(stage.value)}
              onBlur={() => setPreview(null)}
              title={`${stage.value}% · ${stage.name}`}
              style={{
                fontFamily: 'var(--sans)',
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                background: 'transparent',
                border: 0,
                padding: 0,
                cursor: readOnly || on ? 'default' : 'pointer',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', width: '100%', height: 15 }}>
                <span style={{ height: 3, flex: 1, background: i === 0 ? 'transparent' : i <= current ? 'var(--ink)' : 'var(--line)' }} />
                <span
                  style={{
                    width: dot,
                    height: dot,
                    flex: 'none',
                    borderRadius: '50%',
                    boxSizing: 'border-box',
                    border: `2px solid ${done ? (on ? 'var(--accent)' : 'var(--ink)') : 'var(--neutral)'}`,
                    background: done ? (on ? 'var(--accent)' : 'var(--ink)') : 'var(--card)',
                  }}
                />
                <span style={{ height: 3, flex: 1, background: i === PROGRESS_STAGES.length - 1 ? 'transparent' : i < current ? 'var(--ink)' : 'var(--line)' }} />
              </span>
              <span style={{ fontSize: 13, fontWeight: on ? 700 : 500, color: on ? 'var(--ink)' : done ? 'var(--ink-2)' : 'var(--ink-4)' }}>{stage.value}%</span>
            </button>
          );
        })}
      </span>

      <span
        aria-live="polite"
        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--page)', border: '1px solid var(--line)', padding: '11px 13px', borderRadius: 'var(--radius-card)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.8" style={{ flex: 'none', marginTop: 2 }}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7.6v.5" />
        </svg>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>
            {previewing && <strong style={{ fontWeight: 600 }}>{shown.name}: </strong>}
            {shown.definition}
          </span>
          {consequence && <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>{consequence}</span>}
        </span>
      </span>
    </div>
  );
}
