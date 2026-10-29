import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

// Piezas del detalle de tarjeta (Yunta-Tarjeta-Detalle.html): el bloque con su
// encabezado ("ESTADO Y PROPIEDADES ───── [acción]"), los rótulos de campo y los
// botones chicos. Todo con variables: sigue a la paleta activa.

/// Rótulo de bloque: 10.5px, mayúsculas, 0.16em.
export function SectionTitle({ children, color = 'var(--ink-3)' }: { children: ReactNode; color?: string }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color, whiteSpace: 'nowrap' }}>{children}</span>
  );
}

/// Rótulo de campo dentro de un bloque: 10.5px, mayúsculas, 0.13em.
export function FieldTitle({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{children}</span>;
}

/// Bloque con borde y esquinas redondeadas. `extra` va pegado al título (un
/// contador) y `action` a la derecha de la línea (un botón chico).
export function Panel({
  title,
  extra,
  action,
  children,
  style,
  'data-panel': dataPanel,
}: {
  title: string;
  extra?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  'data-panel'?: string;
}) {
  return (
    <section data-panel={dataPanel} style={{ border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 'var(--radius-card)', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px 11px', borderBottom: '1px solid var(--line)', minHeight: 20 }}>
        <SectionTitle>{title}</SectionTitle>
        {extra}
        <span style={{ height: 1, background: 'var(--line-soft)', flex: 1 }} />
        {action}
      </div>
      {children}
    </section>
  );
}

/// Botón chico con borde ("Ver escala", "Editar", "Añadir").
export function SmallButton({
  children,
  onClick,
  disabled,
  title,
  ariaExpanded,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  ariaExpanded?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const on = hover && !disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-expanded={ariaExpanded}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: 'var(--sans)',
        fontSize: 12.5,
        fontWeight: 500,
        color: on ? 'var(--ink)' : 'var(--ink-2)',
        background: 'transparent',
        border: `1px solid ${on ? 'var(--ink)' : 'var(--line-strong)'}`,
        padding: '5px 12px',
        cursor: disabled ? 'default' : 'pointer',
        flex: 'none',
        borderRadius: 'var(--radius)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

/// Campo de texto / fecha / select del detalle.
export const DETAIL_FIELD: CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 14,
  color: 'var(--ink)',
  background: 'var(--field)',
  border: '1px solid var(--line-strong)',
  padding: '9px 11px',
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 'var(--radius)',
};

/// Punto de color de una columna del tablero: la primera en neutro, la última
/// ("hecho") en verde, las del medio en las categorías de la paleta. Lo usan el
/// selector de estado del detalle, el Backlog y el Tablero.
export function columnDot(index: number, total: number): string {
  if (index === total - 1) return 'var(--ok)';
  if (index === 0) return 'var(--neutral)';
  const middle = ['var(--accent)', 'var(--clay)', 'var(--stone)'];
  return middle[(index - 1) % middle.length]!;
}

export type LabelTone = 'ACCENT' | 'NEUTRAL' | 'PLAIN';

/// Los tres tonos de etiqueta del diseño ("Diseño" en acento, "Checkout" en neutro, "QA" claro).
export const LABEL_TONE_STYLE: Record<LabelTone, { bg: string; fg: string; bc: string }> = {
  ACCENT: { bg: 'var(--accent-soft)', fg: 'var(--accent-ink)', bc: 'var(--accent-line)' },
  NEUTRAL: { bg: 'var(--neutral-soft)', fg: 'var(--ink-2)', bc: 'var(--line-x-soft)' },
  PLAIN: { bg: 'var(--card)', fg: 'var(--ink-3)', bc: 'var(--line)' },
};

/// Pill de etiqueta. Con `onRemove` lleva su ×.
export function LabelPill({
  name,
  tone,
  onRemove,
  size = 'md',
}: {
  name: string;
  tone: LabelTone;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}) {
  const style = LABEL_TONE_STYLE[tone];
  return (
    <span
      data-label={name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        background: style.bg,
        color: style.fg,
        border: `1px solid ${style.bc}`,
        fontSize: size === 'sm' ? 11.5 : 12.5,
        fontWeight: 500,
        padding: size === 'sm' ? '2px 8px' : '5px 10px',
        borderRadius: 'var(--radius-pill)',
        whiteSpace: 'nowrap',
      }}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Quitar"
          aria-label={`Quitar la etiqueta ${name}`}
          style={{ fontFamily: 'var(--sans)', fontSize: 12, lineHeight: 1, color: 'inherit', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', opacity: 0.6 }}
        >
          ×
        </button>
      )}
    </span>
  );
}
