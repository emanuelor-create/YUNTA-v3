# Sidebar — spec visual sobre la estructura que ya existe

**No copies el sidebar del prototipo.** El de `components/Sidebar.tsx` hace más
cosas (colapso persistente, secciones desplegables, proyectos desde
`fetchAllProjects`, toggle de tema, selector de paleta) y todas se conservan.
Este documento es solo el **vestido**: los valores exactos para que se vea como
el resto del sistema.

Todo sale de variables. Ningún hex literal — si no, el selector de paleta no lo
alcanza.

| Rol | Variable |
| --- | --- |
| Fondo | `--sidebar-bg` |
| Fila activa / hover | `--sidebar-surface-2` |
| Separadores | `--sidebar-line` |
| Ítem inactivo | `--sidebar-text` |
| Ítem activo, wordmark | `--sidebar-text-strong` |
| Rótulo de sección | `--sidebar-section` |
| Barra de activo, badges | `--accent` |

## Geometría

- Ancho **252px** expandido, **60px** colapsado. Sin borde derecho: el contraste
  de superficie ya separa.
- `padding: 22px 0`. Los ítems van en un contenedor con `padding: 0 12px` para
  que la fila activa no toque los bordes.
- Fila de navegación: `padding: 10px 12px`, `border-radius: var(--radius)`,
  `gap: 10px`, altura mínima 38px.
- Colapsado: la fila pasa a `padding: 10px 0`, `justify-content: center`, y
  queda **solo el ícono** (el rótulo no se achica, desaparece).

## Bloque del logo

`padding: 0 20px 22px`, `gap: 11px`, `border-bottom: 1px solid --sidebar-line`.
Isologo de 26px (`YuntaMark`) + wordmark 17px/800, `letter-spacing: 0.04em`,
uppercase, `--sidebar-text-strong`. Colapsado: solo el isologo, centrado.

El botón de colapsar va como cuadrado de 22px con `border: 1px solid
--sidebar-line` y `border-radius: var(--radius-tick)`, alineado a la derecha del
bloque.

## Rótulo de sección

`FAVORITOS`, `PROYECTOS`, `ADMINISTRACIÓN`: **Archivo 10.5px/600, tracking
0.13em, uppercase**, color `--sidebar-section`, `padding: 18px 12px 7px`.
Cambiar el `var(--mono)` que usa hoy `SectionLabel`.

El triángulo de desplegar: 8px, mismo color, a la izquierda con `gap: 7px`.
Colapsado: el rótulo se oculta y queda un `border-top: 1px solid --sidebar-line`
de 12px de margen como única separación entre grupos.

## Ítem de navegación

- **Ícono 16px** a la izquierda, `stroke="currentColor"`, `stroke-width: 1.7`,
  en una caja fija de 16px para que todos los rótulos arranquen alineados. El
  ícono hereda el color del texto — no lo pintes aparte. Faltan hoy: agregalos
  siguiendo `features/board/icons.tsx`. Son obligatorios: sin ellos la barra
  colapsada de 60px queda inutilizable.
- Rótulo **14px/500**; el activo pasa a **600**.
- **Inactivo**: texto `--sidebar-text`, fondo transparente.
- **Hover**: fondo `--sidebar-surface-2`, texto `--sidebar-text-strong`. Sin
  transición.
- **Activo**: fondo `--sidebar-surface-2`, texto `--sidebar-text-strong`, peso
  600, y una **barra de acento de 2px a la izquierda** — `box-shadow: inset 2px
  0 0 var(--accent)` para que respete el `border-radius` de la fila.
- **Deshabilitado ("Pronto")**: texto a 55% de opacidad, `cursor: default`, y el
  badge `PRONTO` a la derecha: 9px/600, tracking 0.1em, uppercase,
  `--sidebar-section`, `border: 1px solid --sidebar-line`, `padding: 2px 6px`,
  `border-radius: var(--radius-pill)`.

## Ítems de proyecto

Ícono de carpeta 16px + nombre 14px/400 truncado con ellipsis. Si el proyecto
tiene color, va como **marca de 3×16px** (`border-radius: var(--radius-tick)`)
antes del ícono. Los favoritos usan la estrella rellena en `--accent`.

## Pie

`border-top: 1px solid --sidebar-line`, `padding: 14px 12px 0`, `gap: 10px`.
Contiene, en este orden:

1. **Swatches de paleta** — tres cuadrados de 20px, `gap: 7px`,
   `border-radius: var(--radius-tick)`. El activo lleva `outline: 2px solid
   var(--accent); outline-offset: 2px`. Colapsado: en columna.
2. **Toggle de tema** — fila del mismo alto que un ítem de navegación, con
   ícono 16px + rótulo 13px/500 en `--sidebar-text`. Mismo hover que un ítem.
   No un botón con borde propio: es una fila más.

Los dos controles comparten el mismo lenguaje de fila; no metas un tercer
estilo de botón acá abajo.

## Lo que NO cambia

Colapso con persistencia, secciones desplegables, `fetchAllProjects`, el
`TopBar` con buscador y `AccountMenu`, y el toggle de tema. El diseño no los
contradice: el ancho expandido de 250px ya coincide con los 252px de la spec.

Pendiente tuyo: `NAV_LINKS` tiene hoy "Informe" apuntando a `/projects`. En los
diseños son dos ítems distintos ("Proyectos" e "Informes").
