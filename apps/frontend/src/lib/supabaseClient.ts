import { createClient } from '@supabase/supabase-js';

// Se lee ANTES de crear el cliente: Supabase limpia el hash de la URL al
// procesar el link del mail, y el evento PASSWORD_RECOVERY puede emitirse
// antes de que la app se suscriba. Con esto el link de recuperación siempre
// lleva a la pantalla de contraseña nueva.
export const openedFromRecoveryLink =
  typeof window !== 'undefined' && /(^|[#&?])type=recovery(&|$)/.test(window.location.hash);

// Publishable/anon key: solo para Auth (login, sesión, reset de contraseña).
// Los datos de negocio se leen y escriben únicamente vía la API (apiClient.ts).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

/// A dónde vuelve el link del mail de recuperación: la raíz de la app
/// (http://localhost:5173/ en local, https://<usuario>.github.io/<repo>/ en Pages).
/// Tiene que estar en Supabase → Authentication → URL Configuration → Redirect URLs.
export function appRootUrl(): string {
  return window.location.origin + import.meta.env.BASE_URL;
}
