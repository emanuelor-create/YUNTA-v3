import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/apiClient';

export type ProjectMemberRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export interface ProjectDetail {
  id: string;
  name: string;
  client: string | null;
  description: string | null;
  color: string;
  isFavorite: boolean;
  startDate: string | null;
  endDate: string | null;
  archivedAt: string | null;
  taskCount: number;
  doneCount: number;
  members: { userId: string; name: string; email: string; role: ProjectMemberRole; openCount: number }[];
}

export interface ProjectStats {
  cards: { total: number; completed: number };
  byColumn: { columnId: string; name: string; count: number }[];
  byProgress: Record<'0' | '25' | '50' | '75' | '100', number>;
  points: { total: number; completed: number; avg: number; toSplit: number };
  window: { completed: number; updated: number; created: number; dueSoon: number };
}

export interface ActivityEntry {
  id: string;
  type: string;
  message: string;
  cardId: string | null;
  cardTitle: string | null;
  createdAt: string;
  user: { id: string; name: string };
}

export function useProjectDetail(projectId: string) {
  return useQuery({
    queryKey: ['projects', 'detail', projectId],
    queryFn: () => apiFetch<ProjectDetail>(`/projects/${projectId}`),
  });
}

export function useProjectStats(projectId: string) {
  return useQuery({
    queryKey: ['projects', 'stats', projectId],
    queryFn: () => apiFetch<ProjectStats>(`/projects/${projectId}/stats`),
  });
}

export function useProjectActivity(projectId: string) {
  return useQuery({
    queryKey: ['projects', 'activity', projectId],
    queryFn: () => apiFetch<ActivityEntry[]>(`/projects/${projectId}/activity`),
  });
}

export function useAddMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: ProjectMemberRole }) =>
      apiFetch(`/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export interface UpdateProjectInput {
  name?: string;
  client?: string | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) =>
      apiFetch<ProjectDetail>(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      // El nombre/cliente también viven en el sidebar y en la grilla.
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useArchiveProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archived: boolean) =>
      apiFetch(`/projects/${projectId}/archive`, { method: archived ? 'POST' : 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useDeleteProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/projects/${projectId}`, { method: 'DELETE' }),
    onSuccess: () => {
      // removeQueries, no invalidate: refrescar el detalle de un proyecto que
      // ya no existe devolvería 404 antes de que la navegación lo desmonte.
      queryClient.removeQueries({ queryKey: ['projects', 'detail', projectId] });
      queryClient.removeQueries({ queryKey: ['projects', 'stats', projectId] });
      queryClient.removeQueries({ queryKey: ['projects', 'activity', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

/// "Cambiar" responsable: promueve al nuevo a OWNER y después baja al actual a
/// EDITOR. En ese orden a propósito — el backend rechaza dejar al proyecto sin
/// OWNER (assertNotLastOwner), y si falla la segunda llamada quedan dos OWNER,
/// que es un estado válido, no uno roto.
export function useChangeOwner(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ newOwnerId, currentOwnerId }: { newOwnerId: string; currentOwnerId: string | null }) => {
      await apiFetch(`/projects/${projectId}/members/${newOwnerId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'OWNER' }),
      });
      if (currentOwnerId && currentOwnerId !== newOwnerId) {
        await apiFetch(`/projects/${projectId}/members/${currentOwnerId}`, {
          method: 'PATCH',
          body: JSON.stringify({ role: 'EDITOR' }),
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useRemoveMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
