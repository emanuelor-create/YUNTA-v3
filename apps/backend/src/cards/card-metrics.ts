/// Definiciones de métricas de tarjetas que se muestran en más de una
/// pantalla (Proyecto → Resumen, Usuarios, Dashboard). Viven en un solo lugar
/// para que un mismo número no pueda calcularse de dos maneras: si una
/// pantalla dice "vencen pronto" o "cerradas en 7 días", es esta definición.

/// SOLO CUENTAN LAS HOJAS. Una tarjeta con subtareas es un contenedor y no entra
/// en ninguna métrica —ni puntos, ni avance, ni conteos, ni carga—: cuentan sus
/// hijas. Una tarjeta sin hijas es una hoja, así que sin subtareas nada cambia.
/// Es el filtro que llevan TODAS las consultas que cuentan tarjetas (proyecto,
/// stats, Dashboard, Usuarios, snapshots): una consulta nueva que cuente
/// tarjetas y no lo incluya duplica el trabajo de cada tarjeta dividida.
export const LEAF = { children: { none: {} } } as const;

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DUE_SOON_HORIZON_DAYS = 7;

interface DueCard {
  completedAt: Date | null;
  dueDate: Date | null;
}

/// Abierta con fecha entre ahora y ahora + 7 días. Una tarjeta ya vencida
/// (dueDate < now) no es "vence pronto": es vencida.
export function isDueSoon(card: DueCard, now: Date): boolean {
  const horizon = new Date(now.getTime() + DUE_SOON_HORIZON_DAYS * DAY_MS);
  return card.completedAt === null && card.dueDate !== null && card.dueDate >= now && card.dueDate <= horizon;
}

export function isOverdue(card: DueCard, now: Date): boolean {
  return card.completedAt === null && card.dueDate !== null && card.dueDate < now;
}

/// Lo que el tablero y el detalle pintan junto a la fecha: vencida (acento),
/// próxima (los 7 días de "vence pronto") o nada. Sale de las mismas dos
/// definiciones de arriba, no de una tercera.
export function dueState(card: DueCard, now: Date): 'overdue' | 'soon' | null {
  if (isOverdue(card, now)) return 'overdue';
  if (isDueSoon(card, now)) return 'soon';
  return null;
}

export function isCompletedSince(card: { completedAt: Date | null }, since: Date): boolean {
  return card.completedAt !== null && card.completedAt >= since;
}

/// Abiertas y vencidas por usuario a partir de sus asignaciones a tarjetas
/// abiertas. Es el "Tareas / N vencidas" de la grilla de Usuarios y la
/// "Carga del equipo" del Dashboard: la misma cuenta.
export function tallyOpenAssignments(
  assignments: { userId: string; card: { dueDate: Date | null } }[],
  now: Date,
): { open: Map<string, number>; overdue: Map<string, number> } {
  const open = new Map<string, number>();
  const overdue = new Map<string, number>();
  for (const { userId, card } of assignments) {
    open.set(userId, (open.get(userId) ?? 0) + 1);
    if (card.dueDate && card.dueDate < now) {
      overdue.set(userId, (overdue.get(userId) ?? 0) + 1);
    }
  }
  return { open, overdue };
}
