import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Card, CardHeader, Label, ProgressBar } from '../../components/ui';
import { CAPACITY } from '../../lib/capacity';
import { useCurrentUser } from '../auth/useCurrentUser';
import { CheckIcon } from '../board/icons';
import { CardPriorityBadge } from '../board/priority';
import { deriveStatus, dueNote } from '../projects/projectStatus';
import { useProjects } from '../projects/useProjects';
import { Dashboard, DashboardCard, useDashboard, useToggleCardDone } from './useDashboard';

const MAX_PROJECTS_SHOWN = 6;

// Tope de 2 líneas con puntos suspensivos: una fila de Próximas nunca pasa de
// tres renglones (título ≤ 2, proyecto ≤ 2 + cliente 1 en su columna) y los
// nombres cortos no pagan por los largos.
const CLAMP_2: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
};

// "2026-09-19" → fecha local al mediodía, para que ningún huso la corra de día.
const parseLocalDate = (ymd: string) => new Date(`${ymd}T12:00:00`);

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (date.getHours() === 0 && date.getMinutes() === 0) return 'Todo el día';
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Abrir una tarjeta: el detalle vive en el tablero de su proyecto (?card=).
const cardHref = (card: { projectId: string; id: string }) => `/projects/${card.projectId}/tablero?card=${card.id}`;

export function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();
  const { data: me } = useCurrentUser();
  const { data: projects } = useProjects();

  if (isLoading) return <PageMessage>Cargando…</PageMessage>;
  if (isError || !data) return <PageMessage>No se pudo cargar el dashboard.</PageMessage>;

  const firstName = me?.profile?.name?.split(' ')[0];
  const todayLabel = capitalize(new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '30px 40px 24px', display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid var(--line)' }}>
        <Label track="0.15em">{todayLabel}</Label>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
          {firstName ? `Hola, ${firstName}` : 'Dashboard'}
        </h1>
        <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>Qué toca hoy y cómo viene la semana.</span>
      </header>

      <div style={{ padding: '28px 40px 56px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <StatCards data={data} />

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 24, alignItems: 'stretch' }}>
          <TuDiaCard cards={data.today} />
          <EstadoCard status={data.status} />
        </div>

        <ProximasCard upcoming={data.upcoming} />

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 24, alignItems: 'stretch' }}>
          <RitmoCard rhythm={data.rhythm} open={data.status.todo + data.status.inProgress} />
          <MisProyectosCard projects={projects ?? []} />
        </div>

        <CargaCard workload={data.workload} />
      </div>
    </div>
  );
}

function PageMessage({ children }: { children: string }) {
  return <div style={{ padding: 56, textAlign: 'center', fontSize: 14, color: 'var(--ink-3)' }}>{children}</div>;
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <div style={{ padding: '24px', fontSize: 13.5, color: 'var(--ink-3)' }}>{children}</div>;
}

// ── 1. StatCards ─────────────────────────────────────────────────────────

function StatCards({ data }: { data: Dashboard }) {
  const { me } = data;
  const closedDelta = me.closed.total - me.closed.previous;
  const h = me.history;
  // Delta de las cifras con foto diaria: hoy contra el último día cerrado.
  const vsYesterday = (live: number, series?: number[]) => {
    if (!series) return undefined;
    const diff = live - series[series.length - 1];
    return `${diff > 0 ? '+' : ''}${diff} vs. ayer`;
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 'var(--radius-card)' }}>
      <StatCell label="Asignadas a vos" value={me.assigned} delta={vsYesterday(me.assigned, h?.assigned)} series={h?.assigned} />
      <StatCell label="Vencidas" value={me.overdue} accent delta={vsYesterday(me.overdue, h?.overdue)} series={h?.overdue} />
      <StatCell label="Vencen esta semana" value={me.dueSoon} delta={vsYesterday(me.dueSoon, h?.dueSoon)} series={h?.dueSoon} />
      <StatCell
        label="Cerradas en 7 días"
        value={me.closed.total}
        delta={`${closedDelta > 0 ? '+' : ''}${closedDelta} vs. semana anterior`}
        series={me.closed.byDay}
        last
      />
    </div>
  );
}

// "Cerradas" tiene serie desde el primer día: sale de completedAt, que es
// historia real. Las otras tres salen de las fotos diarias (UserDailySnapshot,
// el job de medianoche) y sin 7 días acumulados muestran solo el número: una
// serie reconstruida con datos editables sería inventada.
function StatCell({
  label,
  value,
  accent,
  delta,
  series,
  last,
}: {
  label: string;
  value: number;
  accent?: boolean;
  delta?: string;
  series?: number[];
  last?: boolean;
}) {
  const max = Math.max(1, ...(series ?? []));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 24px', borderRight: last ? undefined : '1px solid var(--line)' }}>
      <Label track="0.12em">{label}</Label>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: accent && value > 0 ? 'var(--accent)' : 'var(--ink)' }}>
            {value}
          </span>
          {delta && <span style={{ fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{delta}</span>}
        </div>
        {series && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 34 }} aria-hidden>
            {series.map((n, i) => (
              <span
                key={i}
                style={{
                  width: 5,
                  height: n === 0 ? 2 : Math.max(4, (n / max) * 34),
                  background: i === series.length - 1 ? 'var(--accent)' : 'var(--neutral)',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 2a. Tu día ───────────────────────────────────────────────────────────

function TuDiaCard({ cards }: { cards: Dashboard['today'] }) {
  const toggle = useToggleCardDone();
  const navigate = useNavigate();
  const now = Date.now();
  return (
    <Card>
      <CardHeader title="Tu día" subtitle={cards.length ? `${cards.filter((c) => !c.completed).length} pendientes de ${cards.length}` : undefined} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {cards.length === 0 && <EmptyNote>Nada vence hoy en tus tarjetas.</EmptyNote>}
        {cards.map((card, i) => {
          const urgent = !card.completed && new Date(card.dueDate).getTime() < now;
          return (
            <div
              key={card.id}
              onClick={() => navigate(cardHref(card))}
              style={{
                cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: '20px minmax(0,1fr) auto',
                alignItems: 'center',
                gap: 14,
                padding: '14px 24px',
                borderTop: i === 0 ? undefined : '1px solid var(--line-soft)',
              }}
            >
              <button
                onClick={(event) => {
                  event.stopPropagation(); // el checkbox alterna; el resto de la fila abre el detalle
                  toggle.mutate({ cardId: card.id, done: !card.completed });
                }}
                disabled={!card.canEdit || toggle.isPending}
                title={card.canEdit ? (card.completed ? 'Reabrir' : 'Marcar como hecha') : 'Solo lectura en este proyecto'}
                style={{
                  width: 18,
                  height: 18,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: card.canEdit ? 'pointer' : 'default',
                  borderRadius: 8,
                  border: `1px solid ${card.completed ? 'var(--ink)' : 'var(--line-strong)'}`,
                  background: card.completed ? 'var(--ink)' : 'var(--field)',
                  color: 'var(--cream)',
                  opacity: card.canEdit ? 1 : 0.5,
                }}
              >
                {card.completed && <CheckIcon size={11} />}
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: card.completed ? 'var(--ink-4)' : 'var(--ink)',
                      textDecoration: card.completed ? 'line-through' : undefined,
                    }}
                  >
                    {card.title}
                  </span>
                  <CardPriorityBadge priority={card.priority} />
                </span>
                <ProjectTag card={card} />
              </div>
              <span style={{ minWidth: 96, textAlign: 'right', fontSize: 13, color: urgent ? 'var(--accent-ink)' : 'var(--ink-3)' }}>
                {formatTime(card.dueDate)}
              </span>
            </div>
          );
        })}
        {toggle.isError && <EmptyNote>No se pudo actualizar la tarjeta.</EmptyNote>}
      </div>
    </Card>
  );
}

function ProjectTag({ card }: { card: DashboardCard }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink-3)' }}>
      <span style={{ width: 7, height: 7, background: card.projectColor, borderRadius: 2, flex: 'none' }} />
      {card.projectName}
      {card.client ? ` · ${card.client}` : ''}
    </span>
  );
}

// ── 2b. Estado del trabajo ───────────────────────────────────────────────

function EstadoCard({ status }: { status: Dashboard['status'] }) {
  const total = status.todo + status.inProgress + status.done;
  const pctDone = total > 0 ? Math.round((status.done / total) * 100) : 0;
  // Mismos colores que la barra segmentada del proyecto: primera columna en
  // neutro, del medio en acento, última (hecho) en tinta.
  const segments = [
    { label: 'Por hacer', n: status.todo, color: 'var(--neutral)' },
    { label: 'En curso', n: status.inProgress, color: 'var(--accent)' },
    { label: 'Hecho', n: status.done, color: 'var(--ink)' },
  ];
  let cumulative = 0;

  return (
    <Card>
      <CardHeader title="Estado del trabajo" subtitle="Todos tus proyectos" />
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 24, padding: '22px 24px', flex: 1 }}>
        <div style={{ position: 'relative', width: 132, height: 132, flex: 'none' }}>
          <svg viewBox="0 0 42 42" width="132" height="132" aria-hidden>
            <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--neutral-soft)" strokeWidth="6" />
            {total > 0 &&
              segments.map((segment) => {
                const share = (segment.n / total) * 100;
                const offset = -cumulative;
                cumulative += share;
                if (segment.n === 0) return null;
                return (
                  <circle
                    key={segment.label}
                    cx="21"
                    cy="21"
                    r="15.9"
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="6"
                    strokeDasharray={`${share} ${100 - share}`}
                    strokeDashoffset={offset}
                    transform="rotate(-90 21 21)"
                  />
                );
              })}
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>{pctDone}%</span>
            <Label>avance</Label>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 150px', minWidth: 150 }}>
          {segments.map((segment) => (
            <div key={segment.label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5 }}>
              <span style={{ width: 9, height: 9, background: segment.color, flex: 'none' }} />
              <span style={{ flex: 1, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{segment.label}</span>
              <span style={{ fontWeight: 600 }}>{segment.n}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── 3. Próximas a vencer ─────────────────────────────────────────────────

function ProximasCard({ upcoming }: { upcoming: Dashboard['upcoming'] }) {
  const navigate = useNavigate();
  const todayYmd = upcoming.days[0]?.date;
  const maxCount = Math.max(1, ...upcoming.days.map((d) => d.count));
  const withCards = upcoming.days.filter((d) => d.count > 0);

  return (
    <Card>
      <CardHeader
        title="Próximas a vencer"
        subtitle="Tarjetas abiertas del equipo, próximos 7 días"
        action={
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 34 }} aria-hidden>
              {upcoming.days.map((day, i) => (
                <span
                  key={day.date}
                  title={`${day.date}: ${day.count}`}
                  style={{
                    width: 22,
                    height: day.count === 0 ? 2 : Math.max(5, (day.count / maxCount) * 34),
                    background: i === 0 ? 'var(--accent)' : 'var(--neutral)',
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--accent)', lineHeight: 1 }}>{upcoming.total}</span>
          </div>
        }
      />
      {withCards.length === 0 && <EmptyNote>No vence nada en los próximos 7 días.</EmptyNote>}
      {withCards.map((day, i) => {
        const isToday = day.date === todayYmd;
        const date = parseLocalDate(day.date);
        const isTomorrow = day.date === upcoming.days[1]?.date;
        const title = isToday ? 'Hoy' : isTomorrow ? 'Mañana' : capitalize(date.toLocaleDateString('es-AR', { weekday: 'long' }));
        return (
          <div key={day.date} style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', borderTop: i === 0 ? undefined : '1px solid var(--line)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '16px 24px', background: isToday ? 'var(--accent-soft)' : 'var(--row-hover)' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: isToday ? 'var(--accent-ink)' : 'var(--ink)' }}>{title}</span>
              <span style={{ fontSize: 12, color: isToday ? 'var(--accent-ink)' : 'var(--ink-3)' }}>
                {date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} · {day.count} {day.count === 1 ? 'tarjeta' : 'tarjetas'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {day.cards.map((card, j) => (
                <div
                  key={card.id}
                  onClick={() => navigate(cardHref(card))}
                  style={{
                    cursor: 'pointer',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) minmax(120px,220px) auto 34px',
                    alignItems: 'center',
                    gap: 14,
                    padding: '12px 24px',
                    borderTop: j === 0 ? undefined : '1px solid var(--line-soft)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <span style={{ width: 3, alignSelf: 'stretch', minHeight: 26, background: card.projectColor, flex: 'none' }} />
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                      <span title={card.title} style={{ ...CLAMP_2, fontSize: 14, fontWeight: 500, minWidth: 0 }}>{card.title}</span>
                      <CardPriorityBadge priority={card.priority} />
                    </span>
                  </div>
                  {/* Proyecto en una línea y cliente debajo, sin truncar: si el nombre no entra, la columna crece (hasta 220px) o el texto baja de renglón. */}
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                    <span title={card.projectName} style={{ ...CLAMP_2, fontSize: 12.5, color: 'var(--ink-2)' }}>{card.projectName}</span>
                    {card.client && (
                      <span title={card.client} style={{ fontSize: 11.5, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {card.client}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{formatTime(card.dueDate)}</span>
                  {card.assignees[0] ? (
                    <span title={card.assignees.map((a) => a.name).join(', ')}>
                      <Avatar seed={card.assignees[0].id} name={card.assignees[0].name} size={26} />
                    </span>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// ── 4a. Ritmo de la semana ───────────────────────────────────────────────

// Solo cerradas por día: es un ritmo. Las abiertas son un stock — mezcladas en
// la misma barra aplastaban la escala (un 0-2 sobre un ~40) — así que van como
// número en el header, sin segundo eje. Las barras usan todo el alto para el
// rango que importa.
function RitmoCard({ rhythm, open }: { rhythm: Dashboard['rhythm']; open: number }) {
  const AREA = 184;
  const maxClosed = Math.max(1, ...rhythm.map((r) => r.closed));
  const closedTotal = rhythm.reduce((sum, r) => sum + r.closed, 0);
  return (
    <Card>
      <CardHeader
        title="Ritmo de la semana"
        subtitle={`${closedTotal} ${closedTotal === 1 ? 'cerrada' : 'cerradas'} del equipo en 7 días`}
        action={
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>{open}</span>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{open === 1 ? 'abierta' : 'abiertas'}</span>
          </div>
        }
      />
      <div style={{ padding: '22px 24px 18px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rhythm.length}, 1fr)`, gap: 14, alignItems: 'end', height: AREA + 22, borderBottom: '1px solid var(--line)' }}>
          {rhythm.map((point, i) => {
            const isToday = i === rhythm.length - 1;
            return (
              <div key={point.endsAt} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 5, height: '100%' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: isToday ? 'var(--accent)' : 'var(--ink-2)' }}>{point.closed}</span>
                <span
                  title={`${point.closed} ${point.closed === 1 ? 'cerrada' : 'cerradas'}`}
                  style={{
                    display: 'block',
                    width: '100%',
                    maxWidth: 40,
                    // Un día sin cierres deja una marca mínima: se ve el día, no un hueco.
                    height: point.closed === 0 ? 2 : (point.closed / maxClosed) * AREA,
                    background: point.closed === 0 ? 'var(--neutral)' : isToday ? 'var(--accent)' : 'var(--ink)',
                  }}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rhythm.length}, 1fr)`, gap: 14, paddingTop: 8 }}>
          {rhythm.map((point, i) => (
            <span
              key={point.endsAt}
              style={{ textAlign: 'center', fontSize: 12, fontWeight: i === rhythm.length - 1 ? 600 : 400, color: i === rhythm.length - 1 ? 'var(--accent)' : 'var(--ink-3)' }}
            >
              {capitalize(new Date(point.endsAt).toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''))}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── 4b. Mis proyectos ────────────────────────────────────────────────────

// Sale de GET /projects — el mismo hook y las mismas cuentas (taskCount,
// doneCount, deriveStatus, dueNote) que la grilla de Proyectos.
function MisProyectosCard({ projects }: { projects: NonNullable<ReturnType<typeof useProjects>['data']> }) {
  const now = useMemo(() => new Date(), []);
  const shown = projects.slice(0, MAX_PROJECTS_SHOWN);
  return (
    <Card>
      <CardHeader
        title="Mis proyectos"
        action={
          <Link to="/projects" style={{ fontSize: 13, color: 'var(--ink-3)', textDecoration: 'none' }}>
            Ver todos
          </Link>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {shown.length === 0 && <EmptyNote>No sos miembro de ningún proyecto todavía.</EmptyNote>}
        {shown.map((project, i) => {
          const status = deriveStatus(project, now);
          const note = dueNote(project, status, now);
          const pct = project.taskCount > 0 ? Math.round((project.doneCount / project.taskCount) * 100) : 0;
          return (
            <Link
              key={project.id}
              to={`/projects/${project.id}/resumen`}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 24px', textDecoration: 'none', color: 'inherit', borderTop: i === 0 ? undefined : '1px solid var(--line-soft)' }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{pct}%</span>
              </div>
              <ProgressBar pct={pct} color="var(--ink)" />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}>
                <span style={{ color: 'var(--ink-3)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.client ?? 'Sin cliente'}</span>
                <span style={{ color: note.late ? 'var(--accent-ink)' : 'var(--ink-3)', flex: 'none', whiteSpace: 'nowrap' }}>{note.text}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

// ── 5. Carga del equipo ──────────────────────────────────────────────────

function CargaCard({ workload }: { workload: Dashboard['workload'] }) {
  return (
    <Card>
      <CardHeader title="Carga del equipo" subtitle={`Tareas abiertas contra una capacidad de ${CAPACITY}`} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 24px 18px' }}>
        {workload.length === 0 && <EmptyNote>Todavía no hay personas en tus proyectos.</EmptyNote>}
        {workload.map((person) => {
          const over = person.openCount > CAPACITY;
          return (
            <div key={person.userId} style={{ display: 'grid', gridTemplateColumns: '26px minmax(0,1fr) 30px', alignItems: 'center', gap: 14, padding: '8px 0' }}>
              <Avatar seed={person.userId} name={person.name} size={26} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{person.name}</span>
                <ProgressBar pct={(person.openCount / CAPACITY) * 100} color={over ? 'var(--accent)' : 'var(--ink)'} height={8} track="var(--neutral-soft)" />
              </div>
              <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: over ? 'var(--accent)' : 'var(--ink)' }}>{person.openCount}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
