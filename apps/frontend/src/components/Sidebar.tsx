import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { YuntaMark, YuntaWordmark } from './YuntaLogo';
import { useAuth } from '../features/auth/AuthProvider';
import { useCurrentUser } from '../features/auth/useCurrentUser';
import { useDashboard } from '../features/dashboard/useDashboard';
import { CreateProjectModal } from '../features/projects/CreateProjectModal';
import { useProjects } from '../features/projects/useProjects';
import { ChevronIcon, DashboardIcon, FolderIcon, LogoutIcon, PlusIcon, StarIcon, UsersIcon } from '../features/board/icons';
import { useAppearance, useMediaQuery } from '../lib/appearance';
import { paletteColor } from '../lib/brandColor';
import { CAPACITY } from '../lib/capacity';

/// Cuántos favoritos entran en el menú. Con más, "Ver todos" lleva a Proyectos:
/// el sidebar nunca scrollea (la lista completa vive en Proyectos).
const MAX_FAVORITES = 5;

export const SIDEBAR_WIDTH = 248;
export const SIDEBAR_COLLAPSED_WIDTH = 64;

/// Menú lateral (estructura de SignZen, tokens de Yunta): logo, botón principal,
/// navegación con grupos plegables, la tarjeta "Tu carga" y al pie "Cerrar
/// sesión" + modo oscuro. Ocupa el alto de la ventana y no scrollea.
export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { signOut } = useAuth();
  const { data: me } = useCurrentUser();
  const { data: projects } = useProjects();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useAppearance();
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [creating, setCreating] = useState(false);
  // En ventanas bajas la tarjeta de carga cede su lugar a la navegación.
  const short = useMediaQuery('(max-height: 640px)');

  const role = me?.profile?.role;
  const canCreate = role === 'ADMIN' || role === 'PM';
  const favorites = (projects ?? []).filter((p) => p.isFavorite);

  const isActive = (to: string) => location.pathname === to || location.pathname.startsWith(`${to}/`);
  const inProject = (id: string) => location.pathname.startsWith(`/projects/${id}`);

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <aside
      data-sidebar
      style={{
        width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
        flex: 'none',
        height: '100vh',
        position: 'sticky',
        top: 0,
        overflow: 'hidden',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--sidebar-line)',
        display: 'flex',
        flexDirection: 'column',
        padding: collapsed ? '18px 10px 14px' : '18px 12px 14px',
        transition: 'width 160ms ease',
      }}
    >
      <Link
        to="/dashboard"
        title="Yunta"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11, padding: '4px 0 20px', textDecoration: 'none' }}
      >
        <YuntaMark size={collapsed ? 28 : 30} />
        {!collapsed && <YuntaWordmark style={{ fontSize: 20 }} />}
      </Link>

      {canCreate && (
        <PrimaryAction collapsed={collapsed} onClick={() => setCreating(true)}>
          Nuevo proyecto
        </PrimaryAction>
      )}

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: canCreate ? 12 : 0, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <NavItem to="/dashboard" icon={<DashboardIcon size={17} />} label="Dashboard" collapsed={collapsed} active={isActive('/dashboard')} />
        <NavItem to="/projects" icon={<FolderIcon size={17} />} label="Proyectos" collapsed={collapsed} active={location.pathname === '/projects'} />

        {collapsed ? (
          <NavItem
            to="/projects"
            icon={<StarIcon size={17} filled={favorites.some((p) => inProject(p.id))} />}
            label={`Favoritos${favorites.length ? ` (${favorites.length})` : ''}`}
            collapsed
            active={favorites.some((p) => inProject(p.id))}
          />
        ) : (
          <>
            <Row
              icon={<StarIcon size={17} />}
              label="Favoritos"
              onClick={() => setFavoritesOpen((v) => !v)}
              trailing={<ChevronIcon size={9} direction={favoritesOpen ? 'down' : 'right'} />}
              ariaExpanded={favoritesOpen}
            />
            {favoritesOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingLeft: 14 }}>
                {favorites.slice(0, MAX_FAVORITES).map((project) => (
                  <Link key={project.id} to={`/projects/${project.id}/resumen`} style={{ textDecoration: 'none' }}>
                    <Row
                      icon={<span style={{ width: 3, height: 14, borderRadius: 'var(--radius-tick)', background: paletteColor(project.color), boxShadow: '0 0 0 1px var(--line-on-dark)' }} />}
                      label={project.name}
                      active={inProject(project.id)}
                      small
                    />
                  </Link>
                ))}
                {favorites.length === 0 && (
                  <span style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--sidebar-section)', padding: '6px 12px 8px' }}>Marcá proyectos con ★ para tenerlos acá.</span>
                )}
                {favorites.length > MAX_FAVORITES && (
                  <Link to="/projects" style={{ textDecoration: 'none' }}>
                    <Row label={`Ver los ${favorites.length} favoritos`} small muted />
                  </Link>
                )}
              </div>
            )}
          </>
        )}

        {role === 'ADMIN' && (
          <NavItem to="/admin/users" icon={<UsersIcon size={17} />} label="Usuarios" collapsed={collapsed} active={isActive('/admin/users')} />
        )}
      </nav>

      {!collapsed && !short && <WorkloadCard />}

      <div
        style={{
          display: 'flex',
          flexDirection: collapsed ? 'column' : 'row',
          alignItems: 'center',
          gap: collapsed ? 6 : 4,
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid var(--sidebar-line)',
        }}
      >
        <button type="button" onClick={handleSignOut} title="Cerrar sesión" style={{ ...bare, flex: collapsed ? 'none' : 1 }}>
          <Row icon={<LogoutIcon size={17} />} label="Cerrar sesión" collapsedIcon={collapsed} />
        </button>
        <IconButton title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'} pressed={theme === 'dark'} onClick={toggleTheme}>
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </IconButton>
      </div>

      {creating && <CreateProjectModal onClose={() => setCreating(false)} />}
    </aside>
  );
}

const bare = { background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'var(--sans)', textAlign: 'left' as const, minWidth: 0 };

/// "Tu carga": tus tareas abiertas contra la capacidad del equipo (la misma
/// cuenta del Dashboard), en el lugar donde SignZen muestra el plan.
function WorkloadCard() {
  const { data } = useDashboard();
  if (!data) return null;
  const { assigned, overdue, dueSoon } = data.me;
  const pct = Math.min(100, (assigned / CAPACITY) * 100);
  const over = assigned > CAPACITY;
  return (
    <Link to="/dashboard" data-workload style={{ textDecoration: 'none', marginTop: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '12px 14px', background: 'var(--sidebar-surface-2)', borderRadius: 'var(--radius-card)' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sidebar-text-strong)' }}>Tu carga</span>
          <span style={{ fontSize: 12, color: over ? 'var(--accent)' : 'var(--sidebar-text)' }}>
            {assigned} / {CAPACITY}
          </span>
        </span>
        <span style={{ height: 5, borderRadius: 3, background: 'var(--sidebar-line)', overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: over ? 'var(--accent)' : 'var(--sidebar-text-strong)', borderRadius: 3 }} />
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--sidebar-text)' }}>
          {overdue > 0 ? <span style={{ color: 'var(--accent)' }}>{overdue} {overdue === 1 ? 'vencida' : 'vencidas'}</span> : 'Nada vencido'} · {dueSoon}{' '}
          {dueSoon === 1 ? 'vence' : 'vencen'} esta semana
        </span>
      </div>
    </Link>
  );
}

function PrimaryAction({ children, onClick, collapsed }: { children: string; onClick: () => void; collapsed: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? children : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        width: '100%',
        height: 42,
        flex: 'none',
        fontFamily: 'var(--sans)',
        fontSize: 14,
        fontWeight: 600,
        color: '#ffffff',
        background: 'var(--accent)',
        filter: hover ? 'brightness(1.08)' : undefined,
        border: 0,
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
      }}
    >
      <PlusIcon size={16} />
      {!collapsed && children}
    </button>
  );
}

function NavItem({ to, icon, label, collapsed, active }: { to: string; icon: ReactNode; label: string; collapsed: boolean; active?: boolean }) {
  return (
    <Link to={to} style={{ textDecoration: 'none' }} title={collapsed ? label : undefined} aria-current={active ? 'page' : undefined}>
      <Row icon={icon} label={label} active={active} collapsedIcon={collapsed} />
    </Link>
  );
}

/// Fila del menú. `collapsedIcon`: solo el ícono, centrado (barra angosta).
function Row({
  icon,
  label,
  active,
  onClick,
  trailing,
  collapsedIcon,
  small,
  muted,
  ariaExpanded,
}: {
  icon?: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  trailing?: ReactNode;
  collapsedIcon?: boolean;
  small?: boolean;
  muted?: boolean;
  ariaExpanded?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const lit = active || hover;
  const content = (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={collapsedIcon ? label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        height: small ? 32 : 38,
        padding: collapsedIcon ? 0 : '0 12px',
        justifyContent: collapsedIcon ? 'center' : 'flex-start',
        borderRadius: 'var(--radius)',
        background: lit ? 'var(--sidebar-surface-2)' : 'transparent',
        color: lit ? 'var(--sidebar-text-strong)' : muted ? 'var(--sidebar-section)' : 'var(--sidebar-text)',
        fontFamily: 'var(--sans)',
        fontSize: small ? 13.5 : 14.5,
        fontWeight: active ? 600 : 500,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {icon && <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{icon}</span>}
      {!collapsedIcon && <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
      {!collapsedIcon && trailing && <span style={{ display: 'flex', opacity: 0.8 }}>{trailing}</span>}
    </span>
  );
  if (!onClick) return content;
  return (
    <button type="button" onClick={onClick} aria-expanded={ariaExpanded} style={{ ...bare, width: '100%' }}>
      {content}
    </button>
  );
}

function IconButton({ children, title, onClick, pressed }: { children: ReactNode; title: string; onClick: () => void; pressed?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 38,
        height: 38,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius)',
        border: 0,
        cursor: 'pointer',
        background: hover ? 'var(--sidebar-surface-2)' : 'transparent',
        color: hover ? 'var(--sidebar-text-strong)' : 'var(--sidebar-text)',
      }}
    >
      {children}
    </button>
  );
}

export function MoonIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  );
}

export function SunIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
