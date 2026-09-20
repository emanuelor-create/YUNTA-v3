-- Sincroniza auth.users (Supabase Auth) con public."User" (ARCHITECTURE.md §4,
-- "el webhook que hace falta"). Camino elegido: database trigger, el más
-- simple de los dos que propone el documento.
--
-- Cuando alguien se registra o acepta una invitación, Supabase crea la fila en
-- auth.users pero public."User" no se entera. Este trigger la crea:
-- PENDING mientras auth.users.email_confirmed_at sea NULL, ACTIVE apenas se
-- confirma. Rol global por defecto: DEVELOPER (el menos privilegiado); un
-- admin lo ajusta después vía PATCH /users/:id.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public."User" (id, email, name, role, status, "createdAt", "updatedAt")
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    'DEVELOPER',
    CASE WHEN NEW.email_confirmed_at IS NULL THEN 'PENDING' ELSE 'ACTIVE' END,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Cuando confirma el email, el perfil pasa de PENDING a ACTIVE.
CREATE OR REPLACE FUNCTION public.handle_auth_user_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    UPDATE public."User"
    SET status = 'ACTIVE', "updatedAt" = NOW()
    WHERE id = NEW.id AND status = 'PENDING';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_confirmed();
