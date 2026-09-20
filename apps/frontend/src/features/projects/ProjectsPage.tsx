import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Button, Label } from '../../components/ui';
import { StarIcon } from '../../features/board/icons';
import { formatFullDate } from '../../lib/formatRelativeTime';
import { useCurrentUser } from '../auth/useCurrentUser';
import { CreateProjectModal } from './CreateProjectModal';
import { deriveStatus, dueNote, STATUS_LABEL, STATUS_STYLE, StatusKey } from './projectStatus';
import { ProjectSummary, useProjects, useToggleFavorite } from './useProjects';

type FilterKey = 'TODOS' | 'EN_CURSO' | 'EN_RIESGO' | 'CERRADOS';
const FILTER_CHIPS: { key: FilterKey; label: string }[] = [
  { key: 'TODOS', label: 'Todos' },
  { key: 'EN_CURSO', label: 'En curso' },
  { key: 'EN_RIESGO', label: 'En riesgo' },
  { key: 'CERRADOS', label: 'Cerrados' },
];

const TABLE_TEMPLATE = 'minmax(200px,2.3fr) 170px 120px 140px minmax(130px,1fr)';

function projectInitials(name: string): string {
  const bigWords = name
    .split(' ')
    .filter((w) => w.length > 3)
    .slice(0, 2);
  const letters = bigWords
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return letters || name.slice(0, 2).toUpperCase();
}

export function ProjectsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data: me } = useCurrentUser();
  // Crear proyectos es de ADMIN y PM (README, Usuarios); un DEVELOPER no ve el botón.
  const canCreate = me?.profile?.role === 'ADMIN' || me?.profile?.role === 'PM';
  const [filter, setFilter] = useState<FilterKey>('TODOS');
  const [query, setQuery] = useState('');
  const { data: projects, isLoading, isError } = useProjects(showArchived);
  const toggleFavorite = useToggleFavorite();
  const navigate = useNavigate();
  const now = useMemo(() => new Date(), []);

  const rows = (projects ?? [])
    .map((project) => ({ project, status: deriveStatus(project, now) }))
    .filter(({ status }) => {
      if (filter === 'TODOS') return true;
      if (filter === 'CERRADOS') return status === 'CERRADO';
      return status === filter;
    })
    .filter(({ project }) => {
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return project.name.toLowerCase().includes(q) || (project.client ?? '').toLowerCase().includes(q);
    });

  const activos = (projects ?? []).filter((p) => deriveStatus(p, now) !== 'CERRADO').length;
  const tareasAbiertas = (projects ?? []).reduce((sum, p) => sum + (p.taskCount - p.doneCount), 0);
  const vencenEstaSemana = (projects ?? []).filter((p) => {
    if (!p.endDate || deriveStatus(p, now) === 'CERRADO') return false;
    const days = Math.round((new Date(p.endDate).getTime() - now.getTime()) / 86_400_000);
    return days >= 0 && days <= 7;
  }).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          padding: '30px 40px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label track="0.15em">Espacio de trabajo</Label>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
              Proyectos
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Ver activos' : 'Ver archivados'}
            </Button>
            {canCreate && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                Nuevo proyecto
              </Button>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            border: '1px solid var(--line)',
            background: 'var(--card)',
            borderRadius: 'var(--radius-card)',
          }}
        >
          <StatCell label="Activos" value={activos} />
          <StatCell label="Tareas abiertas" value={tareasAbiertas} />
          <StatCell label="Vencen esta semana" value={vencenEstaSemana} accent last />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {FILTER_CHIPS.map((chip) => {
              const active = filter === chip.key;
              return (
                <button
                  key={chip.key}
                  onClick={() => setFilter(chip.key)}
                  style={{
                    fontFamily: 'var(--sans)',
                    fontSize: 13,
                    fontWeight: 500,
                    padding: '8px 14px',
                    cursor: 'pointer',
                    border: `1px solid ${active ? 'var(--ink)' : 'var(--line-strong)'}`,
                    background: active ? 'var(--ink)' : 'transparent',
                    color: active ? 'var(--cream)' : 'var(--ink-2)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--card)',
                border: '1px solid var(--line-strong)',
                padding: '0 12px',
                borderRadius: 'var(--radius-card)',
              }}
            >
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar proyecto o cliente"
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 14,
                  color: 'var(--ink)',
                  background: 'transparent',
                  border: 0,
                  padding: '10px 0',
                  width: 230,
                }}
              />
            </span>
          </div>
        </div>
      </header>

      <div style={{ padding: '0 40px 56px', display: 'flex', flexDirection: 'column' }}>
        {/* Con el sidebar abierto la tabla no entra por debajo de ~1250px: scrollea ella, no la página. */}
        <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 880 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: TABLE_TEMPLATE,
            alignItems: 'center',
            gap: 20,
            padding: '16px 20px 12px',
            fontWeight: 600,
            fontSize: 10.5,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            borderBottom: '1px solid var(--line-strong)',
          }}
        >
          <span>Proyecto</span>
          <span>Avance</span>
          <span>Equipo</span>
          <span>Entrega</span>
          <span style={{ textAlign: 'right' }}>Estado</span>
        </div>

        {isLoading && <EmptyRow>Cargando…</EmptyRow>}
        {isError && <EmptyRow>No se pudo cargar la lista de proyectos.</EmptyRow>}
        {!isLoading && !isError && rows.length === 0 && <EmptyRow>Sin resultados.</EmptyRow>}

        {rows.map(({ project, status }) => (
          <ProjectRow
            key={project.id}
            project={project}
            status={status}
            now={now}
            onOpen={() => navigate(`/projects/${project.id}/resumen`)}
            onToggleFavorite={() =>
              toggleFavorite.mutate({ projectId: project.id, isFavorite: !project.isFavorite })
            }
          />
        ))}

        </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '18px 20px',
            fontSize: 13,
            color: 'var(--ink-3)',
          }}
        >
          <span>Mostrando {rows.length} de {projects?.length ?? 0} proyectos</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" disabled>
              Anterior
            </Button>
            <Button variant="ghost" disabled>
              Siguiente
            </Button>
          </span>
        </div>
      </div>
      {creating && <CreateProjectModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function StatCell({ label, value, accent, last }: { label: string; value: number; accent?: boolean; last?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        padding: '14px 22px',
        flex: 1,
        borderRight: last ? undefined : '1px solid var(--line)',
      }}
    >
      <Label track="0.13em">{label}</Label>
      <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: accent && value > 0 ? 'var(--accent)' : 'var(--ink)' }}>
        {value}
      </span>
    </div>
  );
}

function ProjectRow({
  project,
  status,
  now,
  onOpen,
  onToggleFavorite,
}: {
  project: ProjectSummary;
  status: StatusKey;
  now: Date;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) {
  const [hover, setHover] = useState(false);
  const pct = project.taskCount > 0 ? Math.round((project.doneCount / project.taskCount) * 100) : 0;
  const due = dueNote(project, status, now);
  const style = STATUS_STYLE[status];

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      style={{
        display: 'grid',
        gridTemplateColumns: TABLE_TEMPLATE,
        alignItems: 'center',
        gap: 20,
        padding: '18px 20px',
        borderBottom: '1px solid var(--line)',
        cursor: 'pointer',
        background: hover ? 'var(--card)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          title={project.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
          style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'var(--accent)', flex: 'none' }}
        >
          <StarIcon size={16} filled={project.isFavorite} />
        </button>
        <span
          style={{
            width: 34,
            height: 34,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: 12,
            color: 'var(--cream)',
            background: project.color,
          }}
        >
          {projectInitials(project.name)}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            style={{
              fontSize: 15.5,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {project.name}
          </span>
          <span style={{ fontSize: 13, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {project.client ?? 'Sin cliente'} · {project.taskCount} tareas
          </span>
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--ink)' }}>{pct}%</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {project.doneCount}/{project.taskCount}
          </span>
        </span>
        <span style={{ height: 4, background: 'var(--line)', display: 'block', width: '100%' }}>
          <span style={{ display: 'block', height: 4, background: project.color, width: `${pct}%` }} />
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center' }}>
        {project.team.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--ink-4)' }}>Sin equipo</span>}
        {project.team.slice(0, 4).map((member, i) => (
          <Avatar
            key={member.id}
            seed={member.id}
            name={member.name}
            size={28}
            style={{ marginLeft: i === 0 ? 0 : -8, border: '2px solid var(--page)' }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: due.late ? 'var(--accent)' : 'var(--ink)' }}>
          {formatFullDate(project.endDate)}
        </span>
        <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--ink-3)' }}>{due.text}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12.5,
            fontWeight: 500,
            padding: '6px 12px',
            background: style.bg,
            color: style.fg,
            border: `1px solid ${style.bc}`,
            borderRadius: 'var(--radius-pill)',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: style.dot }} />
          {STATUS_LABEL[status]}
        </span>
        <span style={{ fontSize: 18, lineHeight: 1, color: 'var(--ink-4)', padding: '0 2px' }}>···</span>
      </div>
    </div>
  );
}

function EmptyRow({ children }: { children: string }) {
  return (
    <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13.5, color: 'var(--ink-3)' }}>{children}</div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth={2}>
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}
