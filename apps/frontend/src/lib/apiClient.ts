import { supabase } from './supabaseClient';

const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/// Wrapper de fetch que manda Authorization: Bearer <token> con la sesión
/// vigente de Supabase en cada request a la API. Es el único camino para
/// datos de negocio; supabase-js queda reservado a Auth.
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  // Un FormData (subida de archivos) lleva su propio Content-Type con el boundary:
  // forzar JSON acá rompería el multipart.
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body?.message ?? response.statusText);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
