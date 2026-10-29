import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const COLLAPSE_STORAGE_KEY = 'yunta:sidebar-collapsed';

function getStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/// Menú lateral fijo (alto de la ventana, sin scroll) + barra superior con el
/// usuario; el contenido scrollea solo.
export function AppLayout() {
  const [collapsed, setCollapsed] = useState(getStoredCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, String(collapsed));
    } catch {
      // Ventana privada u otro bloqueo de localStorage: no es crítico.
    }
  }, [collapsed]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'flex-start' }}>
      <Sidebar collapsed={collapsed} />
      <div style={{ flex: 1, minWidth: 0, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <TopBar collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)} />
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
