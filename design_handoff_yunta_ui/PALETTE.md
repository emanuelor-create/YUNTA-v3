# Selector de paleta (preferencia por usuario)

Yunta tiene **dos ejes de color independientes**, y no hay que mezclarlos:

| Eje | Atributo en `<html>` | Valores | Ya existe |
| --- | --- | --- | --- |
| Tema | `data-theme` | `light` \| `dark` | sí — `lib/theme.ts`, `applyTheme()` |
| Paleta | `data-palette` | *(vacío = terracota)* \| `azul` \| `grafito` | no — es esto |

Las tres paletas están definidas en `yunta-tokens.css`. Cambiar el atributo
re-mapea todas las variables; ninguna pantalla necesita cambios.

## Contrato

1. **`lib/palette.ts`** — espejo exacto de `lib/theme.ts`, sin inventar otro
   patrón:

   ```ts
   export type Palette = "terracota" | "azul" | "grafito";

   export const PALETTES: { id: Palette; label: string; swatch: string }[] = [
     { id: "terracota", label: "Terracota", swatch: "#b4552f" },
     { id: "azul",      label: "Azul",      swatch: "#0b5fff" },
     { id: "grafito",   label: "Grafito",   swatch: "#121417" },
   ];

   const KEY = "yunta.palette";

   export function getStoredPalette(): Palette { /* localStorage, default "terracota" */ }

   export function applyPalette(p: Palette) {
     const el = document.documentElement;
     if (p === "terracota") delete el.dataset.palette;
     else el.dataset.palette = p;
     localStorage.setItem(KEY, p);
   }
   ```

2. **Anti-flash.** Aplicar la paleta guardada en un script inline en
   `index.html`, **antes** de que cargue el bundle — igual que el tema. Si se
   hace en un `useEffect`, se ve un parpadeo de terracota en cada recarga.

   ```html
   <script>
     (function () {
       var p = localStorage.getItem("yunta.palette");
       if (p && p !== "terracota") document.documentElement.dataset.palette = p;
     })();
   </script>
   ```

3. **El control va junto al toggle de tema**, al pie del sidebar: tres
   cuadrados de 20px con `border-radius: var(--radius-tick)`, cada uno pintado
   con su `swatch`. El activo lleva `outline: 2px solid var(--accent);
   outline-offset: 2px`. Con la barra colapsada (60px), se apilan en columna.
   No un `<select>`: la elección es visual.

4. **Persistencia por usuario.** `localStorage` alcanza para la v1. Si más
   adelante querés que siga al usuario entre dispositivos, guardalo en el perfil
   (`User.uiPalette`) y hidratá `localStorage` al iniciar sesión — el resto del
   mecanismo no cambia.

## Verificación

- Recargar con paleta elegida: sin parpadeo.
- Cambiar de paleta con el dashboard abierto: cambian sidebar, cards, badges,
  barras y gráficos a la vez. **Cualquier elemento que se quede del color
  anterior tiene un hex hardcodeado** — corregilo a la variable que
  corresponda; ese es el único bug esperable de esta tarea.
- Tema oscuro + paleta azul: siguen siendo ejes independientes, ninguno pisa al
  otro.
