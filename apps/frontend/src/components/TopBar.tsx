import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Avatar } from './Avatar';
import { useCurrentUser } from '../features/auth/useCurrentUser';

export const ROLE_LABEL: Record<string, string> = { ADMIN: 'Administrador', PM: 'Project manager', DEVELOPER: 'Desarrollo' };

/// Barra superior (como SignZen): a la izquierda el botón que pliega el menú; a
/// la derecha nombre, rol y avatar, que llevan a "Mi perfil".
export function TopBar({ onToggleSidebar, collapsed }: { onToggleSidebar: () => void; collapsed: boolean }) {
  const { data: me } = useCurrentUser();
  const location = useLocation();
  const onProfile = location.pathname === '/perfil';
  const [hover, setHover] = useState(false);
  const [menuHover, setMenuHover] = useState(false);
  const name = me?.profile?.name ?? me?.email ?? '';

  return (
    <header
      data-topbar
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        height: 68,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '0 28px 0 20px',
        background: 'var(--card)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <button
        type="button"
        onClick={onToggleSidebar}
        title={collapsed ? 'Expandir el menú' : 'Plegar el menú'}
        aria-label={collapsed ? 'Expandir el menú' : 'Plegar el menú'}
        aria-expanded={!collapsed}
        onMouseEnter={() => setMenuHover(true)}
        onMouseLeave={() => setMenuHover(false)}
        style={{
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 0,
          borderRadius: 'var(--radius)',
          background: menuHover ? 'var(--row-hover)' : 'transparent',
          color: 'var(--ink)',
          cursor: 'pointer',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
      </button>

      {me && (
        <Link
          to="/perfil"
          title="Mi perfil"
          aria-current={onProfile ? 'page' : undefined}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '6px 6px 6px 14px',
            borderRadius: 'var(--radius-card)',
            background: hover || onProfile ? 'var(--row-hover)' : 'transparent',
            textDecoration: 'none',
            minWidth: 0,
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{name}</span>
            <span style={{ fontSize: 12.5, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>
              {me.profile ? ROLE_LABEL[me.profile.role] ?? me.profile.role : 'Sin perfil'} · {me.email}
            </span>
          </span>
          <Avatar seed={me.userId} name={name || '?'} size={40} />
        </Link>
      )}
    </header>
  );
}
