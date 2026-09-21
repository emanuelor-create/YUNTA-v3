import { Avatar } from '../../components/Avatar';
import { Label } from '../../components/ui';
import { PROGRESS_STAGES, progressStage } from './effortProgress';
import type { CardDetail } from './useBoard';

/// Lo que reemplaza a "Esfuerzo y avance" en una tarjeta dividida: el contenedor
/// no tiene medición propia, se lee de sus subtareas (la regla: solo cuentan las hojas).
export function SubtasksSection({ card, onOpen }: { card: CardDetail; onOpen: (cardId: string) => void }) {
  const done = card.subtasks.filter((s) => s.completed).length;
  const points = card.subtasks.reduce((total, s) => total + (s.storyPoints ?? 0), 0);
  const stage = progressStage(card.progress);

  return (
    <section data-subtasks style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', background: 'var(--card)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px 0' }}>
        <Label track="0.13em">Subtareas</Label>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)' }}>
          {card.subtasks.length} subtareas · {done} {done === 1 ? 'hecha' : 'hechas'}
        </span>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 18px 18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
            <span>Avance derivado · {card.progress}%{stage ? ` · ${stage.name}` : ''}</span>
            <span style={{ fontWeight: 500, color: 'var(--ink-3)' }}>{points} de esfuerzo entre las subtareas</span>
          </span>
          <span aria-hidden style={{ display: 'flex', gap: 3 }}>
            {PROGRESS_STAGES.slice(1).map((s) => (
              <span key={s.value} style={{ flex: 1, height: 5, borderRadius: 3, background: card.progress >= s.value ? 'var(--accent)' : 'var(--line-strong)' }} />
            ))}
          </span>
          <span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-3)' }}>
            Esta tarjeta no tiene avance ni esfuerzo propios: se calculan a partir de sus subtareas. Para cambiarlos, abrí una subtarea.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--field)' }}>
          {card.subtasks.map((sub, i) => (
            <button
              key={sub.id}
              type="button"
              data-subtask={sub.code}
              onClick={() => onOpen(sub.id)}
              style={{ display: 'grid', gridTemplateColumns: '72px minmax(0,1fr) auto auto', alignItems: 'center', gap: 12, textAlign: 'left', padding: '10px 12px', background: 'transparent', border: 0, borderTop: i === 0 ? undefined : '1px solid var(--line-soft)', cursor: 'pointer', fontFamily: 'var(--sans)', color: 'var(--ink)' }}
            >
              <span style={{ fontFamily: 'var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 11.5, color: 'var(--ink-3)' }}>{sub.code}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: sub.completed ? 'var(--ink-3)' : 'var(--ink)' }}>{sub.title}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  {sub.column} · {sub.progress}%{sub.storyPoints !== null ? ` · esfuerzo ${sub.storyPoints}` : ' · sin estimar'}
                </span>
              </span>
              <span style={{ display: 'flex' }}>
                {sub.assignees.slice(0, 3).map((person, k) => (
                  <span key={person.id} style={{ marginLeft: k === 0 ? 0 : -6, borderRadius: '50%', border: '2px solid var(--field)', display: 'flex' }} title={person.name}>
                    <Avatar seed={person.id} name={person.name} size={20} />
                  </span>
                ))}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: sub.completed ? 'var(--ink-3)' : 'var(--accent-ink)' }}>{sub.completed ? 'Hecha' : 'Abierta'}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
