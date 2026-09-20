import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button, Label, StatusPill, TableHead, TableRow } from '../../components/ui';
import { AvatarStatusDot } from '../../components/ui';
import { Avatar } from '../../components/Avatar';
import { formatRelativeTime, formatShortDate } from '../../lib/formatRelativeTime';
import { useAuth } from '../auth/AuthProvider';
import { UserListItem, UserRole, UserStatus, useUsers } from './useUsers';
import { CAPACITY } from '../../lib/capacity';

const TABLE_TEMPLATE = '34px minmax(170px,2.2fr) 120px minmax(100px,1.1fr) 110px 130px 120px 34px';

// HANDOFF.md: "la capacidad (16) hoy es una constante del front".

const STATUS_CHIPS: { key: UserStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Todos' },
  { key: 'ACTIVE', label: 'Activos' },
  { key: 'PENDING', label: 'Pendientes' },
  { key: 'INACTIVE', label: 'Inactivos' },
];

const ROLE_LABEL: Record<UserRole, string> = { ADMIN: 'Admin', PM: 'PM', DEVELOPER: 'Developer' };

// README §5: "Admin en tinta/crema, PM en --accent-soft/--accent-ink, Developer
// en --card/--ink-2". Es un badge, no una pill de estado — README regla 1 lo
// agrupa igual bajo --radius-pill ("Badge, pill de estado y de prioridad").
const ROLE_BADGE_STYLE: Record<UserRole, CSSProperties> = {
  ADMIN: { background: 'var(--ink)', color: 'var(--cream)', borderColor: 'var(--ink)' },
  PM: { background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderColor: 'var(--accent-line)' },
  DEVELOPER: { background: 'var(--card)', color: 'var(--ink-2)', borderColor: 'var(--line-strong)' },
};

export function AdminUsersPage() {
  const { session } = useAuth();
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'ALL'>('ALL');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // Debounce simple: no golpear /users en cada tecla.
  useEffect(() => {
    const id = setTimeout(() => setQuery(queryInput), 300);
    return () => clearTimeout(id);
  }, [queryInput]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, roleFilter]);

  const { data, isLoading, isError } = useUsers({ page, q: query, role: roleFilter, status: statusFilter });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const allChecked = items.length > 0 && items.every((u) => selected[u.id]);

  function toggleAll() {
    if (allChecked) {
      setSelected({});
    } else {
      setSelected(Object.fromEntries(items.map((u) => [u.id, true])));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          padding: '28px 40px 22px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxWidth: 560 }}>
          <Label track="0.15em">Administración</Label>
          <h1 style={{ margin: 0, fontSize: 33, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
            Usuarios
          </h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)', textWrap: 'pretty' }}>
            Equipo interno con acceso a la cuenta. Los clientes entran por invitación desde cada proyecto y no
            ocupan licencia.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button variant="ghost">Exportar CSV</Button>
          <Button variant="primary">Invitar usuario</Button>
        </div>
      </header>

      <div style={{ padding: '24px 40px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {STATUS_CHIPS.map((chip) => {
              const active = statusFilter === chip.key;
              return (
                <button
                  key={chip.key}
                  onClick={() => setStatusFilter(chip.key)}
                  style={{
                    fontFamily: 'var(--sans)',
                    fontSize: 13,
                    fontWeight: 500,
                    padding: '8px 14px',
                    cursor: 'pointer',
                    border: `1px solid ${active ? 'var(--ink)' : 'var(--line-strong)'}`,
                    background: active ? 'var(--ink)' : 'var(--card)',
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
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as UserRole | 'ALL')}
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 14,
                color: 'var(--ink)',
                background: 'var(--card)',
                border: '1px solid var(--line-strong)',
                padding: '10px 12px',
                borderRadius: 'var(--radius)',
              }}
            >
              <option value="ALL">Todos los roles</option>
              <option value="ADMIN">Admin</option>
              <option value="PM">PM</option>
              <option value="DEVELOPER">Developer</option>
            </select>
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
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Buscar por nombre o correo"
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 14,
                  color: 'var(--ink)',
                  background: 'transparent',
                  border: 0,
                  padding: '10px 0',
                  width: 240,
                }}
              />
            </span>
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              padding: '13px 20px',
              background: 'var(--ink)',
              color: 'var(--cream)',
              borderRadius: 'var(--radius)',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 500 }}>
              {selectedIds.length} usuario{selectedIds.length === 1 ? '' : 's'} seleccionado
              {selectedIds.length === 1 ? '' : 's'}
            </span>
            <span style={{ display: 'flex', gap: 10 }}>
              <BulkButton disabled>Cambiar rol</BulkButton>
              <BulkButton disabled>Desactivar</BulkButton>
              <button
                onClick={() => setSelected({})}
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--ink)',
                  background: 'var(--cream)',
                  border: 0,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius)',
                }}
              >
                Quitar selección
              </button>
            </span>
          </div>
        )}

        <div
          style={{
            border: '1px solid var(--line)',
            background: 'var(--card)',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 'var(--radius-card)',
          }}
        >
          {/* Con el sidebar abierto la tabla no entra por debajo de ~1250px: scrollea ella, no la página. */}
          <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 970 }}>
          <TableHead
            template={TABLE_TEMPLATE}
            cols={[
              <input
                key="all"
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                style={{ width: 15, height: 15, accentColor: 'var(--accent)', margin: 0, cursor: 'pointer' }}
              />,
              'Usuario',
              'Rol',
              'Proyectos',
              'Tareas',
              'Última actividad',
              'Estado',
              '',
            ]}
          />

          {isLoading && <EmptyState>Cargando…</EmptyState>}
          {isError && <EmptyState>No se pudo cargar la lista de usuarios.</EmptyState>}
          {!isLoading && !isError && items.length === 0 && <EmptyState>Sin resultados.</EmptyState>}

          {items.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isYou={user.id === session?.user.id}
              checked={!!selected[user.id]}
              onToggle={() => toggleOne(user.id)}
            />
          ))}

          </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              padding: '14px 20px',
              fontSize: 13,
              color: 'var(--ink-3)',
            }}
          >
            <span>
              {total === 0 ? '0 de 0' : `${rangeStart}–${rangeEnd} de ${total}`}
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button variant="ghost" disabled={rangeEnd >= total} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </Button>
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          <RoleInfoCard role="Admin" text="Gestiona usuarios, licencias y facturación. Ve todos los proyectos." />
          <RoleInfoCard role="PM" text="Crea proyectos, asigna tareas e invita clientes a los suyos." />
          <RoleInfoCard role="Developer" text="Trabaja las tareas de los proyectos donde está asignado." />
        </div>
      </div>
    </div>
  );
}

function UserRow({
  user,
  isYou,
  checked,
  onToggle,
}: {
  user: UserListItem;
  isYou: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const inactive = user.status === 'INACTIVE';
  const overCapacity = user.openCount > CAPACITY;
  const loadPct = Math.min(100, (user.openCount / CAPACITY) * 100);

  return (
    <TableRow template={TABLE_TEMPLATE} selected={checked}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        style={{ width: 15, height: 15, accentColor: 'var(--accent)', margin: 0, cursor: 'pointer' }}
      />

      <span style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
        <span style={{ position: 'relative', width: 36, height: 36, flex: 'none' }}>
          <Avatar
            seed={user.id}
            name={user.name}
            size={36}
            background={inactive ? 'var(--line-x-soft)' : undefined}
          />
          <AvatarStatusDot color={statusDotColor(user.status)} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                color: inactive ? 'var(--ink-3)' : 'var(--ink)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {user.name}
            </span>
            {isYou && <VosTag />}
          </span>
          <span
            style={{
              fontSize: 13,
              color: 'var(--ink-3)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {user.email}
          </span>
        </span>
      </span>

      <RoleBadge role={user.role} />

      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ display: 'flex' }}>
          {user.projects.map((project) => (
            <span
              key={project.id}
              title={project.name}
              style={{ width: 9, height: 22, marginRight: 3, background: project.color, borderRadius: 'var(--radius-tick)' }}
            />
          ))}
        </span>
        <span
          style={{
            fontSize: 13,
            color: 'var(--ink-2)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {user.projectCount === 0
            ? 'Sin proyectos'
            : user.projectCount === 1
              ? user.projects[0]!.name
              : `${user.projectCount} proyectos`}
        </span>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{user.openCount}</span>
          {user.overdueCount > 0 && (
            <span style={{ fontSize: 11.5, color: 'var(--accent-ink)' }}>{user.overdueCount} vencidas</span>
          )}
        </span>
        <span style={{ height: 3, width: '100%', background: 'var(--line-soft)', display: 'block' }}>
          <span
            style={{
              display: 'block',
              height: 3,
              background: overCapacity ? 'var(--accent)' : 'var(--ink)',
              width: `${loadPct}%`,
            }}
          />
        </span>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{formatShortDate(user.lastActiveAt)}</span>
        {user.lastActiveAt && (
          <span style={{ fontWeight: 600, fontSize: 10.5, color: 'var(--ink-4)' }}>
            {formatRelativeTime(user.lastActiveAt)}
          </span>
        )}
      </span>

      <UserStatusPill status={user.status} />

      <Button variant="ghost" disabled style={{ fontSize: 17, lineHeight: 1, padding: '4px 6px', justifySelf: 'end' }}>
        ···
      </Button>
    </TableRow>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignSelf: 'center',
        justifySelf: 'start',
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

function VosTag() {
  return (
    <span
      style={{
        fontWeight: 600,
        fontSize: 9.5,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
        border: '1px solid var(--line-x-soft)',
        padding: '2px 6px',
        borderRadius: 'var(--radius-pill)',
        flex: 'none',
      }}
    >
      Vos
    </span>
  );
}

// README §5: Activo con dot --ok — el único de los tres que StatusPill no
// cubre (sus 4 tonos no incluyen un dot verde). Pendiente/Inactivo sí
// coinciden exactamente con los tonos "accent"/"muted" de la primitiva.
function UserStatusPill({ status }: { status: UserStatus }) {
  if (status === 'PENDING') return <StatusPill tone="accent">Pendiente</StatusPill>;
  if (status === 'INACTIVE') return <StatusPill tone="muted">Inactivo</StatusPill>;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 12.5,
        fontWeight: 500,
        padding: '5px 11px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--card)',
        color: 'var(--ink)',
        border: '1px solid var(--line-strong)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)' }} />
      Activo
    </span>
  );
}

function statusDotColor(status: UserStatus): string {
  if (status === 'ACTIVE') return 'var(--ok)';
  if (status === 'PENDING') return 'var(--accent)';
  return 'var(--neutral)';
}

function RoleInfoCard({ role, text }: { role: string; text: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        background: 'var(--card)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        borderRadius: 'var(--radius-card)',
      }}
    >
      <Label track="0.12em">{role}</Label>
      <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>{text}</span>
    </div>
  );
}

function BulkButton({ children, disabled }: { children: string; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      title="Todavía no está conectado"
      style={{
        fontFamily: 'var(--sans)',
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--cream)',
        background: 'transparent',
        border: '1px solid var(--line-on-dark)',
        padding: '8px 14px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        borderRadius: 'var(--radius)',
      }}
    >
      {children}
    </button>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13.5, color: 'var(--ink-3)' }}>
      {children}
    </div>
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
