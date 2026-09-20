import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/apiClient';

export interface CurrentUser {
  userId: string;
  email: string;
  profile: {
    id: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'PM' | 'DEVELOPER';
    status: 'ACTIVE' | 'PENDING' | 'INACTIVE';
  } | null;
}

// GET /auth/me — mismo queryKey en todos lados (sidebar, Dashboard) para que
// TanStack Query lo pida una sola vez y lo comparta.
export function useCurrentUser() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetch<CurrentUser>('/auth/me'),
  });
}
