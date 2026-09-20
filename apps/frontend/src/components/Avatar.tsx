import type { CSSProperties } from 'react';
import { AVATAR_PALETTE } from './ui';

// Primera + última inicial ("María Paz Duarte" → "MD"). Ver README.md,
// "Convenciones que ganan sobre el prototipo": el mock del handoff usa las
// dos primeras palabras ("MP"), que es peor para nombres compuestos.
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
}

// Color estable por seed (id o email, no el nombre — un rename no debería
// cambiarle el color a nadie). Paleta de marca (primitives.tsx), no los 8
// colores tipo Trello del repo viejo.
export function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]!;
}

export function Avatar({
  seed,
  name,
  size = 36,
  background,
  style,
}: {
  /** Clave para elegir el color de forma estable (id o email). */
  seed: string;
  name: string;
  size?: number;
  /** Override explícito (ej. gris cuando el usuario está inactivo). */
  background?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: background ?? colorFor(seed),
        color: 'var(--cream)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.36),
        fontWeight: 600,
        flex: 'none',
        ...style,
      }}
    >
      {initials(name)}
    </span>
  );
}
