# Deploy de YUNTA

Backend (NestJS + Prisma) en **Railway**, frontend (React + Vite) en **Vercel**,
los dos contra la **misma Supabase** (base, Auth y Storage) que ya se usa en
desarrollo. Node **>= 22.12** en todo (`engines` en la raíz, backend y frontend;
la imagen del backend es `node:22`).

## Por qué el backend NO va en una plataforma que duerme

El backend no es solo una API: corre la **foto diaria** (`@Cron('0 0 * * *')`,
hora de Argentina) que alimenta el historial. Ese cron vive en el proceso y
**no tiene catch-up**: si a medianoche el servicio estaba dormido o caído, ese
día queda sin foto para siempre (un hueco visible a propósito, no se inventa).

- **Render, plan gratuito**: duerme a los 15 min sin tráfico → el cron no corre.
  Sirve solo el plan pago (Starter), que no duerme.
- **Railway**: el servicio queda encendido salvo que se active "App Sleeping"
  (opt-in, **dejarlo apagado**). Es lo que se usa acá.
- Una sola réplica (`numReplicas: 1` en `railway.json`). Con dos, el cron correría
  dos veces; es idempotente (pisa la fila del día) pero no tiene sentido.
- No desplegar cerca de medianoche (hora de Argentina): el reinicio del deploy
  puede comerse la foto de ese día.

## 1. Backend en Railway

1. Nuevo proyecto → *Deploy from GitHub repo* → este repo, rama `main` (o la que
   se use). Railway lee `railway.json` y construye con el `Dockerfile` de la raíz.
2. Variables del servicio (Settings → Variables):

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | Supabase → pooler de transacciones, puerto **6543**, con `?pgbouncer=true` |
   | `DIRECT_URL` | Supabase → pooler de **sesión**, puerto **5432** (IPv4; no la conexión directa `db.<ref>…`) |
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | clave `service_role` (solo backend; nunca en el front) |
   | `CORS_ORIGIN` | URL del front en Vercel, ej. `https://yunta.vercel.app` (sin barra final). **Obligatoria**: sin ella el servicio no arranca |

   No hace falta `PORT` (la inyecta Railway) ni `NODE_ENV` (la imagen la fija).
3. Settings → Networking → *Generate Domain*. Esa URL es la `VITE_API_URL` del front.
4. Cada arranque corre `prisma migrate deploy` (aplica solo lo pendiente) y luego
   el servidor. El healthcheck es `GET /health`.
5. La imagen fija `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1`. Motivo, probado contra
   esta base: detrás del pooler de Supabase, una migración cortada a medias deja
   el advisory lock en una conexión huérfana y todo arranque siguiente falla con
   `P1002`. Es seguro mientras haya **una sola réplica**. Si alguna vez pasa igual
   (o se corre `migrate deploy` a mano sin la variable), las sesiones colgadas se
   ven con `select pid, state, query from pg_stat_activity where query like '%advisory%'`
   y se cierran con `pg_terminate_backend(pid)`.

## 2. Frontend en Vercel

1. *Add New Project* → este repo. **Root Directory: `apps/frontend`** (deja activado
   "Include source files outside of the Root Directory": el lockfile es de la raíz).
2. Vercel toma `apps/frontend/vercel.json` (build `npm run build`, salida `dist`,
   y el rewrite a `index.html` para que `/projects/…` funcione al recargar).
3. Variables (Settings → Environment Variables), para *Production*:

   | Variable | Valor |
   |---|---|
   | `VITE_API_URL` | URL pública del backend en Railway (sin barra final) |
   | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | clave `anon` / publishable (es pública por diseño) |

   Las `VITE_*` se incrustan al **compilar**: si se cambian, hay que redeployar.
4. Con el dominio de Vercel ya asignado, volver a Railway y cargarlo en `CORS_ORIGIN`.

## 3. Supabase

- Authentication → URL Configuration: **Site URL** = el dominio de Vercel, y
  agregarlo a *Redirect URLs* (lo usa el restablecer contraseña).
- La base ya tiene el seed cargado y las migraciones aplicadas: no hay que
  sembrar de nuevo. (Dev y producción comparten esta base.)

## 4. Verificación después del deploy

1. `GET <backend>/health` → `{"status":"ok"}`.
2. Abrir el front, entrar, recorrer Dashboard, Proyectos, Resumen, Tablero, detalle
   de tarjeta y Usuarios.
3. En los logs de Railway, a las 00:00 (Argentina) debe aparecer
   `Foto del AAAA-MM-DD: N proyectos, N personas`.
