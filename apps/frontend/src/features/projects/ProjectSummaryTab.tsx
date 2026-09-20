import { useMemo, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Button, Card, CardHeader, Label, SegmentedBar } from '../../components/ui';
import { ApiError } from '../../lib/apiClient';
import { formatFullDate, formatRelativeTime } from '../../lib/formatRelativeTime';
import { CheckIcon, ClockIcon, PlusIcon, RefreshIcon } from '../board/icons';
import { ProjectShell } from './ProjectShell';
import { deriveStatus, dueNote } from './projectStatus';
import {
  ProjectMemberRole,
  useAddMember,
  useProjectActivity,
  useProjectDetail,
  useProjectStats,
  useRemoveMember,
} from './useProjectDetail';

type Detail = NonNullable<ReturnType<typeof useProjectDetail>['data']>;
type Stats = NonNullable<ReturnType<typeof useProjectStats>['data']>;

// BACKEND.md §1: el tablero tiene N columnas arbitrarias, no las 4 categorías
// del mock. El color sale de la posición: la primera ("por hacer") en neutro,
// la última (siempre "completado") en tinta, y las del medio ciclan la escala
// de marca.
const MIDDLE_COLUMN_COLORS = ['var(--accent)', 'var(--clay)', 'var(--stone)'];

function columnColor(index: number, count: number): string {
  if (index === count - 1) return 'var(--ink)';
  if (index === 0) return 'var(--neutral)';
  return MIDDLE_COLUMN_COLORS[(index - 1) % MIDDLE_COLUMN_COLORS.length];
}

const PROGRESS_STAGES: { key: '0' | '25' | '50' | '75' | '100'; label: string; color: string }[] = [
  { key: '0', label: '0%', color: 'var(--neutral)' },
  { key: '25', label: '25%', color: 'var(--ink-3)' },
  { key: '50', label: '50%', color: 'var(--accent)' },
  { key: '75', label: '75%', color: 'var(--clay)' },
  { key: '100', label: '100%', color: 'var(--ink)' },
];

const ROLE_LABEL: Record<ProjectMemberRole, string> = { OWNER: 'Owner', EDITOR: 'Editor', VIEWER: 'Viewer' };

const ROLE_BADGE_STYLE: Record<ProjectMemberRole, CSSProperties> = {
  OWNER: { background: 'var(--ink)', color: 'var(--cream)', borderColor: 'var(--ink)' },
  EDITOR: { background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderColor: 'var(--accent-line)' },
  VIEWER: { background: 'var(--card)', color: 'var(--ink-2)', borderColor: 'var(--line-strong)' },
};

// Referencia de permisos (README §4, "PROJECT_MEMBER_ROLE_HINTS"): los tres
// roles. Ese módulo (features/clients/types.ts) no existe todavía en este
// repo, así que viven acá hasta que exista.
const ROLE_HINTS: { role: ProjectMemberRole; text: string }[] = [
  { role: 'OWNER', text: 'Todo lo del Editor, más gestionar personas y la configuración.' },
  { role: 'EDITOR', text: 'Crea, edita y mueve tareas del proyecto.' },
  { role: 'VIEWER', text: 'Solo consulta el tablero y comenta.' },
];

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

export function ProjectSummaryTab() {
  const { id } = useParams<{ id: string }>();
  const projectId = id!;
  return (
    <ProjectShell projectId={projectId} active="resumen">
      {({ project, canManage, openSettings }) => (
        <SummaryBody projectId={projectId} project={project} canManage={canManage} onChangeOwner={() => openSettings(true)} />
      )}
    </ProjectShell>
  );
}

function SummaryBody({
  projectId,
  project,
  canManage,
  onChangeOwner,
}: {
  projectId: string;
  project: Detail;
  canManage: boolean;
  onChangeOwner: () => void;
}) {
  const now = useMemo(() => new Date(), []);
  const { data: stats, isLoading, isError } = useProjectStats(projectId);
  const { data: activity } = useProjectActivity(projectId);

  if (isLoading) return <PageMessage>Cargando…</PageMessage>;
  if (isError || !stats) return <PageMessage>No se pudo cargar el resumen.</PageMessage>;

  return (
    <div style={{ padding: '28px 40px 56px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Fila 1: cada card ocupa lo que necesita (align-items: start); estirar Actividad dejaba un bloque vacío. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 24, alignItems: 'start' }}>
        <AvanceCard project={project} stats={stats} now={now} />
        <ActividadCard entries={activity ?? []} />
      </div>
      <PersonasCard projectId={projectId} project={project} canManage={canManage} onChangeOwner={onChangeOwner} />
    </div>
  );
}

function PageMessage({ children }: { children: string }) {
  return <div style={{ padding: 56, textAlign: 'center', fontSize: 14, color: 'var(--ink-3)' }}>{children}</div>;
}

// ── Bloque 1: Avance del proyecto ────────────────────────────────────────

function AvanceCard({ project, stats, now }: { project: Detail; stats: Stats; now: Date }) {
  // Una sola definición de "completada": stats.cards, del mismo snapshot que
  // stats.points (ver ProjectStats.cards en el backend). Si el % de tarjetas
  // y el de puntos difieren, es porque las tarjetas cerradas pesan distinto.
  const { total: totalCards, completed: doneCards } = stats.cards;
  const maxProgressCount = Math.max(1, ...PROGRESS_STAGES.map((s) => stats.byProgress[s.key]));
  const stuck = stats.byProgress['25'] + stats.byProgress['50'] + stats.byProgress['75'];

  const status = deriveStatus(project, now);
  const closed = status === 'CERRADO';
  const hasSchedule = !!project.startDate && !!project.endDate;
  let elapsedPct = 0;
  if (hasSchedule) {
    const start = new Date(project.startDate!).getTime();
    const end = new Date(project.endDate!).getTime();
    elapsedPct = closed || end <= start ? 100 : Math.min(100, Math.max(0, ((now.getTime() - start) / (end - start)) * 100));
  }
  const due = dueNote(project, status, now);
  const scheduleText = closed ? `Entregado el ${formatFullDate(project.endDate)}` : due.text;

  const columns = stats.byColumn;

  return (
    <Card>
      <CardHeader title="Avance del proyecto" subtitle="Últimos 7 días" />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 26, padding: '22px 24px', flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {pct(doneCards, totalCards)}% completado
            </span>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              {doneCards}/{totalCards} tarjetas
            </span>
          </div>
          <SegmentedBar
            segments={columns.map((col, i) => ({ n: col.count, color: columnColor(i, columns.length) }))}
          />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0,1fr))`, gap: 14 }}>
            {columns.map((col, i) => (
              <div
                key={col.columnId}
                style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 11, borderLeft: `2px solid ${columnColor(i, columns.length)}` }}
              >
                <span style={{ fontSize: 12, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {col.name}
                </span>
                <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {col.count}
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', marginLeft: 6 }}>
                    {pct(col.count, totalCards)}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--line)', borderRadius: 'var(--radius-card)' }}>
          <KpiTile icon={<CheckIcon size={17} />} label="Finalizadas" value={stats.window.completed} window="Últimos 7 días" />
          <KpiTile icon={<RefreshIcon size={17} />} label="Actualizadas" value={stats.window.updated} window="Últimos 7 días" right />
          <KpiTile icon={<PlusIcon size={17} />} label="Creadas" value={stats.window.created} window="Últimos 7 días" top />
          <KpiTile icon={<ClockIcon size={17} />} label="Vencen pronto" value={stats.window.dueSoon} window="Próximos 7 días" accent top right />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Label track="0.13em">Tarjetas por avance</Label>
          {PROGRESS_STAGES.map((stage) => {
            const n = stats.byProgress[stage.key];
            return (
              <div key={stage.key} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) 30px 42px', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{stage.label}</span>
                <span style={{ height: 8, width: '100%', background: 'var(--neutral-soft)', display: 'block' }}>
                  <span style={{ display: 'block', height: 8, width: `${(n / maxProgressCount) * 100}%`, background: stage.color }} />
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: n === 0 ? 'var(--ink-4)' : 'var(--ink)', textAlign: 'right' }}>{n}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)', textAlign: 'right' }}>{pct(n, totalCards)}%</span>
              </div>
            );
          })}
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{stuck} en curso sin cerrar</span>
        </div>

        <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 'var(--radius-card)' }}>
          <KpiCell label="Puntos cerrados" value={`${stats.points.completed}/${stats.points.total}`} suffix="pts" />
          <KpiCell label="Tamaño promedio" value={stats.points.avg.toFixed(1)} suffix="pts" />
          <KpiCell label="A dividir" value={stats.points.toSplit} suffix={stats.points.toSplit === 1 ? 'tarjeta' : 'tarjetas'} accent={stats.points.toSplit > 0} last />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Label track="0.13em">Cronograma</Label>
          {hasSchedule ? (
            <>
              <div style={{ position: 'relative', height: 8, width: '100%', background: 'var(--neutral-soft)', borderRadius: 'var(--radius-pill)' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: 8,
                    width: `${elapsedPct}%`,
                    background: 'var(--neutral)',
                    borderRadius: 'var(--radius-pill)',
                  }}
                />
                {!closed && (
                  <span
                    style={{
                      position: 'absolute',
                      left: `${elapsedPct}%`,
                      top: -4,
                      width: 2,
                      height: 16,
                      marginLeft: -1,
                      background: 'var(--accent)',
                    }}
                  />
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: 'var(--ink-3)' }}>
                <span>{formatFullDate(project.startDate)}</span>
                <span style={{ fontWeight: 600, color: !closed && due.late ? 'var(--accent-ink)' : 'var(--ink-2)' }}>
                  {closed ? scheduleText : `Hoy · ${scheduleText}`}
                </span>
                <span>{formatFullDate(project.endDate)}</span>
              </div>
            </>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>Sin fechas definidas.</span>
          )}
        </div>
      </div>
    </Card>
  );
}

// KPI de la grilla 2×2: ícono enmarcado de 34px + valor + nombre + ventana.
function KpiTile({
  icon,
  label,
  value,
  window,
  accent,
  top,
  right,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  window: string;
  accent?: boolean;
  /// Hairline superior (segunda fila) / derecho (primera columna).
  top?: boolean;
  right?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '16px 20px',
        borderTop: top ? '1px solid var(--line)' : undefined,
        borderLeft: right ? '1px solid var(--line)' : undefined,
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 34,
          height: 34,
          flex: 'none',
          border: `1px solid ${accent && value > 0 ? 'var(--accent-line)' : 'var(--line)'}`,
          background: accent && value > 0 ? 'var(--accent-soft)' : 'transparent',
          color: accent && value > 0 ? 'var(--accent)' : 'var(--ink-2)',
          borderRadius: 'var(--radius)',
        }}
      >
        {icon}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, color: accent && value > 0 ? 'var(--accent)' : 'var(--ink)' }}>
          {value}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span>
        <Label track="0.1em">{window}</Label>
      </div>
    </div>
  );
}

function KpiCell({
  label,
  value,
  suffix,
  accent,
  last,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '14px 20px', flex: 1, borderRight: last ? undefined : '1px solid var(--line)' }}>
      <Label track="0.12em">{label}</Label>
      <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: accent ? 'var(--accent)' : 'var(--ink)' }}>
        {value}
        {suffix && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-3)', marginLeft: 5 }}>{suffix}</span>}
      </span>
    </div>
  );
}

// ── Bloque 2: Actividad reciente ─────────────────────────────────────────

function ActividadCard({
  entries,
}: {
  entries: { id: string; message: string; cardTitle: string | null; createdAt: string; user: { id: string; name: string } }[];
}) {
  return (
    <Card>
      <CardHeader title="Actividad reciente" />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {entries.length === 0 && (
          <div style={{ padding: '24px', fontSize: 13.5, color: 'var(--ink-3)' }}>Sin actividad todavía.</div>
        )}
        {entries.map((entry, i) => (
          <div
            key={entry.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px minmax(0,1fr) auto',
              alignItems: 'start',
              gap: 12,
              padding: '14px 24px',
              borderTop: i === 0 ? undefined : '1px solid var(--line-soft)',
            }}
          >
            <Avatar seed={entry.user.id} name={entry.user.name} size={28} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>
                <strong style={{ fontWeight: 600 }}>{entry.user.name}</strong> {entry.message}
              </span>
              {entry.cardTitle && <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>en "{entry.cardTitle}"</span>}
            </div>
            <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>{formatRelativeTime(entry.createdAt)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Bloque 3: Personas ───────────────────────────────────────────────────

function RoleBadge({ role }: { role: ProjectMemberRole }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        flex: 'none',
        fontWeight: 600,
        fontSize: 10.5,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '5px 10px',
        border: '1px solid',
        borderRadius: 'var(--radius-pill)',
        ...ROLE_BADGE_STYLE[role],
      }}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

function PersonasCard({
  projectId,
  project,
  canManage,
  onChangeOwner,
}: {
  projectId: string;
  project: Detail;
  canManage: boolean;
  onChangeOwner: () => void;
}) {
  const addMember = useAddMember(projectId);
  const removeMember = useRemoveMember(projectId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProjectMemberRole>('EDITOR');
  const [removeError, setRemoveError] = useState<string | null>(null);

  const responsable = project.members.find((m) => m.role === 'OWNER') ?? project.members[0] ?? null;
  const team = project.members.filter((m) => m.userId !== responsable?.userId);

  function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    addMember.mutate({ email: email.trim(), role }, { onSuccess: () => setEmail('') });
  }

  function handleRemove(userId: string) {
    setRemoveError(null);
    removeMember.mutate(userId, {
      onError: (err) => setRemoveError(err instanceof ApiError ? err.message : 'No se pudo quitar al miembro.'),
    });
  }

  return (
    <Card>
      <CardHeader title="Personas" />
      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '22px 24px', borderRight: '1px solid var(--line)' }}>
          <Label track="0.13em">Responsable</Label>
          {responsable ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                background: 'var(--accent-soft)',
                borderRadius: 'var(--radius-card)',
              }}
            >
              <Avatar seed={responsable.userId} name={responsable.name} size={34} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{responsable.name}</span>
                <span style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>
                  {ROLE_LABEL[responsable.role]} · {responsable.email}
                </span>
              </div>
              {canManage && (
                <Button variant="ghost" onClick={onChangeOwner}>
                  Cambiar
                </Button>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>Sin miembros todavía.</span>
          )}

          <Label track="0.13em">Equipo</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {team.length === 0 && <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>Sin otros miembros todavía.</span>}
            {team.map((member) => (
              <div
                key={member.userId}
                style={{ display: 'grid', gridTemplateColumns: '32px minmax(0,1fr) auto auto', alignItems: 'center', gap: 12, padding: '10px 4px' }}
              >
                <Avatar seed={member.userId} name={member.name} size={32} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{member.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    {member.openCount} {member.openCount === 1 ? 'tarea asignada' : 'tareas asignadas'}
                  </span>
                </div>
                <RoleBadge role={member.role} />
                {canManage ? (
                  <button
                    onClick={() => handleRemove(member.userId)}
                    title="Quitar del proyecto"
                    style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink-4)', fontSize: 16, padding: '2px 6px' }}
                  >
                    ×
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
          {removeError && <span style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>{removeError}</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '22px 24px' }}>
          {canManage && (
            <>
              <Label track="0.13em">Invitar al proyecto</Label>
              <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    border: '1px solid var(--line-strong)',
                    background: 'var(--field)',
                    borderRadius: 'var(--radius-card)',
                    overflow: 'hidden',
                  }}
                >
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    type="email"
                    style={{ flex: 1, minWidth: 0, fontFamily: 'var(--sans)', fontSize: 14, border: 0, background: 'transparent', padding: '10px 12px' }}
                  />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as ProjectMemberRole)}
                    style={{
                      fontFamily: 'var(--sans)',
                      fontSize: 13,
                      border: 0,
                      borderLeft: '1px solid var(--line-inset)',
                      background: 'transparent',
                      padding: '10px 12px',
                    }}
                  >
                    <option value="EDITOR">Editor</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={addMember.isPending || !email.trim()}
                  style={{
                    fontFamily: 'var(--sans)',
                    fontSize: 14,
                    fontWeight: 600,
                    padding: '11px 18px',
                    borderRadius: 'var(--radius)',
                    cursor: addMember.isPending || !email.trim() ? 'default' : 'pointer',
                    color: addMember.isPending || !email.trim() ? 'var(--ink-3)' : 'var(--cream)',
                    background: addMember.isPending || !email.trim() ? 'var(--line-x-soft)' : 'var(--ink)',
                    border: `1px solid ${addMember.isPending || !email.trim() ? 'var(--line-x-soft)' : 'var(--ink)'}`,
                  }}
                >
                  {addMember.isPending ? 'Invitando…' : 'Invitar al proyecto'}
                </button>
                {addMember.isError && (
                  <span style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>
                    {addMember.error instanceof ApiError ? addMember.error.message : 'No se pudo invitar.'}
                  </span>
                )}
              </form>
            </>
          )}

          <Label track="0.13em">Permisos</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ROLE_HINTS.map((hint) => (
              <div key={hint.role} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <RoleBadge role={hint.role} />
                <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{hint.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
