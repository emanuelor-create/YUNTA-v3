# Yunta — handoff de diseño → `apps/frontend`

Los diseños ya están alineados a tu arquitectura: React 19, esquinas redondeadas
con escala fija (modal 14 · card 12 · control 8 · pill 999; círculos solo en
avatares, dots, perillas y donut), paleta terracota/cream/near-black, Archivo
como única familia. Este documento dice **dónde entra cada pieza** y
**qué le falta a la API** para que la pantalla se pueda armar con datos reales.

## Archivos de este paquete

| Archivo | Destino sugerido |
| --- | --- |
| `yunta-tokens.css` | pegar al final de `apps/frontend/src/index.css` |
| `primitives.tsx` | `apps/frontend/src/components/ui/index.tsx` |

Los tokens **extienden**, no reemplazan: ninguna variable existente cambia de
nombre ni de valor. Lo único que sobreescriben es el `border-radius: 6px` de los
controles, que pasa a `var(--radius)` = 8px para unificar la escala. El bloque
`[data-theme="dark"]` de los tokens re-mapea la escala nueva para que el
toggle de tema del sidebar (`applyTheme` en `lib/theme.ts`) siga funcionando
con las pantallas nuevas: los diseños se dibujaron en claro, pero ninguna
pantalla queda ilegible en oscuro.

## Qué reemplaza cada primitiva (y qué NO)

`primitives.tsx` **no duplica** nada de lo que ya existe:

| Ya existe en el repo | Qué hace el paquete |
| --- | --- |
| `components/Avatar.tsx` (`Avatar`, `initials`, `colorFor`) | Se reusa tal cual. Solo agrego `AvatarStatusDot` (el dot de estado superpuesto) y `AVATAR_PALETTE`, opcional: la PALETTE actual son 8 colores brillantes tipo Trello que no pertenecen al sistema terracota. Si querés coherencia, cambiá solo esa constante. |
| `features/dashboard/priorityStyle.ts` | Se reusa como fuente de verdad. `PriorityBadge` recibe `PRIORITY_STYLE[p]` y `PRIORITY_LABEL[p]` y solo cambia la geometría (cápsula, sin dot). |
| `features/board/labelColors.ts` | Sin cambios: las etiquetas de tarjeta siguen con `LABEL_COLOR_HEX`. Los colores de proyecto en las grillas son otra escala (marca), no se mezclan. Las etiquetas pasan a cápsula (`--radius-pill`). |
| `features/board/icons.tsx` | Se reusa. Los íconos nuevos (search, gear, calendario, check) siguen el mismo patrón: SVG inline, `stroke="currentColor"`, 14–19px. |
| `features/clients/types.ts` | `PROJECT_MEMBER_ROLE_LABELS` y `_HINTS` se usan literales en el bloque de permisos — no reescribí esos textos. |
| `components/YuntaLogo.tsx` | Se reusa (`YuntaMark`, `YuntaWordmark`). |

Lo genuinamente nuevo: `Card`, `CardHeader`, `Label`, `Button`,
`StatusPill`, `ProgressBar`, `SegmentedBar`, `SettingsRow`, `Toggle`,
`Modal`, `TableHead`, `TableRow`.

### Decisión de tipografía

`--mono` (JetBrains Mono) sale de la UI: etiquetas, encabezados de columna y
datos numéricos van en **Archivo 600 uppercase** con tracking (`.y-label`), y la
alineación de números se resuelve con `font-variant-numeric: tabular-nums`
(`.y-num`), no con una segunda familia. `--mono` queda solo para `<code>`.
Podés borrar el `<link>` de JetBrains Mono del `index.html`.

---

## Mapa pantalla → ruta → archivo → endpoints

| Pantalla del diseño | Ruta | Archivo del repo | Endpoints |
| --- | --- | --- | --- |
| Login | `/login` | `features/auth/LoginPage.tsx` | `POST /auth/login`, `/auth/callback` |
| Dashboard | `/dashboard` | `features/dashboard/DashboardPage.tsx` | `GET /me/cards`, `/dashboard/history`, `/dashboard/team` |
| Proyectos (grilla) | `/projects` | `features/projects/ProjectsPage.tsx` | `GET /projects?archived=` |
| Proyecto → Resumen | `/projects/:projectId/resumen` | `features/board/ProjectSummaryTab.tsx` | `GET /projects/:id`, `/projects/:id/activity`, `/projects/:id/members` |
| Modal de configuración | (dentro de Resumen) | `features/board/ProjectConfigModal.tsx` | `PATCH /projects/:id`, `POST/DELETE /projects/:id/favorite` |
| Usuarios | `/admin/users` | `features/admin/AdminUsersPage.tsx` | `GET /users`, `POST /users` |
| Modal editar usuario | (dentro de Usuarios) | **nuevo** `features/admin/EditUserModal.tsx` | ver "huecos" |
| Shell (sidebar) | — | `components/Sidebar.tsx`, `AppLayout.tsx`, `TopBar.tsx` | `GET /projects` (Favoritos y Proyectos del menú) |

---

## Pantalla por pantalla

### Login
Dos columnas: izquierda tinta fija (`--sidebar-bg`) con isologo invertido,
titular y tres puntos de producto; derecha `--page` con el formulario.
Acento terracota solo en links y en el hover del botón primario. El ojo de la
contraseña es estado local. SSO: Google / Microsoft / SSO como tres botones
`variant="ghost"` de igual peso.

### Dashboard
Orden de las cards, de lo accionable a lo analítico:

1. **StatCards** (×4): asignadas, vencidas, vencen esta semana, cerradas 7d —
   con delta y sparkline. → `GET /dashboard/history` (`assigned`, `overdue`,
   `dueSoon`, `closed`): el último punto es el valor, el anterior el delta, la
   serie completa el sparkline. Sin endpoint nuevo.
2. **Ritmo de la semana** (barras apiladas cerradas/abiertas) →
   `TeamOverview.weekRhythm`. El día de hoy en acento.
3. **Estado del trabajo** (donut + breakdown) → `TeamOverview.statusBreakdown`.
   El diseño muestra 4 segmentos (Por hacer / En curso / En revisión /
   Bloqueadas) y `TaskStatus` sólo tiene 3 → ver huecos.
4. **Tu día** (checkbox, prioridad, vencimiento) → `GET /me/cards` filtrado por
   `dueDate` de hoy. Toggle = `PATCH /cards/:id` (status).
5. **Mis proyectos** (barra de avance) → `GET /projects` (`taskCount`,
   `doneCount`).
6. **Carga del equipo** (barras contra capacidad) →
   `TeamOverview.teamWorkload`. La capacidad (16) hoy es una constante del
   front; si querés que sea configurable, va en el usuario.
7. **Próximas a vencer** (ancho completo, agrupada por día) → `GET /me/cards`
   con `dueDate` en los próximos 7 días, agrupado en el cliente.

### Proyectos (grilla)
Una fila por proyecto: cuadrado de iniciales, cliente + cantidad de tareas,
barra de avance con %, avatares del equipo, entrega con nota relativa
("en 22 días" / "atrasado 4 días"), estado como `StatusPill`.
`ProjectWithClient` ya trae **todo** lo que la grilla necesita
(`taskCount`, `doneCount`, `openCount`, `dueSoonCount`, `unassignedCount`,
`team`, `isFavorite`, `lead`). Los cuatro contadores del header salen de sumar
esa misma lista — no hace falta endpoint de resumen.

### Proyecto → Resumen
- **Card de Avance**: barra segmentada por estado + desglose numérico + los
  cuatro KPI del proyecto (finalizadas / actualizadas / creadas / vencen
  pronto) + cronograma que compara `startDate`–`endDate` contra hoy.
- **Actividad reciente** → `GET /projects/:id/activity` (`ActivityEntry`), con
  el mapa de `ActivityType` a texto que ya tenés en `activityLabels.ts`.
- **Personas** (ancho completo, dos columnas): izquierda el responsable
  destacado (`lead`) y los miembros con `projectRole` y tareas; derecha el alta
  por correo + rol, con la referencia de permisos —
  `PROJECT_MEMBER_ROLE_HINTS` ya tiene esos tres textos, usalos tal cual.
- **Configuración**: sale de la página, se abre con el engranaje al lado del
  nombre, como modal de 720px. Filas de plantilla (`SettingsRow`), footer fijo
  con "Sin guardar / Al día" + Descartar / Guardar. Acciones sensibles
  (archivar, eliminar) cierran el modal con confirmación en dos pasos.
- La estrella de favoritos vive en el header y alimenta la sección Favoritos
  del sidebar.

### Usuarios + modal de edición
Grilla: checkbox de selección múltiple con barra de acciones en tinta, avatar
con dot de estado, badge de rol (Admin en tinta, PM en acento suave, Developer
neutro), proyectos con marcas de color, tareas abiertas con barra de carga,
última actividad, estado, y `···` que abre el modal.

El modal está sectorizado: **identidad** (header) → **datos personales** →
**acceso y permisos** (rol como tres botones + switch de cuenta activa) →
**contraseña** (enlace por correo | definir manualmente) → **proyectos y carga**
→ **acciones sensibles**, con footer fijo de guardado.

### Shell (sidebar) — divergencias deliberadas

El shell de `Yunta App.dc.html` es una **maqueta de navegación para poder
recorrer las pantallas**, no un reemplazo de `components/Sidebar.tsx`. Ese
archivo hace cosas que el diseño no muestra, y todas deben quedarse:

| En el repo | En el diseño | Qué hacer |
| --- | --- | --- |
| Colapsar a 60px con persistencia (`getStoredSidebarCollapsed`) | no está | **Conservar** el del repo. No hay contradicción: los 250px expandidos coinciden con los 252px del diseño. |
| Toggle claro/oscuro al pie (`applyTheme`) | no está | **Conservar.** Los tokens incluyen el bloque `[data-theme="dark"]` justamente para que siga sirviendo. |
| `TopBar` con buscador, `NotificationBell` y `AccountMenu` | no está: usuario y "Salir" al pie del sidebar | **Conservar el TopBar.** El pie de usuario del diseño es redundante con `AccountMenu` — elegí uno, no los dos. |
| Secciones colapsables Favoritos / Proyectos / Administración, alimentadas por `fetchAllProjects` | lista plana Inicio / Mis tareas / Proyectos / Informes + Favoritos | **Conservar la estructura del repo.** Del diseño tomá solo el tratamiento visual de la fila activa (barra de acento a la izquierda + `--sidebar-surface-2`), que ya es idéntico a `SidebarNavLink`. |
| `NAV_LINKS`: "Informe" apunta a `/projects` | "Proyectos" → `/projects`, e "Informes" aparte marcado como Pronto | **Revisar el rótulo:** hoy un solo ítem cubre dos conceptos distintos. |
| Ítems sin ícono SVG (a pesar de la intención de la arquitectura) | tampoco los tiene | **Pendiente en ambos lados.** Si los agregás, seguí el patrón de `features/board/icons.tsx` (14px, `stroke="currentColor"`) y reservá 26px a la izquierda del rótulo: el estado colapsado los necesita para que la barra de 60px sea usable. |
| `SectionLabel` usa `var(--mono)` | etiquetas en Archivo 600 uppercase | Cambiar a `var(--sans)` + peso 600 (clase `.y-label`). |

Los "Pronto" del diseño replican el patrón que ya tenés en `ADMIN_LINKS`
(`enabled: false` → fila apagada con la palabra "Pronto").

---

## Huecos de API (lo que falta para que estas pantallas tengan datos reales)

1. **`StaffUser` no alcanza para la grilla de usuarios.** Faltan
   `projectCount`, `openCount`, `overdueCount`, `lastActiveAt`. Sugerencia:
   `GET /users?include=stats`, o un `GET /users/overview` aparte para no
   encarecer el listado simple.
2. **Estado del usuario es binario.** `isActive: boolean` no distingue
   "invitación sin aceptar". El diseño usa tres estados. Sugerencia:
   `status: "ACTIVE" | "INVITED" | "DISABLED"` (derivable de `isActive` +
   `lastLoginAt === null`), y mantener `isActive` como campo calculado.
3. **Faltan las mutaciones de usuario**: `PATCH /users/:id` (nombre, email,
   rol, activo), `POST /users/:id/reset-password` (mail con enlace),
   `PUT /users/:id/password` (definir manualmente), `DELETE /users/:id`.
4. **KPI por proyecto**: el header de Resumen muestra finalizadas /
   actualizadas / creadas / vencen pronto en una ventana de 7 días. No hay
   endpoint. Sugerencia: `GET /projects/:id/stats?window=7d`.
5. **Estados de proyecto**: los diseños muestran "En revisión" y "En riesgo",
   que no existen en `ProjectStatus` (`PLANNED | IN_PROGRESS | PAUSED |
   COMPLETED | ARCHIVED`). Dos caminos: (a) derivar "En riesgo" en el front
   cuando `endDate < hoy && doneCount < taskCount`, y mapear "En revisión" a
   `IN_PROGRESS`; o (b) agregar `AT_RISK`/`IN_REVIEW` al enum. El diseño
   funciona con (a) y no requiere migración.
6. **Estados de tarea para el donut**: `TaskStatus` tiene 3 valores y el donut
   muestra 4 (incluye "Bloqueadas"). O se colapsa a 3 segmentos, o hace falta
   un flag `blocked` en `Card`.
7. **Invitación de personas a un proyecto por correo**: hoy
   `POST /projects/:id/members` recibe `userId`. El diseño invita por email a
   alguien que puede no existir todavía. Sugerencia: aceptar
   `{ email, role }` y crear la invitación si el usuario no existe.

## Nota sobre `datos: mock detrás del mismo hook`

Cada pantalla consume un hook por dominio (`useProjects`, `useDashboard`,
`useStaffUsers`). El hook decide la fuente con una bandera de entorno:

```ts
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => (USE_MOCKS ? mockProjects() : fetchAllProjects()),
  });
}
```

Así los componentes no saben de dónde vienen los datos, y las pantallas cuyos
endpoints todavía no existen (huecos 1–7) se pueden armar hoy contra el mock y
cambiar de fuente sin tocar la UI.
