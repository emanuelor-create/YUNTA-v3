import { useEffect, useState } from 'react';
import { Button, Label } from '../../components/ui';
import { ApiError } from '../../lib/apiClient';
import { EFFORT_SCALE, effortLevel, examplesText, PROGRESS_STAGES, progressStage } from './effortProgress';
import { DivideCardModal } from './DivideCardModal';
import { CardDetail, useSetProgress, useSetStoryPoints } from './useBoard';

/// "Esfuerzo y avance": los dos sectores de medición del detalle. Sin horas —
/// acá no se mide tiempo—: el avance es una etapa con nombre, el esfuerzo es un
/// tamaño relativo de una escala.
export function EffortProgressSection({ card, readOnly }: { card: CardDetail; readOnly: boolean }) {
  const setProgress = useSetProgress(card.id);
  const setPoints = useSetStoryPoints(card.id);
  const error = [setProgress, setPoints].find((m) => m.isError)?.error;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', background: 'var(--card)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px 0' }}>
        <Label track="0.13em">Esfuerzo y avance</Label>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '16px 18px 20px' }}>
        <ProgressPicker card={card} readOnly={readOnly} onPick={(value) => setProgress.mutate(value)} />
        <span style={{ height: 1, background: 'var(--line)' }} />
        <EffortPicker
          card={card}
          readOnly={readOnly}
          saving={setPoints.isPending}
          onPick={(storyPoints, note) => setPoints.mutate({ storyPoints, note })}
        />
        {error && <span style={{ fontSize: 13, color: 'var(--accent-ink)' }}>{error instanceof ApiError ? error.message : 'No se pudo guardar el cambio.'}</span>}
      </div>
    </section>
  );
}

// ── Avance ───────────────────────────────────────────────────────────────

function ProgressPicker({ card, readOnly, onPick }: { card: CardDetail; readOnly: boolean; onPick: (value: number) => void }) {
  // Al pasar o enfocar una etapa se muestra su definición (sin elegirla): la
  // persona decide por la frase, no por el número.
  const [preview, setPreview] = useState<number | null>(null);
  const current = PROGRESS_STAGES.findIndex((s) => s.value === card.progress);
  const shown = progressStage(preview ?? card.progress)!;
  const previewing = preview !== null && preview !== card.progress;

  // Lo que pasaría al elegirla (la invariante mueve la tarjeta de columna).
  const last = card.columns[card.columns.length - 1];
  const penultimate = card.columns[card.columns.length - 2] ?? last;
  const inLast = card.column.id === last.id;
  const consequence =
    !previewing ? null
    : shown.value === 100 && !inLast ? `Al elegirla la tarjeta pasa a «${last.name}» y cuenta como hecha.`
    : shown.value < 100 && inLast ? `Al elegirla la tarjeta sale de «${last.name}» y vuelve a «${penultimate.name}».`
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Label track="0.12em">Avance</Label>

      <div role="radiogroup" aria-label="Avance" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {/* Riel: gris de fondo, tinta hasta la etapa elegida. Las etapas caen al centro de cada quinto. */}
        <span aria-hidden style={{ position: 'absolute', top: 19, left: '10%', right: '10%', height: 2, background: 'var(--line-strong)' }} />
        <span aria-hidden style={{ position: 'absolute', top: 19, left: '10%', width: `${Math.max(0, current) * 20}%`, height: 2, background: 'var(--ink)' }} />

        {PROGRESS_STAGES.map((stage, index) => {
          const chosen = index === current;
          const passed = index < current;
          return (
            <button
              key={stage.value}
              type="button"
              role="radio"
              aria-checked={chosen}
              disabled={readOnly}
              onClick={() => !chosen && onPick(stage.value)}
              onMouseEnter={() => setPreview(stage.value)}
              onMouseLeave={() => setPreview(null)}
              onFocus={() => setPreview(stage.value)}
              onBlur={() => setPreview(null)}
              title={`${stage.value}% · ${stage.name}`}
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 0, background: 'transparent', border: 0, cursor: readOnly || chosen ? 'default' : 'pointer', fontFamily: 'var(--sans)' }}
            >
              <span style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: chosen ? 40 : 26,
                    height: chosen ? 40 : 26,
                    borderRadius: 8,
                    boxSizing: 'border-box',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--cream)',
                    // Elegido: más grande y en acento. Pasados: tinta. Futuros: hueco.
                    background: chosen ? 'var(--accent)' : passed ? 'var(--ink)' : 'var(--card)',
                    border: chosen || passed ? '2px solid transparent' : '2px solid var(--line-strong)',
                  }}
                >
                  {chosen ? `${stage.value}%` : ''}
                </span>
              </span>
              <span style={{ fontSize: 12, lineHeight: 1.25, textAlign: 'center', fontWeight: chosen ? 700 : 500, color: chosen ? 'var(--accent-ink)' : passed ? 'var(--ink)' : 'var(--ink-3)', padding: '0 2px' }}>
                {stage.name}
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: -4, visibility: chosen ? 'hidden' : 'visible' }}>{stage.value}%</span>
            </button>
          );
        })}
      </div>

      {/* Siempre visible: la definición de la etapa elegida (o de la que se está mirando). */}
      <div
        aria-live="polite"
        style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '11px 14px', background: 'var(--row-hover)', borderLeft: `3px solid ${previewing ? 'var(--ink-4)' : 'var(--accent)'}`, borderRadius: 'var(--radius)' }}
      >
        <span style={{ fontSize: 13, fontWeight: 700 }}>
          {shown.name} · {shown.value}%
          {previewing && <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 500, color: 'var(--ink-3)' }}>vista previa</span>}
        </span>
        <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink-2)' }}>{shown.definition}</span>
        {consequence && <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>{consequence}</span>}
      </div>
    </div>
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
  const [showScale, setShowScale] = useState(false);
  const shown = effortLevel(preview ?? card.storyPoints);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Label track="0.12em">Esfuerzo</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {card.storyPoints !== null && !readOnly && (
            <button
              type="button"
              onClick={() => onPick(null)}
              disabled={saving}
              style={{ fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--ink-3)', background: 'transparent', border: 0, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Quitar estimación
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowScale((v) => !v)}
            aria-expanded={showScale}
            style={{ fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)', padding: '5px 10px', cursor: 'pointer' }}
          >
            {showScale ? 'Ocultar escala' : 'Ver escala'}
          </button>
        </div>
      </div>

      <div role="radiogroup" aria-label="Esfuerzo" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        {EFFORT_SCALE.map((level) => {
          const selected = card.storyPoints === level.value;
          const big = level.value === 13; // el 13 va en acento, no en tinta
          return (
            <button
              key={level.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={readOnly || saving}
              onClick={() => !selected && onPick(level.value)}
              onMouseEnter={() => setPreview(level.value)}
              onMouseLeave={() => setPreview(null)}
              onFocus={() => setPreview(level.value)}
              onBlur={() => setPreview(null)}
              title={`${level.value} · ${level.magnitude}`}
              style={{
                width: 44,
                height: 44,
                fontFamily: 'var(--sans)',
                fontSize: 16,
                fontWeight: 700,
                borderRadius: 'var(--radius)',
                cursor: readOnly || selected ? 'default' : 'pointer',
                color: selected ? 'var(--cream)' : big ? 'var(--accent)' : 'var(--ink)',
                background: selected ? (big ? 'var(--accent)' : 'var(--ink)') : 'var(--field)',
                border: `1px solid ${selected ? (big ? 'var(--accent)' : 'var(--ink)') : big ? 'var(--accent-line)' : 'var(--line-strong)'}`,
              }}
            >
              {level.value}
            </button>
          );
        })}
        <span style={{ marginLeft: 6, fontSize: 14, fontWeight: 700, color: shown?.value === 13 ? 'var(--accent-ink)' : 'var(--ink)' }}>
          {shown ? shown.magnitude : 'Sin estimar'}
        </span>
      </div>

      <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink-3)', minHeight: 19 }}>
        {shown ? examplesText(shown) : 'Elegí un valor de la escala. Es un tamaño relativo, no horas.'}
      </span>

      {showScale && <ScaleTable selected={card.storyPoints} />}

      {card.storyPoints === 13 && <SplitBlock card={card} readOnly={readOnly} saving={saving} onJustify={(note) => onPick(13, note)} />}
    </div>
  );
}

function ScaleTable({ selected }: { selected: number | null }) {
  return (
    <div role="table" aria-label="Escala de esfuerzo" style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--field)' }}>
      {EFFORT_SCALE.map((level, i) => {
        const big = level.value === 13;
        return (
          <div
            key={level.value}
            role="row"
            style={{ display: 'grid', gridTemplateColumns: '34px 96px minmax(0,1fr)', gap: 12, alignItems: 'start', padding: '10px 12px', borderTop: i === 0 ? undefined : '1px solid var(--line-soft)', background: selected === level.value ? 'var(--row-sel)' : undefined }}
          >
            <span role="cell" style={{ fontSize: 15, fontWeight: 700, color: big ? 'var(--accent)' : 'var(--ink)' }}>{level.value}</span>
            <span role="cell" style={{ fontSize: 13, fontWeight: 600, color: big ? 'var(--accent-ink)' : 'var(--ink)' }}>{level.magnitude}</span>
            <span role="cell" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12.5, lineHeight: 1.4 }}>
              <span style={{ color: 'var(--ink-2)' }}>{level.description}</span>
              <span style={{ color: 'var(--ink-3)' }}>{examplesText(level)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// "¿Podemos dividirla?": el 13 significa "debería dividirse" (BACKEND.md §2). No se
// bloquea: hay dos salidas — dividir, o dejarlo y dejar dicho por qué.
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '13px 14px',
        borderRadius: 'var(--radius)',
        background: justified ? 'var(--row-hover)' : 'var(--accent-soft)',
        border: `1px solid ${justified ? 'var(--line)' : 'var(--accent-line)'}`,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 700, color: justified ? 'var(--ink)' : 'var(--accent-ink)' }}>
        {justified ? 'Se deja en 13' : '¿Podemos dividirla?'}
      </span>

      {justified && !editing ? (
        <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink-2)' }}>
          <strong style={{ fontWeight: 600 }}>Justificación:</strong> {card.effortNote}
        </span>
      ) : (
        <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink-2)' }}>
          Una tarjeta de 13 suele esconder varias. Dividirla hace el avance más medible: cada parte se cierra por separado.
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
            style={{ fontFamily: 'var(--sans)', fontSize: 13.5, padding: '9px 10px', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)', background: 'var(--field)', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
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
            <Button variant="ghost" onClick={() => { setNote(card.effortNote ?? ''); setEditing(false); }}>
              Cancelar
            </Button>
          </div>
        </>
      )}

      {!editing && !readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {card.canDivide && (
            <Button variant="ghost" onClick={() => setDividing(true)}>
              Dividir en subtareas
            </Button>
          )}
          <Button variant={justified ? 'ghost' : 'primary'} onClick={() => setEditing(true)}>
            {justified ? 'Editar justificación' : 'Dejar en 13 y justificar'}
          </Button>
        </div>
      )}
      {dividing && <DivideCardModal card={card} onClose={() => setDividing(false)} />}
    </div>
  );
}

