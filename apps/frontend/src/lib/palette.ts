// Paleta de color por usuario (PALETTE.md). Las paletas están en
// yunta-tokens.css: cambiar `data-palette` en <html> re-mapea todas las
// variables, así que ninguna pantalla necesita saber cuál está activa.
// La guardada se aplica antes del bundle en index.html (sin parpadeo).

export type Palette = 'terracota' | 'azul';

export const PALETTES: { id: Palette; label: string; swatch: string }[] = [
  { id: 'terracota', label: 'Terracota', swatch: '#b4552f' },
  { id: 'azul', label: 'Azul', swatch: '#0b5fff' },
];

const KEY = 'yunta.palette';

export function getStoredPalette(): Palette {
  try {
    const stored = localStorage.getItem(KEY);
    return PALETTES.some((p) => p.id === stored) ? (stored as Palette) : 'terracota';
  } catch {
    return 'terracota';
  }
}

export function applyPalette(palette: Palette) {
  const el = document.documentElement;
  if (palette === 'terracota') delete el.dataset.palette;
  else el.dataset.palette = palette;
  try {
    localStorage.setItem(KEY, palette);
  } catch {
    // Ventana privada u otro bloqueo: la elección dura hasta recargar.
  }
  // El sidebar y el perfil escuchan esto para mostrar la elección actual.
  window.dispatchEvent(new CustomEvent('yunta:appearance'));
}
