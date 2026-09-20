import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/apiClient';

export interface ProjectSummary {
  id: string;
  name: string;
  client: string | null;
  color: string;
  isFavorite: boolean;
  startDate: string | null;
  endDate: string | null;
  taskCount: number;
  doneCount: number;
  team: { id: string; name: string }[];
}

// GET /projects: los proyectos donde el usuario es miembro.
export function useProjects(includeArchived = false) {
  return useQuery({
    queryKey: ['projects', { archived: includeArchived }],
    queryFn: () => apiFetch<ProjectSummary[]>(`/projects${includeArchived ? '?archived=true' : ''}`),
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, isFavorite }: { projectId: string; isFavorite: boolean }) =>
      apiFetch(`/projects/${projectId}/favorite`, { method: isFavorite ? 'POST' : 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export interface CreateProjectInput {
  name: string;
  client?: string | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  color?: string;
}

// POST /projects (ADMIN o PM): el creador queda OWNER y el tablero nace con
// las cuatro columnas por defecto.
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      apiFetch<{ id: string; key: string; name: string }>('/projects', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      // Sidebar, grilla y Dashboard cuentan proyectos.
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
