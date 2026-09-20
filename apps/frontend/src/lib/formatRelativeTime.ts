// README.md, "Convenciones que ganan sobre el prototipo": fechas relativas
// derivadas del timestamp real, formato "hace 5 min" / "hace 3 h" / "hace 75 d".
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—';

  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Primera línea de "Última actividad" en la grilla de usuarios: fecha corta
// ("12 jun"), sin año. La segunda línea es formatRelativeTime del mismo dato.
export function formatShortDate(iso: string | null): string {
  if (!iso) return 'Nunca';
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS_ES[date.getMonth()]}`;
}

// "Entrega" en la grilla de Proyectos: fecha completa con año ("18 sep 2026").
export function formatFullDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS_ES[date.getMonth()]} ${date.getFullYear()}`;
}
