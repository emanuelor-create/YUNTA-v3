-- Fix de 20260917202812: dentro de un CASE, un literal de texto ya no es
-- "unknown" (el tipo que Postgres coerciona solo al tipo de la columna
-- destino) sino que queda resuelto como `text`. Sin el cast explícito a
-- "UserStatus", el INSERT del trigger fallaba con:
--   column "status" is of type "UserStatus" but expression is of type text
-- y GoTrue lo reportaba, otra vez, como "Database error creating new user".

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public."User" (id, email, name, role, status, "createdAt", "updatedAt")
  VALUES (
    NEW.id::text,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    'DEVELOPER',
    (CASE WHEN NEW.email_confirmed_at IS NULL THEN 'PENDING' ELSE 'ACTIVE' END)::"UserStatus",
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
