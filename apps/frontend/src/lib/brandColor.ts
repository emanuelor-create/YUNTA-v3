// El color de un proyecto se guarda en la base como uno de los 5 hex de la
// marca terracota (CreateProjectModal / backend). Al dibujarlo se traduce a la
// variable equivalente, para que siga a la paleta activa (lib/palette.ts):
// "Terracota" pasa a ser el azul en la paleta azul, "Arcilla" el teal, etc.
const BRAND_TO_TOKEN: Record<string, string> = {
  '#1b1917': 'var(--ink)',
  '#b4552f': 'var(--accent)',
  '#8a5a2b': 'var(--clay)',
  '#5c564d': 'var(--stone)',
  '#8a8378': 'var(--ink-3)',
};

export function paletteColor(hex: string | null | undefined): string {
  if (!hex) return 'var(--neutral)';
  return BRAND_TO_TOKEN[hex.toLowerCase()] ?? hex;
}
