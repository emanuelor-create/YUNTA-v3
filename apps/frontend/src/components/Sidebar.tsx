import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Avatar } from './Avatar';
import { YuntaMark } from './YuntaLogo';
import { useAuth } from '../features/auth/AuthProvider';
import { useCurrentUser } from '../features/auth/useCurrentUser';
import { useProjects } from '../features/projects/useProjects';
import { ChevronIcon, DashboardIcon, FolderIcon, LogoutIcon, SettingsIcon, StarIcon, UsersIcon } from '../features/board/icons';

const COLLAPSE_STORAGE_KEY = 'yunta:sidebar-collapsed';
const ROLE_LABEL: Record<string, string> = { ADMIN: 'Admin', PM: 'PM', DEVELOPER: 'Developer' };

function getStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

type SectionKey = 'favoritos' | 'proyectos' | 'administracion';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(getStoredCollapsed);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    favoritos: true,
    proyectos: true,
    administracion: true,
  });
  const { signOut } = useAuth();
  const { data: me } = useCurrentUser();
  const { data: projects } = useProjects();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, String(collapsed));
    } catch {
      // Ventana privada u otro bloqueo de localStorage: no es crítico.
    }
  }, [collapsed]);

  function toggleSection(key: SectionKey) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  function isActive(to: string): boolean {
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  }

  return (
    <aside
      style={{
        width: collapsed ? 60 : 252,
        flex: 'none',
        background: 'var(--sidebar-bg)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '22px 0',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div
          style={{
            padding: collapsed ? '0 0 22px' : '0 20px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            borderBottom: '1px solid var(--sidebar-line)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <YuntaMark size={26} />
            {!collapsed && (
              <span
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--sidebar-text-strong)',
                }}
              >
                Yunta
              </span>
            )}
          </div>
          {!collapsed && (
            <CollapseButton onClick={() => setCollapsed(true)} direction="left" title="Colapsar" />
          )}
        </div>

        {collapsed && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
            <CollapseButton onClick={() => setCollapsed(false)} direction="right" title="Expandir" />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 8px 0' }}>
          <NavItem
            to="/dashboard"
            icon={<DashboardIcon size={16} />}
            label="Dashboard"
            collapsed={collapsed}
            active={isActive('/dashboard')}
          />
          <NavItem
            to="/projects"
            icon={<FolderIcon size={16} />}
            label="Todos los proyectos"
            collapsed={collapsed}
            active={location.pathname === '/projects'}
          />
        </div>

        <SidebarSection
          label="Favoritos"
          collapsed={collapsed}
          open={openSections.favoritos}
          onToggle={() => toggleSection('favoritos')}
        >
          {(projects ?? [])
            .filter((project) => project.isFavorite)
            .map((project) => (
              <NavItem
                key={project.id}
                to={`/projects/${project.id}/resumen`}
                icon={<StarIcon size={16} filled />}
                label={project.name}
                collapsed={collapsed}
                active={isActive(`/projects/${project.id}`)}
              />
            ))}
          {!(projects ?? []).some((project) => project.isFavorite) && !collapsed && (
            <span style={{ fontSize: 12.5, color: 'var(--sidebar-text)', padding: '4px 12px 8px' }}>
              Sin favoritos todavía
            </span>
          )}
        </SidebarSection>

        <SidebarSection
          label="Proyectos"
          collapsed={collapsed}
          open={openSections.proyectos}
          onToggle={() => toggleSection('proyectos')}
        >
          {(projects ?? []).map((project) => (
            <NavItem
              key={project.id}
              to={`/projects/${project.id}/resumen`}
              icon={<FolderIcon size={16} />}
              label={project.name}
              tint={project.color}
              collapsed={collapsed}
              active={isActive(`/projects/${project.id}`)}
            />
          ))}
          {projects?.length === 0 && !collapsed && (
            <span style={{ fontSize: 12.5, color: 'var(--sidebar-text)', padding: '4px 12px 8px' }}>
              No sos miembro de ningún proyecto
            </span>
          )}
        </SidebarSection>

        <SidebarSection
          label="Administración"
          collapsed={collapsed}
          open={openSections.administracion}
          onToggle={() => toggleSection('administracion')}
        >
          <NavItem
            to="/admin/users"
            icon={<UsersIcon size={16} />}
            label="Usuarios"
            collapsed={collapsed}
            active={isActive('/admin/users')}
          />
          <NavItem icon={<SettingsIcon size={16} />} label="Ajustes" collapsed={collapsed} disabled />
        </SidebarSection>
      </div>

      <div
        style={{
          borderTop: '1px solid var(--sidebar-line)',
          padding: '14px 12px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {me?.profile && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: '0 0 4px',
            }}
          >
            <Avatar seed={me.userId} name={me.profile.name} size={32} />
            {!collapsed && (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--sidebar-text-strong)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {me.profile.name}
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 10.5,
                    letterSpacing: '0.12em',
                    color: 'var(--sidebar-section)',
                  }}
                >
                  {ROLE_LABEL[me.profile.role] ?? me.profile.role}
                </span>
              </span>
            )}
          </div>
        )}

        <SidebarRow
          icon={<LogoutIcon size={16} />}
          label="Salir"
          collapsed={collapsed}
          onClick={handleSignOut}
        />
      </div>
    </aside>
  );
}

function CollapseButton({
  onClick,
  direction,
  title,
}: {
  onClick: () => void;
  direction: 'left' | 'right';
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 22,
        height: 22,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid var(--sidebar-line)',
        borderRadius: 'var(--radius-tick)',
        background: 'transparent',
        color: 'var(--sidebar-text)',
        cursor: 'pointer',
      }}
    >
      <ChevronIcon size={9} direction={direction} />
    </button>
  );
}

function SidebarSection({
  label,
  collapsed,
  open,
  onToggle,
  children,
}: {
  label: string;
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  if (collapsed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ borderTop: '1px solid var(--sidebar-line)', margin: '12px 12px 0' }} />
        <div style={{ padding: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '18px 12px 7px',
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          fontFamily: 'var(--sans)',
          fontWeight: 600,
          fontSize: 10.5,
          letterSpacing: '0.13em',
          textTransform: 'uppercase',
          color: 'var(--sidebar-section)',
          width: '100%',
        }}
      >
        <ChevronIcon size={8} direction={open ? 'down' : 'right'} />
        {label}
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 12px' }}>{children}</div>}
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  tint,
  collapsed,
  active,
  disabled,
}: {
  to?: string;
  icon: ReactNode;
  label: string;
  /** Marca de color del proyecto (SIDEBAR.md: 3×16px antes del ícono). */
  tint?: string;
  collapsed: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  if (disabled || !to) {
    return (
      <SidebarRow icon={icon} label={label} collapsed={collapsed} disabled={disabled} badge={disabled ? 'Pronto' : undefined} />
    );
  }
  return (
    <Link to={to} style={{ textDecoration: 'none' }} title={collapsed ? label : undefined}>
      <SidebarRow icon={icon} label={label} tint={tint} collapsed={collapsed} active={active} />
    </Link>
  );
}

function SidebarRow({
  icon,
  label,
  tint,
  collapsed,
  active,
  disabled,
  badge,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  tint?: string;
  collapsed: boolean;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const highlighted = !disabled && (active || hover);

  const row = (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={collapsed ? label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 38,
        padding: collapsed ? '10px 0' : '10px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 'var(--radius)',
        background: highlighted ? 'var(--sidebar-surface-2)' : 'transparent',
        color: highlighted ? 'var(--sidebar-text-strong)' : 'var(--sidebar-text)',
        fontFamily: 'var(--sans)',
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'default' : 'pointer',
        boxShadow: active ? 'inset 2px 0 0 var(--accent)' : undefined,
        width: '100%',
        border: 0,
        textAlign: 'left',
      }}
    >
      {tint && !collapsed && (
        <span
          style={{
            width: 3,
            height: 16,
            flex: 'none',
            background: tint,
            borderRadius: 'var(--radius-tick)',
            // Un proyecto de color tinta es del mismo tono que el fondo del
            // sidebar: sin contorno, su marca no se ve.
            boxShadow: '0 0 0 1px var(--line-on-dark)',
          }}
        />
      )}
      <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        {icon}
      </span>
      {!collapsed && (
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
      {!collapsed && badge && (
        <span
          style={{
            fontWeight: 600,
            fontSize: 9,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--sidebar-section)',
            border: '1px solid var(--sidebar-line)',
            padding: '2px 6px',
            borderRadius: 'var(--radius-pill)',
            flex: 'none',
          }}
        >
          {badge}
        </span>
      )}
    </span>
  );

  if (!onClick) return row;
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}>
      {row}
    </button>
  );
}
