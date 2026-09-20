import type { Request } from 'express';

/// Lo que dice el AuthGuard: quién es el que llama, según el JWT de Supabase.
export interface AuthenticatedUser {
  userId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthenticatedUser;
}
