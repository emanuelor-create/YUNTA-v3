import type { CSSProperties } from 'react';

// Isologo (buey con la Y calada) tal como está en el handoff de diseño —
// no redibujado. Pensado para uso "invertido" (marca clara sobre fondo
// oscuro): el corte de la Y usa var(--ink), que coincide con ese fondo.
export function YuntaMark({ size = 44, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={style}>
      <path d="M7 3 C0 26 8 42 28 48 L39 38 C23 33 12 20 7 3 Z" fill="var(--cream)" />
      <path d="M93 3 C100 26 92 42 72 48 L61 38 C77 33 88 20 93 3 Z" fill="var(--cream)" />
      <path d="M34 44 C27 45 19 48 14 54 C20 58 29 57 35 53 Z" fill="var(--cream)" />
      <path d="M66 44 C73 45 81 48 86 54 C80 58 71 57 65 53 Z" fill="var(--cream)" />
      <path
        d="M50 29 C39 28 32 34 31 43 C30 53 33 59 35 66 C37 74 38 80 41 86 C44 92 56 92 59 86 C62 80 63 74 65 66 C67 59 70 53 69 43 C68 34 61 28 50 29 Z"
        fill="var(--cream)"
      />
      <path
        d="M7 3 C8 22 18 38 31 46 C39 50 45 56 47 65 L50 88 L53 65 C55 56 61 50 69 46 C82 38 92 22 93 3 C86 22 76 38 66 42 C58 46 53 52 51 61 L50 62 L49 61 C47 52 42 46 34 42 C24 38 14 22 7 3 Z"
        fill="var(--ink)"
      />
    </svg>
  );
}

export function YuntaWordmark({ style }: { style?: CSSProperties }) {
  return (
    <span
      style={{
        fontSize: 23,
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--cream)',
        ...style,
      }}
    >
      Yunta
    </span>
  );
}
