import { createClient } from '@supabase/supabase-js';

// Publishable/anon key: solo para Auth (login, sesión, reset de contraseña).
// Los datos de negocio se leen y escriben únicamente vía la API (apiClient.ts).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
