# Handoff: Yunta — UI completa (login, dashboard, proyectos, usuarios, tarjeta)

## Overview

Interfaz completa del software de gestión de tareas y proyectos **Yunta**: pantalla
de acceso, dashboard, grilla de proyectos, resumen de proyecto, administración de
usuarios y el detalle de tarjeta del tablero kanban. El objetivo es una UI de
carácter propio —tipográfica, de dos colores, con esquinas redondeadas y sin
sombras— que se distinga de los SaaS genéricos.

Destino: `apps/frontend` del monorepo `emanuelor-create/YUNTA`
(React 19 + Vite + TanStack Query + React Router v6).

## About the Design Files

Los archivos `.html` de este paquete son **referencias de diseño hechas en HTML**:
prototipos que muestran el aspecto y el comportamiento buscados. **No son código
de producción para copiar y pegar.** Están escritos en JavaScript con estilos
inline y colores en hexadecimal literal, porque tienen que abrir solos en un
navegador.

La tarea es **recrear estos diseños dentro de `apps/frontend`**, con sus patrones
ya establecidos: `.tsx`, CSS variables de `index.css`, TanStack Query para datos,
y los componentes que ya existen (`components/Avatar.tsx`,
`features/dashboard/priorityStyle.ts`, `features/board/labelColors.ts`,
`features/board/icons.tsx`, `components/YuntaLogo.tsx`).

`primitives.tsx` y `yunta-design-tokens.css` **sí** son código listo para el
repo, y son el puente entre los dos mundos: los hex de los HTML ya están
traducidos a `var(--*)` ahí.

## Fidelity

**High-fidelity (hifi).** Colores, tipografía, espaciado, jerarquía y estados
son definitivos. Recreá la UI **con precisión de píxel**: todos los valores de
este documento son los reales de los prototipos, no aproximaciones. Cuando un
número de acá contradiga tu intuición, gana el número.

---

## Reglas del sistema (violarlas es el error más común)

1. **Esquinas redondeadas, con escala fija.** No inventes valores intermedios:

   | Elemento | Radio | Variable |
   | --- | --- | --- |
   | Modal / diálogo | **14px** | `--radius-modal` |
   | Card, panel, sección, bloque bordeado | **12px** | `--radius-card` |
   | Input, select, textarea, botón, checkbox | **8px** | `--radius` |
   | Badge, pill de estado y de prioridad | **999px** (cápsula) | `--radius-pill` |
   | Barra de progreso (contenedor y relleno) | **999px** | `--radius-pill` |
   | Marca de color de proyecto (9×22) | **3px** | `--radius-tick` |
   | Avatar, dot de estado, perilla del switch, donut | **50%** | — |

   Los contenedores con hijos que llegan al borde (cards con filas, modales,
   barras de progreso) necesitan `overflow: hidden` para que el hijo respete la
   curva. El `border-radius: 6px` que hoy tiene `index.css` en los controles se
   reemplaza por `var(--radius)` (8px) — no dejes los dos valores conviviendo.
2. **Una sola familia tipográfica: Archivo.** Las etiquetas NO son mono.
   JetBrains Mono queda solo para `<code>`. Etiqueta = Archivo, 10.5px, peso 600,
   `letter-spacing: 0.13em`, `text-transform: uppercase`, color `--ink-3`.
   Los números se alinean con `font-variant-numeric: tabular-nums`, no con mono.
3. **Dos colores y nada más**: tinta `#1B1917` y crema `#F2EFE9`. El terracota
   `#B4552F` es **acento puntual** — nunca superficie grande. Regla práctica: en
   una pantalla, el acento aparece en 1–3 lugares (el dato urgente, el hover del
   botón primario, la fila activa del menú).
4. **Verde solo como dot.** `#7A8B5A` únicamente en el dot de "activo". No hay
   botones, fondos ni textos verdes.
5. **Sin sombras**, salvo la del modal (`0 24px 64px rgba(27,25,23,0.22)`, con
   `border-radius: 14px`).
   La jerarquía se hace con borde y con el par de superficies crema/blanco.
6. **Nada de gradientes, emoji ni íconos decorativos.** Los íconos son SVG inline
   de 14–19px, `stroke="currentColor"`, `stroke-width: 1.7`.
7. **Layout con flex/grid + `gap`.** Nunca márgenes por elemento para separar
   hermanos.

---

## Cómo se instalan los tokens

`yunta-tokens.css` es un **archivo aparte**, no un bloque para pegar dentro de
`index.css`:

```ts
// main.tsx
import "./index.css";
import "./yunta-tokens.css";  // después, para ganar por cascada
```

Pegarlo dentro de `index.css` es el error que rompe la app: si queda por encima
de un `@import "tailwindcss"`, el navegador descarta ese `@import` y **la hoja
entera deja de aplicar** — todo queda serif, sin bordes y sin fondos. Como
archivo importado después, la cascada hace el trabajo y no hay orden que romper.

Lo único a editar en `index.css`: borrar el `border-radius: 6px` de los
controles.

## Design Tokens

### Las tres paletas

El sistema tiene una sola estructura y tres pieles. Todas comparten geometría,
tipografía y espaciado — cambian solo los valores de color:

| Paleta | Atributo | Fondo | Tinta | Acento |
| --- | --- | --- | --- | --- |
| **Terracota** (default) | — | crema `#F2EFE9` | `#1B1917` | `#B4552F` |
| **Azul** | `data-palette="azul"` | blanco / `#F4F7FB` | navy `#0F1B2D` | `#0B5FFF` |
| **Grafito** | `data-palette="grafito"` | blanco / `#F5F6F8` | grafito `#121417` | `#0B5FFF` |

Se cambian en caliente sin tocar ninguna pantalla:

```ts
document.documentElement.dataset.palette = "grafito";
delete document.documentElement.dataset.palette; // vuelve a terracota
```

La tabla de abajo es la paleta **Terracota**; los otros dos juegos están en
`yunta-tokens.css`. **Ninguna pantalla debe usar hex literales** — si un
componente hardcodea un color, deja de responder al cambio de paleta.

### Colores

| Rol | Hex | Variable |
| --- | --- | --- |
| Fondo de página | `#F2EFE9` | `--page` |
| Card / panel | `#FBFAF7` | `--card` |
| Input dentro de card | `#FFFFFF` | `--field` |
| Hover de fila | `#F7F5F0` | `--row-hover` |
| Fila seleccionada | `#F6E4DA` | `--row-sel` |
| Borde de card | `#E2DCD2` | `--line` |
| Separador de filas | `#EDEAE3` | `--line-soft` |
| Borde de control | `#D6D0C6` | `--line-strong` |
| Texto / título | `#1B1917` | `--ink` |
| Texto secundario | `#5C564D` | `--ink-2` |
| Etiquetas y notas | `#8A8378` | `--ink-3` |
| Deshabilitado / placeholder | `#A8A096` | `--ink-4` |
| Acento (terracota) | `#B4552F` | `--accent` |
| Acento sobre fondo claro | `#8F3F1F` | `--accent-ink` |
| Fondo de badge de acento | `#F6E4DA` | `--accent-soft` |
| Borde de badge de acento | `#E7C4B1` | `--accent-line` |
| Neutro de dato | `#C9C2B7` | `--neutral` |
| Neutro suave | `#EDEAE3` | `--neutral-soft` |
| Borde de badge tenue / pill inactiva | `#DED9D0` | `--line-x-soft` |
| Texto apagado (pill inactiva, sección) | `#6C665D` | `--ink-5` |
| Borde de control sobre barra de tinta | `#4A453D` | `--line-on-dark` |
| Divisor interno de control compuesto | `#E7E2D9` | `--line-inset` |
| Cuerpo legible sobre tinta | `#CFC8BD` | `--ink-on-dark` |
| Arcilla (3ª categoría) | `#8A5A2B` | `--clay` |
| Piedra (4ª categoría) | `#5C564D` | `--stone` |
| Dot "activo" | `#7A8B5A` | `--ok` |
| Sidebar: fondo | `#1B1917` | `--sidebar-bg` |
| Sidebar: fila activa | `#26231F` | `--sidebar-surface-2` |
| Sidebar: borde | `#2E2A26` | — |
| Sidebar: texto inactivo | `#A8A096` | — |
| Sidebar: sección | `#6C665D` | — |

### Tipografía (todos los tamaños reales usados)

| Uso | Tamaño | Peso | Tracking |
| --- | --- | --- | --- |
| H1 de pantalla | 33–34px | 800 | −0.03em |
| Título de modal | 21–23px | 800 | −0.028em |
| Título de sección de página | 25px | 800 | −0.028em |
| Título de card (`h2`) | 17px | 700 | −0.01em |
| Dato grande (KPI) | 26–34px | 700 | −0.03em |
| Dato mediano | 19–22px | 700 | −0.02em |
| Nombre en fila de tabla | 15–15.5px | 600 | −0.01em |
| Cuerpo | 14–14.5px | 400/500 | 0 |
| Secundario en fila | 12.5–13px | 400 | 0 |
| Etiqueta / encabezado de columna | 10.5px | 600 | **0.13em** (canónico), uppercase |
| Kicker de sección | 10.5–11px | 600 | 0.16em, uppercase |
| Nota mínima | 11–12px | 400/500 | 0 |

### Radios

Ver la tabla de la regla 1. Resumen: modal 14 · card 12 · control 8 · pill 999 ·
marca 3 · círculos 50%.

### Espaciado

- Sidebar: **252px** de ancho fijo, `padding: 22px 0`; ítems `padding: 10px 12px`
  dentro de un contenedor con `padding: 0 12px`.
- Header de pantalla: `padding: 28px 40px 22px`, `border-bottom: 1px solid --line`.
- Cuerpo de pantalla: `padding: 24px 40px 56px`, columnas con `gap: 24px`.
- Card: header `padding: 20px 24px 15px`; filas `padding: 15px 20px`;
  bloques de contenido `padding: 18px 22px`.
- Modal: header `padding: 20px 26px`; cuerpo `padding: 20px 26px 24px`;
  footer `padding: 15px 26px`.
- Gap entre cards: **24px** (26px en el dashboard).

---

## Screens / Views

### 1. Login — `Yunta-Login.html` → `features/auth/LoginPage.tsx`

**Propósito:** entrar al espacio de trabajo.

**Layout:** `display: grid; grid-template-columns: 1.05fr 1fr; min-height: 100vh`.

- **Columna izquierda** — fondo `#1B1917`, `padding: 56px 60px`,
  `justify-content: space-between`. Contiene: isologo invertido (44px) +
  wordmark 23px/800 uppercase tracking 0.04em; bloque central con kicker
  "TAREAS Y PROYECTOS" en acento, H1 52px/800 tracking −0.035em color `#F2EFE9`
  ("El trabajo del equipo, tirando para el mismo lado."), párrafo 17px
  `line-height: 1.6` color `#A8A096`, y tres puntos numerados (`01/02/03` en
  acento, 22px de ancho mínimo, texto 15px `#CFC8BD`); pie con copyright y
  links 11px uppercase `#6C665D`. Marca de agua: el isologo a 720px,
  `opacity: 0.05`, `position: absolute; right: -260px; bottom: -190px`.
- **Columna derecha** — fondo `#F2EFE9`, centrada, formulario de **404px**
  máximo, `gap: 30px`. H2 32px/800. Inputs: `#FBFAF7`, borde `#DED9D0`,
  `padding: 14px 16px`, 16px de texto; en focus el borde pasa a `#1B1917` y el
  fondo a blanco. El campo de contraseña lleva un botón "Ver/Ocultar" pegado a la
  derecha con `border-left: 1px solid #E7E2D9`. Botón primario a ancho completo,
  `padding: 16px`, tinta → acento en hover. Divisor "o" con dos hairlines.
  Tres botones fantasma iguales (Google / Microsoft / SSO), `flex: 1`.

**Estado:** `showPass` local. Al enviar, `POST /auth/login` (cookies httpOnly).

### 2. Dashboard — `Yunta-Dashboard.html` → `features/dashboard/DashboardPage.tsx`

**Propósito:** qué toca hoy y cómo viene la semana.

**Orden de las cards, de arriba a abajo** (este orden es intencional: de lo
accionable a lo analítico):

1. **Fila de 4 StatCards** en un solo bloque bordeado, `grid-template-columns:
   repeat(4,1fr)`, cada celda con `border-right: 1px solid --line` (la última
   sin). Celda: etiqueta, luego valor 34px/700 + delta 11px + **sparkline** de 7
   barras de 5px con `gap: 3px`, altura máxima 34px. Métricas: asignadas a vos,
   vencidas (valor y delta en acento), vencen esta semana, cerradas en 7 días.
2. **Tu día** (1.6fr) + **Estado del trabajo** (1fr) en una fila.
   - *Tu día*: filas `grid-template-columns: 20px minmax(0,1fr) auto auto`,
     checkbox de 18px con radio 8px (marcado: fondo tinta + check crema), título +
     proyecto con marca de color de 7px, badge de prioridad, vencimiento a la
     derecha (`min-width: 96px; text-align: right`, acento si es urgente).
     Completada: título `#A8A096` + `line-through`.
   - *Estado del trabajo*: donut SVG `viewBox="0 0 42 42"`, `r=15.9`,
     `stroke-width=6`, segmentos con `stroke-dasharray`/`dashoffset` y
     `transform="rotate(-90 21 21)"`; centro con % 26px/700 y la palabra
     "avance" en etiqueta; leyenda al costado con cuadrado de 9px + nombre + n.
3. **Próximas a vencer** a ancho completo. Header con mini bar chart de 7 días
   (barras de 22px, hoy en acento) y el total en 26px/700 acento. Filas
   agrupadas por día: rail izquierdo de **150px** (`#F6E4DA` si es hoy, `#F7F5F0`
   si no) con el día y la cantidad; a la derecha, filas
   `minmax(0,1fr) 150px 92px 34px` con barra de color de 3×26px, título,
   proyecto · cliente, hora, prioridad y avatar de 26px.
4. **Ritmo de la semana** (1.6fr) + **Mis proyectos** (1fr).
   - *Ritmo*: barras apiladas cerradas (tinta; hoy en acento) sobre abiertas
     (`#C9C2B7`), alto del área 184px, `border-bottom` como eje, valor arriba de
     cada barra y día debajo (hoy en acento).
   - *Mis proyectos*: nombre + %, barra de avance de 4px, cliente + nota
     (atrasado en acento).
5. **Carga del equipo** a ancho completo: filas
   `grid-template-columns: 26px minmax(0,1fr) 30px`, barra de 8px contra una
   capacidad de 16 tareas; si se pasa, barra y número en acento.

**Interacción:** los checkboxes de "Tu día" alternan estado (no navegan). Clic en
el resto de la fila **abre el modal de detalle de tarjeta**.

### 3. Proyectos — `Yunta-Proyectos.html` → `features/projects/ProjectsPage.tsx`

**Layout:** header (kicker "ACME CORP · ESPACIO DE TRABAJO", H1 "Proyectos",
botones "Ver archivados" fantasma + "Nuevo proyecto" primario), fila de 4
contadores en un bloque bordeado, barra de filtros + buscador, tabla.

**Tabla** — `grid-template-columns: minmax(280px,2.3fr) 190px 130px 150px
minmax(150px,1fr)`, `gap: 20px`, filas `padding: 18px 20px`,
`border-bottom: 1px solid --line`, hover `--card`:

1. **Proyecto**: cuadrado de 34px con iniciales (fondo = color del proyecto,
   texto crema, 12px/500) + nombre 15.5px/600 + `cliente · N tareas` 13px.
2. **Avance**: `%` y `hechas/total` en una línea, barra de 4px debajo.
3. **Equipo**: avatares de 28px superpuestos con `margin-left: -8px` y
   `border: 2px solid --page`; el excedente como `+2` sobre `#C9C2B7`.
4. **Entrega**: fecha 14px/500 + nota relativa 11px ("en 22 días" / "atrasado 4
   días", en acento si está atrasado).
5. **Estado**: pill con dot. Alineada a la derecha, seguida de `···`.

**Filtros:** Todos / En curso / En riesgo / Cerrados — activo en tinta con texto
crema; el resto, fantasma. El buscador filtra por nombre y cliente.

**Interacción:** clic en la fila abre `/projects/:id/resumen`.

### 4. Proyecto → Resumen — `Yunta-Proyecto-Resumen.html` → `features/board/ProjectSummaryTab.tsx`

**Header:** breadcrumb `Proyectos / Cliente`, H1 con el nombre, **estrella de
favoritos** (rellena en acento si está marcada; el rótulo dice "En favoritos" /
"Añadir a favoritos"), **botón de engranaje** que abre el modal de configuración,
pill de estado, botones "Compartir" y "Nueva tarea". Debajo, tabs
(Resumen / Backlog / Tablero / Calendario) con la activa en 600 y
`border-bottom: 2px solid --accent`.

**Fila 1** — *Avance del proyecto* (1.25fr) + *Actividad reciente* (1fr), con
`align-items: stretch` para que igualen altura.

*Avance* contiene, en este orden y con `justify-content: space-between`:
- Header con el % en 30px/700.
- **Barra segmentada** de 12px (Completadas tinta, En curso acento, En revisión
  arcilla, Por hacer `#C9C2B7`).
- Desglose en 4 columnas, cada una con `border-left: 2px solid <color>` y
  `padding-left: 11px`.
- **Los 4 KPI del proyecto** en grilla 2×2 con hairlines internos: finalizadas,
  actualizadas, creadas, vencen pronto (esta última con ícono sobre
  `--accent-soft` y valor en acento). Cada KPI: ícono 34px enmarcado + valor
  22px/700 + nombre 13.5px/600 + ventana temporal en etiqueta.
- **Cronograma**: barra de 8px con el tramo transcurrido en `#C9C2B7` y un
  marcador vertical de 2×16px en acento en la posición de hoy; debajo, inicio /
  "Hoy" / fin. El texto dice días restantes, días de atraso, o
  "Entregado el <fecha>" si está cerrado.

*Actividad reciente*: 5 filas `28px minmax(0,1fr) auto` con avatar, texto,
código de tarea + nombre, y el "hace 1 h" a la derecha.

**Fila 2** — *Personas* a ancho completo, dividida en
`grid-template-columns: 1.35fr 1fr`:
- Izquierda: el **responsable** destacado sobre `#F6E4DA` con su rol en
  `--accent-ink` y un botón "Cambiar" que abre el modal y enfoca ese campo
  (marcándolo en acento ~2s); debajo, los miembros en filas
  `32px minmax(0,1fr) auto auto` con nombre, tareas, badge de rol y `×`.
- Derecha: alta por correo + select de rol pegados en un solo control, botón
  "Invitar al proyecto" a ancho completo, y la referencia de los tres permisos
  (usá `PROJECT_MEMBER_ROLE_HINTS` tal cual).

**Modal de configuración** (720px): filas de plantilla
`grid-template-columns: 186px minmax(0,1fr)` con `border-top: 1px solid --line`,
etiqueta + descripción a la izquierda y control a la derecha. Campos: nombre,
cliente, resumen, plazos (inicio + fin), responsable. Cierra con un subtítulo
"ACCIONES SENSIBLES" en `--accent-ink` y dos filas: archivar y eliminar
(confirmación en dos pasos: el botón pasa a "Confirmar" con fondo acento y el
texto de ayuda cambia). Footer fijo: indicador "Sin guardar" (acento) /
"Al día" + Descartar + Guardar (el primario se apaga a `#DED9D0` si no hay
cambios).

### 5. Usuarios — `Yunta-Usuarios.html` → `features/admin/AdminUsersPage.tsx`

**Header:** kicker "ADMINISTRACIÓN", H1 "Usuarios", párrafo aclarando que los
clientes entran por invitación desde cada proyecto y no ocupan licencia; botones
"Exportar CSV" y "Invitar usuario".

**Tabla** — `grid-template-columns: 34px minmax(260px,2.2fr) 130px
minmax(150px,1.1fr) 120px 150px 130px 34px`:

1. Checkbox (con "seleccionar todo" en el header).
2. **Usuario**: avatar de 36px con **dot de estado** de 10px superpuesto
   (`border: 2px solid --card`), nombre + badge "Vos" si es el usuario actual,
   correo debajo. Inactivo: avatar `#DED9D0` y nombre `#8A8378`.
3. **Rol** como badge: Admin en tinta/crema, PM en `--accent-soft`/`--accent-ink`,
   Developer en `--card`/`--ink-2`.
4. **Proyectos**: marcas de color de 9×22px (máx. 3) + "N proyectos" o el nombre
   si es uno solo o "Sin proyectos".
5. **Tareas**: número + "N vencidas" en acento, con barra de carga de 3px.
6. **Última actividad**: valor + nota ("hace 3 h", "invitado 24 ago").
7. **Estado**: pill con dot — Activo (dot `--ok`), Pendiente
   (`--accent-soft`), Inactivo (`--neutral-soft`).
8. `···` que abre el modal de edición.

**Barra de selección:** al marcar filas aparece una barra en tinta con
"N usuarios seleccionados" y tres acciones (Cambiar rol, Desactivar, Quitar
selección). Las filas marcadas toman fondo `--row-sel`.

**Pie:** tres tarjetas explicando Admin / PM / Developer.

**Modal "Invitar usuario"** (560px): correo, rol como tres botones, contador de
licencias en uso, y el primario apagado hasta que el correo tenga `@`.

**Modal "Editar usuario"** (760px) — sectorizado, en este orden:
1. **Header de identidad**: avatar 44px con dot, nombre 21px/800, pill de estado,
   y `correo · última actividad`.
2. **Datos personales**: nombre y correo en dos columnas.
3. **Acceso y permisos**: rol como tres botones (no select) con la descripción
   del permiso debajo; estado de la cuenta como **switch** de 42×24 en cápsula
   (acento encendido, `--neutral` apagado, perilla circular de 20px) con su explicación.
4. **Contraseña**: dos columnas — enviar enlace por correo (el botón pasa a
   "Enlace enviado ✓") | definir manualmente (input + botón "Establecer" que se
   habilita a los 8 caracteres).
5. **Proyectos y carga**: tres contadores (proyectos, abiertas, vencidas) y la
   lista de proyectos con barra; el vacío ofrece "Asignar a un proyecto".
6. **Acciones sensibles**: eliminar con confirmación en dos pasos.
7. **Footer fijo**: "Sin guardar / Al día" + Cancelar + Guardar.

Los separadores de sector son `etiqueta + hairline que ocupa el resto del ancho`.

### 6. Detalle de tarjeta — `Yunta-Tarjeta-Detalle.html` → `features/board/CardDetailModal.tsx`

**Modal de 1080×820**, `grid-template-columns: minmax(0,1fr) 348px`.

**Header:** checkbox de 22px (radio 8px), kicker `YUN-142 · Proyecto · Tablero`,
y el título como input de 23px/800 sin borde que muestra `border-bottom` tinta al
enfocar. Completada: título `#8A8378` + `line-through`.

**Columna izquierda — cinco sectores**, cada uno un bloque bordeado sobre
`--card` con header propio (`kicker + hairline + acción opcional`):

1. **Estado y propiedades** — grilla 2×2 con hairlines:
   - **Estado**: dot de 8px + select. ⚠️ Ver "Nota crítica" abajo.
   - **Prioridad**: tres botones (Alta / Media / Baja); el activo en tinta, los
     otros con los colores de `PRIORITY_STYLE`.
   - **Inicio** y **Vencimiento** siempre visibles (no detrás de un botón). El
     vencimiento muestra la nota relativa al lado de la etiqueta y, si está
     atrasado, la nota y el borde del input en acento.
2. **Personas y etiquetas** — asignados como chips con avatar de 22px y `×`, más
   un select "+ Asignar…"; etiquetas como badges con `×` y un botón
   "+ Etiqueta" con `border: 1px dashed #C9C2B7`.
3. **Descripción** — con "Editar" en el header del sector; en edición, textarea
   de 5 filas + Guardar/Cancelar.
4. **Adjuntos** — contador en el header; filas `20px minmax(0,1fr) auto auto` con
   ícono de clip, nombre, peso y `×`.
5. **Tiempo empleado** — el **total va en el header** del sector (17px/700);
   debajo, botón de cronómetro (tinta → acento cuando corre, con ícono de play o
   stop) + "Carga manual", y las entradas como tabla
   `24px minmax(0,1fr) auto 84px auto`.

Al pie: línea de creación/actualización y la fila de acciones
(completar | eliminar con confirmación en dos pasos).

**Columna derecha — Comentarios**, fondo diferenciado `#EFECE6`:
- Header: ícono de globo + kicker + contador en badge tinta.
- Compositor: textarea de 3 filas sobre blanco, ayuda "Enter para enviar ·
  Shift+Enter salto de línea" (**y el handler existe**: Enter envía, Shift+Enter
  hace salto), botón "Comentar" apagado si está vacío.
- Cada comentario **en su propio recuadro** (`border: 1px solid #DED9D0`,
  fondo `--card`) con tres partes separadas: header (avatar 24px, autor, fecha),
  cuerpo, y acciones (Responder / Eliminar). Vacío: recuadro punteado centrado.

> **Nota crítica — el campo "Estado":** `Card` **no tiene** un campo de estado.
> El estado **es la columna** en la que vive la tarjeta (`Column`). El select debe
> alimentarse de `Board.columns` (`value = columnId`, opciones = `column.name`) y
> al cambiar debe ejecutar la **mutación de mover tarjeta**, no un `PATCH` de un
> campo inexistente. "Hecho" debe quedar ligado a `completedAt`. En el prototipo
> las columnas están mockeadas con ese shape exacto.

### 7. Shell — `Yunta App.dc.html` → `components/Sidebar.tsx` + `AppLayout.tsx`

⚠️ **El shell del prototipo es una maqueta de navegación para poder recorrer las
pantallas, NO un reemplazo de `Sidebar.tsx`.** Conservá del repo: el colapso a
60px con persistencia, el toggle claro/oscuro, el `TopBar` con buscador +
`NotificationBell` + `AccountMenu`, y las secciones colapsables alimentadas por
`fetchAllProjects`. Del diseño tomá **solo** el tratamiento visual de la fila
activa: fondo `#26231F` + `border-left: 2px solid #B4552F` + peso 600 — que ya
es prácticamente lo que hace `SidebarNavLink`.

Dos cosas a resolver del repo: `NAV_LINKS` tiene "Informe" apuntando a
`/projects` (en los diseños son dos ítems distintos), y `SectionLabel` usa
`var(--mono)` — debe pasar a `var(--sans)` peso 600.

---

## Interactions & Behavior

- **Hover de fila** (tablas y listas): fondo `#F7F5F0`. Sin transición.
- **Hover de botón primario**: tinta → acento. **Fantasma**: el borde pasa a
  `#1B1917` y el fondo a `#FBFAF7`.
- **Focus de input**: `outline: none` + borde `#1B1917`. Nunca el anillo azul del
  navegador. El radio no cambia en focus.
- **Botón primario deshabilitado**: fondo `#DED9D0` (`--line-x-soft`), texto
  `#8A8378`.
- **Enlaces y placeholders**: los define el bloque final de
  `yunta-design-tokens.css`, **acotado a `main`** (`main a` en acento,
  `main a:hover` en tinta, placeholder en `--ink-4`). Sin ese bloque heredan los
  valores del tema oscuro y quedan ilegibles sobre crema. **Nunca lo pases a
  `a` global**: los enlaces del sidebar van sobre tinta y quedarían terracota,
  con hover negro sobre negro. Los enlaces de superficies oscuras (sidebar,
  panel del login) llevan su color inline y no deben depender de estas reglas.
- **Confirmación de dos pasos** (todo lo destructivo): primer clic cambia el
  rótulo a "Confirmar" y pinta el botón con fondo acento; el texto de ayuda pasa
  a explicar la consecuencia exacta ("Se borrarán 83 tareas y su historial").
  Cerrar el modal resetea la confirmación.
- **Indicador de cambios sin guardar**: etiqueta "Sin guardar" en acento cuando
  el formulario difiere de lo guardado, "Al día" en `--ink-3` si no.
- **Modales**: overlay `rgba(27,25,23,0.44)`, clic en el fondo cierra, el
  contenido scrollea con header y footer fijos.
- **Los hover son obligatorios, las transiciones no existen.** El cambio de
  estado es instantáneo (`transition: none`), pero cada control tiene que
  responder: fila de tabla → `--row-hover`; botón primario → acento; botón
  fantasma → borde `--ink` + fondo `--card`; `···` → `--ink`. Una tabla sin
  hover se siente rota, aunque los colores estén bien.
- **Sin animaciones.** No hay transiciones de entrada, fades ni skeletons
  animados. Si necesitás estado de carga, usá el layout final con valores en
  `--ink-4`.

## State Management

Estado local (`useState`) por pantalla: filtro activo, texto de búsqueda,
selección de filas (`Record<id, boolean>`), qué modal está abierto, borradores de
formulario (`{ saved, form }` para poder comparar y ofrecer Descartar), y
banderas de confirmación.

Datos: un hook por dominio con TanStack Query. Como pediste **mock detrás del
mismo hook**:

```ts
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => (USE_MOCKS ? mockProjects() : fetchAllProjects()),
  });
}
```

Así las pantallas cuyos endpoints todavía no existen se pueden armar hoy contra
el mock y cambiar de fuente sin tocar la UI.

## Huecos de API

Estas pantallas muestran datos que la API todavía no devuelve. El detalle está en
`HANDOFF.md`; resumen:

1. `StaffUser` sin `projectCount`, `openCount`, `overdueCount`, `lastActiveAt`.
2. `isActive: boolean` no distingue "invitación sin aceptar" (hacen falta 3
   estados).
3. Faltan `PATCH /users/:id`, `POST /users/:id/reset-password`,
   `PUT /users/:id/password`, `DELETE /users/:id`.
4. Falta `GET /projects/:id/stats?window=7d` para los 4 KPI del resumen.
5. `ProjectStatus` no tiene "En revisión" ni "En riesgo" (se pueden derivar en el
   front, sin migración).
6. El donut muestra 4 estados y `TaskStatus` tiene 3.
7. `POST /projects/:id/members` recibe `userId`; el diseño invita por email a
   alguien que puede no existir.

## Convenciones que ganan sobre el prototipo

Estas tres cosas del prototipo son mock, y la implementación del repo es la
correcta — no las "corrijas" hacia el HTML:

1. **Iniciales de avatar**: usá `initials()` de `components/Avatar.tsx`
   (primera + última inicial → "María Paz Duarte" = "MD"). En el prototipo son
   las dos primeras palabras ("MP"), que es peor para nombres compuestos.
2. **Fechas relativas**: derivalas de `lastLoginAt`/`updatedAt` con tu helper,
   no uses los strings fijos del mock. Formato con espacio y unidad corta:
   "hace 5 min", "hace 3 h", "hace 75 d".
3. **Paginación**: el prototipo no pagina y el footer muestra el total. La
   implementación con `PAGE_SIZE` y "N de <filtrados>" es la correcta.

## Assets

- **Isologo**: el buey con la Y calada, como SVG inline en `viewBox="0 0 100 100"`
  (6 paths). Ya existe en el repo como `components/YuntaLogo.tsx` — reusalo.
- **Íconos**: SVG inline, sin librería. Los de tarjeta ya están en
  `features/board/icons.tsx`; los nuevos (buscar, engranaje, calendario, check,
  clip, globo de comentario) están en los HTML y siguen el mismo patrón.
- **Tipografía**: Archivo desde Google Fonts, pesos 400/500/600/700/800.
- No hay imágenes ni ilustraciones en ninguna pantalla.

## Files

Referencias de diseño (abren en cualquier navegador, funcionan offline):

| Archivo | Pantalla |
| --- | --- |
| `Yunta-Login.html` | Login |
| `Yunta-Dashboard.html` | Dashboard |
| `Yunta-Proyectos.html` | Grilla de proyectos |
| `Yunta-Proyecto-Resumen.html` | Resumen de proyecto (+ modal de configuración) |
| `Yunta-Usuarios.html` | Administración de usuarios |
| `Yunta-Editar-Usuario.html` | El mismo, con el modal de edición abierto |
| `Yunta-Tarjeta-Detalle.html` | Detalle de tarjeta del kanban |

Código para el repo:

| Archivo | Destino |
| --- | --- |
| `yunta-tokens.css` | copiar a `apps/frontend/src/` e importar en `main.tsx` **después** de `index.css` |
| `primitives.tsx` | `apps/frontend/src/components/ui/index.tsx` |
| `HANDOFF.md` | documento de integración (mapa pantalla → ruta → endpoint) |

---

## Cómo pedirlo en Claude Code (para que no derive)

El problema típico es pedir "implementá este diseño" y recibir una
reinterpretación. Trabajá **de a una pantalla** y anclá los valores:

1. Primero, una sola vez:
   > Leé `design_handoff_yunta_ui/README.md` completo. Copiá
   > `yunta-tokens.css` a `src/yunta-tokens.css` e importalo en `main.tsx`
   > DESPUÉS de `./index.css`. No pegues su contenido dentro de index.css. De
   > index.css solo borrá el `border-radius: 6px` de los controles. Creá
   > `src/components/ui/index.tsx` con `primitives.tsx`. No implementes
   > pantallas todavía.

2. Después, una pantalla por vez:
   > Implementá la pantalla **Usuarios** según la sección 5 del README y
   > `Yunta-Usuarios.html`. Abrí el HTML y respetá los valores exactos:
   > `grid-template-columns`, paddings, tamaños y pesos tipográficos. Usá las
   > primitivas de `components/ui` y el `Avatar` que ya existe. Radios de la
   > escala: modal 14 · card 12 · control 8 · pill 999 · círculos solo en avatares
   > y dots. Datos con `useStaffUsers` detrás de
   > `VITE_USE_MOCKS`. No inventes colores fuera de la tabla de tokens.

3. Al revisar, pedí la comparación explícita:
   > Compará tu implementación con `Yunta-Usuarios.html` fila por fila y listá las
   > diferencias de espaciado, tamaño, radio y color que encuentres.

Y tres anclas que conviene repetir en **cada** pedido, porque son las que más se
pierden en la traducción:

- **Radios de la escala fija**: modal 14 · card 12 · control 8 · pill 999. Nada
  de `rounded-lg` a ojo ni de mezclar 4px y 6px.
- **Una sola tipografía (Archivo)**; etiquetas en 600 uppercase con tracking
  0.13em, **nunca mono**.
- **El acento terracota en 1–3 lugares por pantalla**, nunca como superficie
  grande.
