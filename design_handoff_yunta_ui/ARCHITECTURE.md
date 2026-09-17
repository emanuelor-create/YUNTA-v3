# Yunta — Arquitectura

Documento de decisiones de infraestructura. El modelo de datos y los endpoints
están en `BACKEND.md`; la UI en `README.md`. Acá va **cómo se sostiene todo**.

---

## 1. La decisión que ordena el resto: ¿Supabase con o sin API propia?

Supabase permite dos arquitecturas muy distintas, y elegir mal cuesta caro
después.

### Opción A — Supabase directo desde el front (sin backend)

El navegador habla con Supabase usando `supabase-js`. Las reglas de negocio se
escriben como **Row Level Security** (políticas SQL) y funciones `plpgsql`.

- ✅ Menos código, menos infra, realtime gratis, auth resuelto.
- ❌ Las reglas de negocio viven en SQL. La invariante avance ↔ columna de
  `BACKEND.md` §2 se vuelve un trigger; los permisos por rol de proyecto, un
  laberinto de políticas. Difícil de testear y de leer.
- ❌ Perdés el NestJS que ya tenés escrito.

### Opción B — Supabase como Postgres + tu API NestJS  ← **recomendada**

Supabase es la base de datos (y opcionalmente Auth y Storage). NestJS sigue
siendo el único que escribe en ella, vía Prisma.

- ✅ Las reglas quedan en TypeScript, testeables. La invariante de avance es un
  método de servicio con tests, no un trigger.
- ✅ Reusás todo lo que ya existe en `apps/backend`.
- ✅ Podés migrar de Supabase a cualquier Postgres cambiando una URL.
- ❌ Más infra: hay que hostear la API.

**Recomiendo B.** Yunta tiene reglas de negocio reales — la escala de esfuerzo,
la invariante avance/columna, los permisos por rol de proyecto, el cálculo de
estadísticas. Eso es lógica de aplicación, no de base de datos.

El resto del documento asume B.

---

## 2. Piezas y responsabilidades

```
┌─────────────────────────────────────────────────────────┐
│  apps/frontend — React 19 + Vite + TanStack Query       │
│  · Lee y escribe SOLO vía la API. Nunca supabase-js      │
│    para datos de negocio.                                │
│  · Guarda el JWT de Supabase Auth y lo manda en cada     │
│    request.                                              │
└────────────────────────┬────────────────────────────────┘
                         │  HTTPS + Bearer JWT
┌────────────────────────▼────────────────────────────────┐
│  apps/backend — NestJS + Prisma                          │
│  · Valida el JWT de Supabase (JWKS).                     │
│  · Dueño de TODAS las reglas: escala de esfuerzo,        │
│    invariante avance↔columna, permisos, estadísticas.    │
│  · Único que escribe en la base.                         │
└────────────────────────┬────────────────────────────────┘
                         │  Postgres (pooler, puerto 6543)
┌────────────────────────▼────────────────────────────────┐
│  Supabase                                                │
│  · Postgres: los datos.                                  │
│  · Auth: usuarios, contraseñas, invitaciones, OAuth.     │
│  · Storage: adjuntos de tarjetas.                        │
│  · Realtime: opcional, fase 2 (ver §6).                  │
└─────────────────────────────────────────────────────────┘
```

### Por qué Supabase Auth y no auth propio

Ya tenés en el diseño: login con contraseña, Google, Microsoft, SSO, invitación
por email con estado `PENDING`, y reset de contraseña. Todo eso es lo que
Supabase Auth hace de fábrica. Escribirlo a mano son semanas y es la parte del
sistema donde un error se paga en serio.

La consecuencia en el modelo: la tabla de usuarios de Supabase
(`auth.users`) es la fuente de la identidad, y tu `User` de Prisma es el
**perfil** — se vincula por el `id` de Supabase:

```prisma
model User {
  /// Igual al auth.users.id de Supabase. No autogenerado.
  id        String     @id
  email     String     @unique
  name      String
  role      UserRole
  status    UserStatus @default(PENDING)
  // …
}
```

Los tres estados de `UserStatus` (`BACKEND.md` §3.4) se derivan así:
`PENDING` = invitado sin aceptar (Supabase: `email_confirmed_at` null),
`ACTIVE` = aceptado, `INACTIVE` = desactivado por un admin (bandera tuya).

### RLS con la opción B

Como solo la API escribe, la API usa la **service role key** y saltea RLS. Pero
igual **activá RLS en todas las tablas con política de denegar todo**: es el
seguro de que un `anon key` filtrado no lea nada. Cuesta cinco minutos.

```sql
ALTER TABLE "Card" ENABLE ROW LEVEL SECURITY;
-- sin políticas = nadie pasa salvo service_role
```

---

## 3. Las dos claves de Supabase (no las mezcles)

| Clave | Quién la usa | Dónde vive |
| --- | --- | --- |
| `anon` (pública) | el front, **solo para Auth** (login, reset) | `VITE_SUPABASE_ANON_KEY`, puede ir al bundle |
| `service_role` (secreta) | el backend, para todo lo demás | `SUPABASE_SERVICE_ROLE_KEY`, **jamás** en el front |

Si la `service_role` toca el navegador, cualquiera tiene acceso total a la base.
Es el error más común y el más grave.

### Variables de entorno

```bash
# apps/backend/.env
DATABASE_URL="postgresql://…@…pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://…@…supabase.com:5432/postgres"
SUPABASE_URL="https://xxxx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="…"
SUPABASE_JWT_SECRET="…"

# apps/frontend/.env
VITE_API_URL="http://localhost:3000"
VITE_SUPABASE_URL="https://xxxx.supabase.co"
VITE_SUPABASE_ANON_KEY="…"
VITE_USE_MOCKS="false"
```

**`DATABASE_URL` y `DIRECT_URL` no son lo mismo y los dos son necesarios.**
Prisma usa el pooler (6543) para las consultas y la conexión directa (5432) para
las migraciones. Con una sola, las migraciones fallan de forma confusa.

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

---

## 4. Autenticación, paso a paso

1. El front llama `supabase.auth.signInWithPassword(...)` → recibe un JWT.
2. Guarda la sesión (Supabase lo hace solo en `localStorage`).
3. Cada request a la API lleva `Authorization: Bearer <access_token>`.
4. Un `AuthGuard` de NestJS verifica la firma del JWT contra el JWKS de Supabase
   y pone `{ userId, email }` en el request.
5. Un segundo guard, de **autorización**, resuelve permisos: rol global
   (`ADMIN`/`PM`/`DEVELOPER`) y rol en el proyecto
   (`OWNER`/`EDITOR`/`VIEWER`). Los textos de esos roles ya están en
   `features/clients/types.ts`.

Los dos guards son distintos y conviene no mezclarlos: uno dice *quién sos*, el
otro *qué podés hacer acá*.

### El webhook que hace falta

Cuando alguien se registra o acepta una invitación, Supabase crea el usuario en
`auth.users` pero tu tabla `User` no se enteró. Dos caminos:

- **Database trigger** (más simple): un trigger en `auth.users` que inserta en
  `public."User"`.
- **Auth Hook** a un endpoint de tu API (más control, podés mandar el correo de
  bienvenida y asignar proyectos).

Empezá con el trigger; migrá al hook cuando necesites lógica.

---

## 5. Dónde corre cada cosa

| Pieza | Dev | Producción |
| --- | --- | --- |
| Postgres + Auth + Storage | Supabase (proyecto "dev") | Supabase (proyecto "prod", separado) |
| API NestJS | `localhost:3000` | Railway, Render o Fly.io |
| Front Vite | `localhost:5173` | Vercel o Netlify (estático) |

**Dos proyectos de Supabase, no uno.** Probar una migración contra la base de
producción es la forma más rápida de perder datos reales.

El front es estático: build y a un CDN. La API necesita un host con proceso
persistente — Railway es el de menor fricción para NestJS.

---

## 6. Realtime: sí, pero en la fase 2

El tablero kanban pide colaboración en vivo (ver la tarjeta que movió otro). Se
puede hacer con Supabase Realtime **escuchando desde el front** los cambios en
`Card`, mientras las escrituras siguen yendo por la API.

Es la única excepción legítima a "el front no habla con Supabase para datos":
lee notificaciones de cambio, no datos de negocio. Al recibir un evento,
invalidás la query de TanStack Query y ya.

No lo hagas primero. Andá a producción con polling o refetch al enfocar la
ventana; agregá realtime cuando haya dos personas de verdad en el mismo tablero.

---

## 7. Orden de trabajo

Repo nuevo, desde cero. Cada punto es una conversación con Claude Code. No los
junte — y no pase al siguiente sin que el anterior corra.

0. **Esqueleto del monorepo.** Estructura, dependencias, dos apps que levantan y
   dicen "hola". Nada de dominio todavía.

   ```
   yunta/
   ├── apps/
   │   ├── backend/          NestJS + Prisma
   │   └── frontend/         React 19 + Vite + TanStack Query + React Router
   ├── design_handoff_yunta_ui/
   ├── package.json          workspaces + scripts raíz
   └── .env.example
   ```

   Sin Nx ni Turborepo: npm workspaces alcanza y no agrega nada que haya que
   aprender. Sin librería de componentes (Material, shadcn, Tailwind): el
   sistema son las primitivas de `primitives.tsx` + las CSS variables de
   `yunta-tokens.css`. Meter Tailwind obliga a traducir todo el diseño dos
   veces.

1. **Conectar Supabase.** Crear los dos proyectos, `DATABASE_URL` y
   `DIRECT_URL`, el esquema base (`User`, `Project`, `Board`, `Column`, `Card`,
   `ProjectMember`) y `prisma migrate dev`. Verificar que la API levanta y lee.
2. **Modelo nuevo.** `BACKEND.md` §2 y §4: `storyPoints`, `progress`,
   `completedAt`, con la migración y el backfill.
3. **La invariante.** `BACKEND.md` §2, los cuatro casos de la tabla, con tests.
   Es la pieza que se rompe sola si no está explícita.
4. **Auth.** Supabase Auth + los dos guards + el trigger de `auth.users`.
   Reemplazar el login propio.
5. **Columnas como estados.** CRUD de columnas (`BACKEND.md` §3.6) y la mutación
   de mover tarjeta.
6. **Estadísticas.** `GET /projects/:id/stats` (§3.1) — desbloquea el informe de
   proyecto, que hoy está con datos derivados en el front.
7. **Usuarios.** Los endpoints de §3.3 y los tres estados de §3.4.
8. **Storage.** Adjuntos de tarjeta a un bucket de Supabase, con URLs firmadas.
9. **Deploy.** Front a Vercel, API a Railway, apuntando al proyecto prod.

Del 1 al 3 no hay nada visible en la UI. Es normal y es lo correcto: son los
cimientos, y hacerlos después de las pantallas obliga a rehacerlas.

---

## 8. Errores que conviene no cometer

- **Poner la `service_role key` en el front.** Acceso total a la base para
  cualquiera que abra las devtools.
- **Saltarse `DIRECT_URL`.** Las migraciones fallan con errores que no dicen eso.
- **Un solo proyecto de Supabase para dev y prod.**
- **Escribir las reglas de negocio como triggers de Postgres** porque "ya que
  Supabase lo permite". Terminás con la lógica partida en dos lenguajes.
- **Leer datos de negocio con `supabase-js` desde el front** "para una pantalla
  chica". Ahí empieza a haber dos fuentes de verdad y dos juegos de permisos.
- **Dejar RLS desactivado** pensando que no importa porque solo escribe la API.
- **Arrancar por realtime.** Es lo más vistoso y lo menos urgente.
