import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/apiClient';

export type UserRole = 'ADMIN' | 'PM' | 'DEVELOPER';
export type UserStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE';

export interface UserListItem {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  projectCount: number;
  projects: { id: string; name: string; color: string }[];
  openCount: number;
  overdueCount: number;
  lastActiveAt: string | null;
}

export interface UsersResponse {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UsersFilters {
  page: number;
  q: string;
  role: UserRole | 'ALL';
  status: UserStatus | 'ALL';
}

// Sin VITE_USE_MOCKS: esta pantalla ya asume datos reales (GET /users, paso 7).
export function useUsers(filters: UsersFilters) {
  const params = new URLSearchParams();
  params.set('page', String(filters.page));
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.role !== 'ALL') params.set('role', filters.role);
  if (filters.status !== 'ALL') params.set('status', filters.status);

  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => apiFetch<UsersResponse>(`/users?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
}
