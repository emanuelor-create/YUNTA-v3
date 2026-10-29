import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar } from '../../components/Avatar';
import { Button, Label } from '../../components/ui';
import { MoonIcon, SunIcon } from '../../components/Sidebar';
import { ROLE_LABEL } from '../../components/TopBar';
import { ApiError, apiFetch } from '../../lib/apiClient';
import { useAppearance } from '../../lib/appearance';
import type { Palette } from '../../lib/palette';
import { supabase } from '../../lib/supabaseClient';
import type { Theme } from '../../lib/theme';
import { useCurrentUser } from '../auth/useCurrentUser';

const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Activo', PENDING: 'Pendiente', INACTIVE: 'Inactivo' };

const FIELD = {
  fontFamily: 'var(--sans)',
  fontSize: 14.5,
  color: 'var(--ink)',
  background: 'var(--field)',
  border: '1px solid var(--line-strong)',
  borderRadius: 'var(--radius)',
  padding: '11px 13px',
  width: '100%',
  boxSizing: 'border-box' as const,
};

/// "Mi perfil": datos de la cuenta (el nombre se puede cambiar), apariencia
/// (paleta y modo claro/oscuro) y cambio de contraseña.
export function ProfilePage() {
  const { data: me, isLoading } = useCurrentUser();

  if (isLoading) return <p style={{ padding: 56, textAlign: 'center', color: 'var(--ink-3)' }}>Cargando…</p>;
  if (!me) return <p style={{ padding: 56, textAlign: 'center', color: 'var(--ink-3)' }}>No se pudo cargar tu perfil.</p>;

  return (
    <div style={{ padding: '30px 40px 56px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 920, width: '100%', boxSizing: 'border-box' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Label track="0.15em">Tu cuenta</Label>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>Mi perfil</h1>
      </header>

      <AccountCard
        userId={me.userId}
        email={me.email}
        name={me.profile?.name ?? ''}
        role={me.profile ? (ROLE_LABEL[me.profile.role] ?? me.profile.role) : '—'}
        status={me.profile ? (STATUS_LABEL[me.profile.status] ?? me.profile.status) : '—'}
        editable={!!me.profile}
      />
      <AppearanceCard />
      <PasswordCard />
    </div>
  );
}

function Card({ title, subtitle, children, 'data-card': dataCard }: { title: string; subtitle?: string; children: ReactNode; 'data-card'?: string }) {
  return (
    <section data-card={dataCard} style={{ border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 'var(--radius-card)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '18px 24px 16px', borderBottom: '1px solid var(--line)' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</h2>
        {subtitle && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{subtitle}</span>}
      </div>
      <div style={{ padding: '20px 24px 24px' }}>{children}</div>
    </section>
  );
}

// ── Datos ────────────────────────────────────────────────────────────────

function AccountCard({ userId, email, name, role, status, editable }: { userId: string; email: string; name: string; role: string; status: string; editable: boolean }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(name);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(name), [name]);

  const save = useMutation({
    mutationFn: (value: string) => apiFetch('/auth/me', { method: 'PATCH', body: JSON.stringify({ name: value }) }),
    onSuccess: () => {
      setSaved(true);
      // El nombre aparece en la barra superior, comentarios, asignados y Usuarios.
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const value = draft.trim().replace(/\s+/g, ' ');
  const changed = value !== name;
  const valid = value.length >= 2 && value.length <= 80;

  function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    if (changed && valid) save.mutate(value);
  }

  return (
    <Card title="Datos de la cuenta" data-card="datos">
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '72px minmax(0,1fr)', gap: 22, alignItems: 'start' }}>
        <Avatar seed={userId} name={value || name || '?'} size={72} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Label>Nombre</Label>
            <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                value={draft}
                disabled={!editable}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setSaved(false);
                }}
                maxLength={80}
                aria-label="Nombre"
                style={{ ...FIELD, flex: 1, minWidth: 220, width: 'auto' }}
              />
              <Button variant="primary" type="submit" disabled={!editable || !changed || !valid || save.isPending}>
                {save.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </span>
            {changed && !valid && <span style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>Entre 2 y 80 caracteres.</span>}
            {saved && !changed && <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Listo, tu nombre quedó actualizado.</span>}
            {save.isError && <span style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>{save.error instanceof ApiError ? save.error.message : 'No se pudo guardar.'}</span>}
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16 }}>
            <ReadOnly label="Correo" value={email} />
            <ReadOnly label="Rol" value={role} />
            <ReadOnly label="Estado" value={status} />
          </div>
          <span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-3)' }}>El correo y el rol los cambia un administrador desde Usuarios.</span>
        </div>
      </form>
    </Card>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <Label>{label}</Label>
      <span title={value} style={{ fontSize: 14.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </span>
  );
}

// ── Apariencia ───────────────────────────────────────────────────────────

/// Muestras de cada paleta (en claro), fijas: tienen que verse aunque la paleta
/// activa sea otra.
const PALETTE_PREVIEW: Record<Palette, { label: string; detail: string; page: string; card: string; ink: string; accent: string; side: string; line: string }> = {
  terracota: { label: 'Terracota', detail: 'Crema cálido y acento terracota. La de siempre.', page: '#f2efe9', card: '#fbfaf7', ink: '#1b1917', accent: '#b4552f', side: '#1b1917', line: '#e2dcd2' },
  azul: { label: 'Azul', detail: 'Blanco, tinta azul marino y acento azul eléctrico.', page: '#ffffff', card: '#ffffff', ink: '#0f1b2d', accent: '#0b5fff', side: '#0f1b2d', line: '#e3e9f2' },
};

function AppearanceCard() {
  const { theme, palette, setTheme, setPalette } = useAppearance();

  return (
    <Card title="Apariencia" subtitle="Se guarda en este navegador. El modo oscuro también se cambia desde la luna al pie del menú." data-card="apariencia">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Label>Tema</Label>
          <div role="radiogroup" aria-label="Tema" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {(Object.keys(PALETTE_PREVIEW) as Palette[]).map((id) => (
              <PaletteTile key={id} id={id} active={palette === id} onPick={() => setPalette(id)} />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Label>Modo</Label>
          <div role="radiogroup" aria-label="Modo" style={{ display: 'inline-flex', gap: 8 }}>
            {(['light', 'dark'] as Theme[]).map((mode) => {
              const on = theme === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setTheme(mode)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontFamily: 'var(--sans)',
                    fontSize: 14,
                    fontWeight: on ? 600 : 500,
                    padding: '10px 16px',
                    borderRadius: 'var(--radius)',
                    border: `1px solid ${on ? 'var(--ink)' : 'var(--line-strong)'}`,
                    background: on ? 'var(--ink)' : 'var(--field)',
                    color: on ? 'var(--cream)' : 'var(--ink-2)',
                    cursor: 'pointer',
                  }}
                >
                  {mode === 'dark' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
                  {mode === 'dark' ? 'Oscuro' : 'Claro'}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PaletteTile({ id, active, onPick }: { id: Palette; active: boolean; onPick: () => void }) {
  const p = PALETTE_PREVIEW[id];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      data-palette-option={id}
      onClick={onPick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 12,
        textAlign: 'left',
        fontFamily: 'var(--sans)',
        background: 'var(--field)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--line-strong)'}`,
        outline: active ? '2px solid var(--accent)' : 'none',
        outlineOffset: -1,
        borderRadius: 'var(--radius-card)',
        cursor: 'pointer',
      }}
    >
      {/* Mini pantalla: menú, tarjeta y botón con los colores de la paleta. */}
      <span aria-hidden style={{ display: 'flex', height: 92, borderRadius: 'var(--radius)', overflow: 'hidden', border: `1px solid ${p.line}` }}>
        <span style={{ width: 46, background: p.side, display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 8px' }}>
          <span style={{ height: 8, borderRadius: 2, background: p.accent }} />
          <span style={{ height: 5, borderRadius: 2, background: 'rgba(255,255,255,0.35)' }} />
          <span style={{ height: 5, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
          <span style={{ height: 5, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
        </span>
        <span style={{ flex: 1, background: p.page, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ height: 7, width: '55%', borderRadius: 2, background: p.ink }} />
          <span style={{ flex: 1, borderRadius: 4, background: p.card, border: `1px solid ${p.line}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 6 }}>
            <span style={{ height: 10, width: 34, borderRadius: 3, background: p.accent }} />
          </span>
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${active ? 'var(--accent)' : 'var(--line-strong)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          {active && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>{p.label}</span>
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{p.detail}</span>
        </span>
      </span>
    </button>
  );
}

// ── Contraseña ───────────────────────────────────────────────────────────

const MIN_PASSWORD = 8;

function PasswordCard() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);
    if (password.length < MIN_PASSWORD) return setError(`Tiene que tener al menos ${MIN_PASSWORD} caracteres.`);
    if (password !== confirm) return setError('Las dos contraseñas no coinciden.');
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return setError(error.message);
    setPassword('');
    setConfirm('');
    setDone(true);
  }

  return (
    <Card title="Contraseña" subtitle="Cambiala cuando quieras. La próxima vez entrás con la nueva." data-card="contrasena">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 520 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Label>Contraseña nueva</Label>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} style={FIELD} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Label>Repetila</Label>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={FIELD} />
          </label>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Button variant="primary" type="submit" disabled={saving || !password || !confirm}>
            {saving ? 'Guardando…' : 'Cambiar contraseña'}
          </Button>
          {error && <span role="alert" style={{ fontSize: 13, color: 'var(--accent-ink)' }}>{error}</span>}
          {done && <span role="status" style={{ fontSize: 13, color: 'var(--ink-2)' }}>Listo, tu contraseña quedó cambiada.</span>}
        </span>
      </form>
    </Card>
  );
}
