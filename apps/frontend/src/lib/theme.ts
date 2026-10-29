// Modo claro / oscuro (PALETTE.md: eje "Tema", independiente de la paleta).
// `data-theme="dark"` en <html> re-mapea las variables de yunta-tokens.css; la
// elección se guarda por navegador y se aplica antes del bundle en index.html.

export type Theme = 'light' | 'dark';

const KEY = 'yunta.theme';

export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme) {
  const el = document.documentElement;
  if (theme === 'dark') el.dataset.theme = 'dark';
  else delete el.dataset.theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Ventana privada u otro bloqueo: dura hasta recargar.
  }
  window.dispatchEvent(new CustomEvent('yunta:appearance'));
}
