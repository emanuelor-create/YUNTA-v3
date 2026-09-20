import { FormEvent, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button, Label } from '../../components/ui';
import { YuntaMark, YuntaWordmark } from '../../components/YuntaLogo';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from './AuthProvider';

const POINTS = [
  { n: '01', text: 'Tablero, lista y cronograma sobre los mismos datos' },
  { n: '02', text: 'Cargas de trabajo visibles antes de prometer una fecha' },
  { n: '03', text: 'Cada decisión queda anotada junto a la tarea' },
];

// Yunta-Login.html, pixel a pixel. Google/Microsoft/SSO, "Pedí acceso" y
// "Olvidé mi contraseña" quedan como placeholders (href="#" en el diseño):
// no hay proveedores OAuth ni flujo de recuperación conectados todavía.
export function LoginPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);

  if (loading) {
    return null;
  }

  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      setError(error.message);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '1.05fr 1fr',
        fontFamily: 'var(--sans)',
        color: 'var(--ink)',
      }}
    >
      {/* Columna izquierda — marca */}
      <div
        style={{
          background: 'var(--sidebar-bg)',
          padding: '56px 60px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 48,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, position: 'relative', zIndex: 1 }}>
          <YuntaMark size={44} />
          <YuntaWordmark />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 26, maxWidth: 520, position: 'relative', zIndex: 1 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
            }}
          >
            Tareas y proyectos
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 52,
              fontWeight: 800,
              letterSpacing: '-0.035em',
              lineHeight: 1.03,
              color: 'var(--cream)',
              textWrap: 'pretty',
            }}
          >
            El trabajo del equipo, tirando para el mismo lado.
          </h1>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: 'var(--ink-4)', textWrap: 'pretty' }}>
            Yunta reúne el trabajo del equipo en un lugar: quién hace qué, para cuándo, y qué depende de qué.
            Sin planillas sueltas ni hilos de mail.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
            {POINTS.map((point) => (
              <div key={point.n} style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--accent)', minWidth: 22 }}>
                  {point.n}
                </span>
                <span style={{ fontSize: 15, color: 'var(--ink-on-dark)' }}>{point.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontWeight: 600,
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--sidebar-section)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <span>© {new Date().getFullYear()} Yunta</span>
          <span style={{ display: 'flex', gap: 22 }}>
            <a href="#" style={{ color: 'var(--sidebar-section)' }}>
              Soporte
            </a>
            <a href="#" style={{ color: 'var(--sidebar-section)' }}>
              Estado
            </a>
          </span>
        </div>

        <YuntaMark
          size={720}
          style={{ position: 'absolute', right: -260, bottom: -190, opacity: 0.05 }}
        />
      </div>

      {/* Columna derecha — formulario */}
      <div
        style={{
          background: 'var(--page)',
          padding: '56px 60px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{ width: '100%', maxWidth: 404, display: 'flex', flexDirection: 'column', gap: 30 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <h2 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
              Entrar a tu espacio
            </h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--ink-2)' }}>
              ¿Todavía no tenés cuenta?{' '}
              <a href="#" style={{ fontWeight: 600, borderBottom: '1px solid var(--accent-line)' }}>
                Pedí acceso
              </a>
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Label>Correo de trabajo</Label>
              <input
                type="email"
                required
                autoComplete="username"
                placeholder="nombre@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 16,
                  color: 'var(--ink)',
                  background: emailFocused ? 'var(--field)' : 'var(--card)',
                  border: `1px solid ${emailFocused ? 'var(--ink)' : 'var(--line-x-soft)'}`,
                  padding: '14px 16px',
                  width: '100%',
                  boxSizing: 'border-box',
                  borderRadius: 'var(--radius)',
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Label>Contraseña</Label>
                <a href="#" style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                  Olvidé mi contraseña
                </a>
              </span>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  background: 'var(--card)',
                  border: `1px solid ${passwordFocused ? 'var(--ink)' : 'var(--line-x-soft)'}`,
                  borderRadius: 'var(--radius-card)',
                  overflow: 'hidden',
                }}
              >
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  style={{
                    fontFamily: 'var(--sans)',
                    fontSize: 16,
                    color: 'var(--ink)',
                    background: passwordFocused ? 'var(--field)' : 'transparent',
                    border: 0,
                    padding: '14px 16px',
                    flex: 1,
                    minWidth: 0,
                  }}
                />
                <TogglePasswordButton show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 2 }}>
              <input
                type="checkbox"
                style={{ width: 16, height: 16, accentColor: 'var(--accent)', margin: 0 }}
              />
              <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                Mantener la sesión abierta en este equipo
              </span>
            </label>
          </div>

          {error && (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--accent-ink)' }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Button
              variant="primary"
              type="submit"
              disabled={submitting}
              style={{ width: '100%', padding: 16, fontSize: 16, letterSpacing: '0.01em' }}
            >
              {submitting ? 'Entrando…' : 'Entrar'}
            </Button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ height: 1, background: 'var(--line-x-soft)', flex: 1 }} />
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                }}
              >
                o
              </span>
              <span style={{ height: 1, background: 'var(--line-x-soft)', flex: 1 }} />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <Button variant="ghost" style={{ flex: 1, padding: 13 }}>
                Google
              </Button>
              <Button variant="ghost" style={{ flex: 1, padding: 13 }}>
                Microsoft
              </Button>
              <Button variant="ghost" style={{ flex: 1, padding: 13 }}>
                SSO
              </Button>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-3)', textWrap: 'pretty' }}>
            Al entrar aceptás los{' '}
            <a href="#" style={{ color: 'var(--ink-3)', borderBottom: '1px solid var(--line-x-soft)' }}>
              términos de servicio
            </a>{' '}
            y la{' '}
            <a href="#" style={{ color: 'var(--ink-3)', borderBottom: '1px solid var(--line-x-soft)' }}>
              política de privacidad
            </a>{' '}
            de Yunta.
          </p>
        </form>
      </div>
    </div>
  );
}

function TogglePasswordButton({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: 'var(--sans)',
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: hover ? 'var(--ink)' : 'var(--ink-3)',
        background: 'transparent',
        border: 0,
        borderLeft: '1px solid var(--line-inset)',
        padding: '0 16px',
        cursor: 'pointer',
      }}
    >
      {show ? 'Ocultar' : 'Ver'}
    </button>
  );
}
