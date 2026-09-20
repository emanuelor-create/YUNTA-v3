export type StatusKey = 'PLANIFICADO' | 'EN_CURSO' | 'EN_RIESGO' | 'CERRADO';

export const STATUS_LABEL: Record<StatusKey, string> = {
  PLANIFICADO: 'Planificado',
  EN_CURSO: 'En curso',
  EN_RIESGO: 'En riesgo',
  CERRADO: 'Cerrado',
};

// README §3 / statusStyle del mock — 4 tonos, todos ya en la escala de
// tokens (ninguno necesitó un hex nuevo).
export const STATUS_STYLE: Record<StatusKey, { bg: string; fg: string; bc: string; dot: string }> = {
  EN_CURSO: { bg: 'var(--card)', fg: 'var(--ink)', bc: 'var(--line-strong)', dot: 'var(--accent)' },
  EN_RIESGO: { bg: 'var(--accent-soft)', fg: 'var(--accent-ink)', bc: 'var(--accent-line)', dot: 'var(--accent)' },
  CERRADO: { bg: 'var(--neutral-soft)', fg: 'var(--ink-5)', bc: 'var(--line-x-soft)', dot: 'var(--ink-4)' },
  PLANIFICADO: { bg: 'var(--card)', fg: 'var(--ink-2)', bc: 'var(--line)', dot: 'var(--neutral)' },
};

interface StatusInput {
  taskCount: number;
  doneCount: number;
  startDate: string | null;
  endDate: string | null;
}

// BACKEND.md §5: no hay ProjectStatus en la base — se deriva acá, de fechas
// y avance. Simplificación: 4 estados, no reproduzco "En revisión" del mock
// (nada en los datos la distingue de "En curso").
export function deriveStatus(project: StatusInput, now: Date): StatusKey {
  const completed = project.taskCount > 0 && project.doneCount === project.taskCount;
  if (completed) return 'CERRADO';
  if (project.startDate && new Date(project.startDate) > now) return 'PLANIFICADO';
  if (project.endDate && new Date(project.endDate) < now) return 'EN_RIESGO';
  return 'EN_CURSO';
}

export function dueNote(project: { endDate: string | null }, status: StatusKey, now: Date): { text: string; late: boolean } {
  if (status === 'CERRADO') return { text: 'entregado', late: false };
  if (!project.endDate) return { text: 'sin fecha', late: false };
  const days = Math.round((new Date(project.endDate).getTime() - now.getTime()) / 86_400_000);
  if (days > 0) return { text: `en ${days} días`, late: false };
  if (days === 0) return { text: 'vence hoy', late: false };
  return { text: `atrasado ${Math.abs(days)} días`, late: true };
}
