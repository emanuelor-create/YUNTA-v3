import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui';
import { formatFullDate } from '../../lib/formatRelativeTime';
import { useCurrentUser } from '../auth/useCurrentUser';
import { SettingsIcon, StarIcon } from '../board/icons';
import { ProjectSettingsModal } from './ProjectSettingsModal';
import { deriveStatus, dueNote, STATUS_LABEL, STATUS_STYLE } from './projectStatus';
import { ProjectDetail, useProjectDetail } from './useProjectDetail';
import { useToggleFavorite } from './useProjects';

export type ProjectTab = 'resumen' | 'tablero';

export interface ProjectShellContext {
  project: ProjectDetail;
  /// OWNER (o ADMIN global): configuración y personas.
  canManage: boolean;
  /// OWNER o EDITOR (o ADMIN global): crear y mover tarjetas.
  canEdit: boolean;
  openSettings: (focusOwner?: boolean) => void;
}

const TABS: { key: ProjectTab | 'backlog' | 'calendario'; label: string; enabled: boolean }[] = [
  { key: 'resumen', label: 'Resumen', enabled: true },
  { key: 'backlog', label: 'Backlog', enabled: false },
  { key: 'tablero', label: 'Tablero', enabled: true },
  { key: 'calendario', label: 'Calendario', enabled: false },
];

/// Encabezado y pestañas que comparten Resumen y Tablero: breadcrumb, nombre,
/// favorito, estado, engranaje de configuración, "Nueva tarea" y las tabs. El
/// contenido de cada pestaña llega como `children`.
export function ProjectShell({
  projectId,
  active,
  children,
}: {
  projectId: string;
  active: ProjectTab;
  children: (context: ProjectShellContext) => ReactNode;
}) {
  const navigate = useNavigate();
  const now = useMemo(() => new Date(), []);
  const [settings, setSettings] = useState<{ focusOwner: boolean } | null>(null);
  const { data: project, isLoading, isError } = useProjectDetail(projectId);
  const { data: me } = useCurrentUser();
  const toggleFavorite = useToggleFavorite();

  if (isLoading) return <PageMessage>Cargando…</PageMessage>;
  if (isError || !project) return <PageMessage>No se pudo cargar el proyecto.</PageMessage>;

  // El backend exige OWNER (o ADMIN global) para configurar y gestionar
  // personas, y OWNER/EDITOR para tocar tarjetas; acá solo se esconde lo que
  // igual devolvería 403.
  const myRole = project.members.find((m) => m.userId === me?.userId)?.role;
  const isAdmin = me?.profile?.role === 'ADMIN';
  const canManage = myRole === 'OWNER' || isAdmin;
  const canEdit = myRole === 'OWNER' || myRole === 'EDITOR' || isAdmin;

  const status = deriveStatus(project, now);
  const statusStyle = STATUS_STYLE[status];
  const due = dueNote(project, status, now);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <header
        style={{
          padding: '28px 40px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: '1 1 420px' }}>
            <span
              onClick={() => navigate('/projects')}
              style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-3)', cursor: 'pointer' }}
            >
              Proyectos / {project.client ?? 'Sin cliente'}
            </span>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
              <button
                onClick={() => toggleFavorite.mutate({ projectId, isFavorite: !project.isFavorite })}
                title={project.isFavorite ? 'En favoritos' : 'Añadir a favoritos'}
                style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'var(--accent)', flex: 'none', display: 'flex', marginTop: 6 }}
              >
                <StarIcon size={20} filled={project.isFavorite} />
              </button>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, minWidth: 0, overflowWrap: 'anywhere' }}>
                {project.name}
              </h1>
              <span
                style={{
                  display: 'inline-flex',
                  flex: 'none',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 12.5,
                  fontWeight: 500,
                  padding: '6px 12px',
                  marginTop: 1,
                  background: statusStyle.bg,
                  color: statusStyle.fg,
                  border: `1px solid ${statusStyle.bc}`,
                  borderRadius: 'var(--radius-pill)',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusStyle.dot }} />
                {STATUS_LABEL[status]}
              </span>
              {project.archivedAt && <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Archivado</span>}
              {canManage && (
                <button
                  onClick={() => setSettings({ focusOwner: false })}
                  title="Configuración del proyecto"
                  style={{ background: 'transparent', border: 0, padding: 4, cursor: 'pointer', color: 'var(--ink-3)', display: 'flex', flex: 'none', marginTop: 3 }}
                >
                  <SettingsIcon size={18} />
                </button>
              )}
            </div>
            <span style={{ fontSize: 13, color: due.late ? 'var(--accent-ink)' : 'var(--ink-3)' }}>
              Entrega: {formatFullDate(project.endDate)} · {due.text}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, flex: 'none' }}>
            <Button variant="ghost" disabled title="Próximamente">
              Compartir
            </Button>
            <Button
              variant="primary"
              disabled={!canEdit}
              title={canEdit ? undefined : 'Solo lectura en este proyecto'}
              onClick={() => navigate(`/projects/${projectId}/tablero?nueva=1`)}
            >
              Nueva tarea
            </Button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 22 }}>
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            const style = {
              padding: '10px 2px',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              color: isActive ? 'var(--ink)' : tab.enabled ? 'var(--ink-3)' : 'var(--ink-4)',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
            } as const;
            return tab.enabled ? (
              <Link key={tab.key} to={`/projects/${projectId}/${tab.key}`} style={style}>
                {tab.label}
              </Link>
            ) : (
              <span key={tab.key} title="Próximamente" style={style}>
                {tab.label}
              </span>
            );
          })}
        </div>
      </header>

      {children({ project, canManage, canEdit, openSettings: (focusOwner = false) => setSettings({ focusOwner }) })}

      {settings && (
        <ProjectSettingsModal project={project} focusOwner={settings.focusOwner} onClose={() => setSettings(null)} />
      )}
    </div>
  );
}

function PageMessage({ children }: { children: string }) {
  return <div style={{ padding: 56, textAlign: 'center', fontSize: 14, color: 'var(--ink-3)' }}>{children}</div>;
}
