import { PriorityBadge } from '../../components/ui';

/// Prioridad de una tarjeta. `null` es "sin clasificar": un estado legítimo,
/// no hay default (un default de MEDIA diría algo que nadie decidió).
export type CardPriority = 'ALTA' | 'MEDIA' | 'BAJA';

export const PRIORITY_LABEL: Record<CardPriority, string> = { ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' };

/// Solo las que llevan tinta. BAJA no tiene estilo a propósito: no se gasta
/// tinta en decir que algo es normal. (Los tokens `--accent-bg` / `--surface-2`
/// del diseño original acá son `--accent-soft` / `--neutral-soft`.)
export const PRIORITY_STYLE: Partial<Record<CardPriority, { bg: string; fg: string }>> = {
  ALTA: { bg: 'var(--accent-soft)', fg: 'var(--accent-ink)' },
  MEDIA: { bg: 'var(--neutral-soft)', fg: 'var(--ink-2)' },
};

/// ¿Esta prioridad se dibuja? Baja y sin clasificar no llevan badge; quien
/// arma una fila alrededor del badge tiene que saberlo, o reserva un hueco vacío.
export const showsPriorityBadge = (priority: CardPriority | null): boolean => !!priority && !!PRIORITY_STYLE[priority];

/// Badge rectangular (no pill) junto al título. Alta en acento, Media en
/// neutro, Baja y sin clasificar sin badge. Lo usan Tu día, Próximas a vencer
/// y —cuando exista— la tarjeta del tablero.
export function CardPriorityBadge({ priority }: { priority: CardPriority | null }) {
  const style = priority ? PRIORITY_STYLE[priority] : undefined;
  if (!priority || !style) return null;
  return (
    <PriorityBadge
      priority={style}
      label={PRIORITY_LABEL[priority]}
      style={{ borderRadius: 'var(--radius-tick)', padding: '2px 7px', fontSize: 11.5, flex: 'none', whiteSpace: 'nowrap' }}
    />
  );
}
