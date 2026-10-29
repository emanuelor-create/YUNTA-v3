import { useEffect, useState } from 'react';
import { applyPalette, getStoredPalette, Palette } from './palette';
import { applyTheme, getStoredTheme, Theme } from './theme';

/// Modo (claro/oscuro) y paleta actuales, sincronizados entre el sidebar y el
/// perfil: cualquiera que los cambie avisa con el evento 'yunta:appearance'.
export function useAppearance() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [palette, setPaletteState] = useState<Palette>(getStoredPalette);

  useEffect(() => {
    const sync = () => {
      setThemeState(getStoredTheme());
      setPaletteState(getStoredPalette());
    };
    window.addEventListener('yunta:appearance', sync);
    return () => window.removeEventListener('yunta:appearance', sync);
  }, []);

  return {
    theme,
    palette,
    setTheme: (next: Theme) => applyTheme(next),
    toggleTheme: () => applyTheme(theme === 'dark' ? 'light' : 'dark'),
    setPalette: (next: Palette) => applyPalette(next),
  };
}

/// true mientras la media query se cumple (p. ej. pantallas bajas).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
