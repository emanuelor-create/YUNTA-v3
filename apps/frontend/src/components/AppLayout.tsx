import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

// Sin TopBar por ahora: el usuario y "Salir" viven en el pie del sidebar.
export function AppLayout() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'stretch' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  );
}
