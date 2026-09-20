import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/apiClient';
import type { CardPriority } from '../board/priority';

export interface DashboardCard {
  id: string;
  title: string;
  dueDate: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  client: string | null;
  priority: CardPriority | null;
}

// Espejo de `Dashboard` en apps/backend/src/dashboard/dashboard.service.ts.
export interface Dashboard {
  scope: { projectCount: number };
  me: {
    assigned: number;
    overdue: number;
    dueSoon: number;
    closed: { total: number; previous: number; byDay: number[] };
    // Series de UserDailySnapshot; null hasta que haya 7 días cerrados seguidos.
    history: { assigned: number[]; overdue: number[]; dueSoon: number[] } | null;
  };
  today: (DashboardCard & { completed: boolean; canEdit: boolean })[];
  status: { todo: number; inProgress: number; done: number };
  upcoming: {
    total: number;
    days: { date: string; count: number; cards: (DashboardCard & { assignees: { id: string; name: string }[] })[] }[];
  };
  rhythm: { endsAt: string; closed: number }[];
  workload: { userId: string; name: string; openCount: number }[];
}

// GET /dashboard: una sola llamada. El offset del navegador le dice al
// backend cuál es "hoy" y cómo agrupar por día; las ventanas de 7 días son de
// 24 h corridas, iguales a las de cada proyecto.
export function useDashboard() {
  const tzOffset = new Date().getTimezoneOffset();
  return useQuery({
    queryKey: ['dashboard', tzOffset],
    queryFn: () => apiFetch<Dashboard>(`/dashboard?tzOffset=${tzOffset}`),
  });
}

// Checkbox de "Tu día": cerrar = 100, reabrir = 75 (la misma tabla de casos
// que el resto del sistema: 100 vive en la última columna).
export function useToggleCardDone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, done }: { cardId: string; done: boolean }) =>
      apiFetch(`/cards/${cardId}/progress`, { method: 'PATCH', body: JSON.stringify({ progress: done ? 100 : 75 }) }),
    onSuccess: () => {
      // Cerrar una tarjeta mueve números en el Dashboard, en la grilla y en el
      // Resumen del proyecto: todo lo que cuelga de ['projects'] y ['dashboard'].
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
