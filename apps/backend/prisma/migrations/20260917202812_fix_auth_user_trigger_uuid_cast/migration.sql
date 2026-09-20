-- Fix de la migración 20260917202426_auth_user_sync_trigger: NEW.id llega
-- como uuid desde auth.users, pero public."User".id es text (Prisma:
-- `String @id`, sin @db.Uuid). Sin el cast explícito, el INSERT dentro del
-- trigger fallaba y GoTrue lo reportaba como "Database error creating new
-- user" al crear cualquier usuario.

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
    CASE WHEN NEW.email_confirmed_at IS NULL THEN 'PENDING' ELSE 'ACTIVE' END,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

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
    WHERE id = NEW.id::text AND status = 'PENDING';
  END IF;

  RETURN NEW;
END;
$$;
