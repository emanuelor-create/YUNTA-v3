import { FormEvent, ReactNode, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button, Label } from '../../components/ui';
import { YuntaMark, YuntaWordmark } from '../../components/YuntaLogo';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from './AuthProvider';

const MIN_LENGTH = 8;

// Destino del link de "recuperar contraseña": Supabase ya inició la sesión con
// el token del mail; acá solo se elige la contraseña nueva.
export function ResetPasswordPage() {
  const { session, loading, recovering, finishRecovery } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading) {
    return null;
  }

  if (!session) {
    if (!recovering) {
      return <Navigate to="/login" replace />;
    }
    // El link del mail venció o ya se usó: Supabase no pudo iniciar la sesión.
    return (
      <Shell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <h2 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
            El link ya no sirve
          </h2>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--ink-2)' }}>
            Venció o ya se usó. Pedí uno nuevo desde "Olvidé mi contraseña" en la pantalla de ingreso.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            finishRecovery();
            navigate('/login', { replace: true });
          }}
          style={{ width: '100%', padding: 16, fontSize: 16 }}
        >
          Ir a ingresar
        </Button>
      </Shell>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) {
      setError(`La contraseña tiene que tener al menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    finishRecovery();
    navigate('/', { replace: true });
  }

  const inputStyle = {
    fontFamily: 'var(--sans)',
    fontSize: 16,
    color: 'var(--ink)',
    background: 'var(--card)',
    border: '1px solid var(--line-x-soft)',
    padding: '14px 16px',
    width: '100%',
    boxSizing: 'border-box' as const,
    borderRadius: 'var(--radius)',
  };

  return (
    <Shell onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <h2 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
          Elegí una contraseña nueva
        </h2>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--ink-2)' }}>
          Para {session.user.email}. Después vas a entrar con esta.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Label>Contraseña nueva</Label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Label>Repetila</Label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={inputStyle}
          />
        </label>
      </div>

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--accent-ink)' }}>
          {error}
        </p>
      )}

      <Button
        variant="primary"
        type="submit"
        disabled={saving}
        style={{ width: '100%', padding: 16, fontSize: 16, letterSpacing: '0.01em' }}
      >
        {saving ? 'Guardando…' : 'Guardar y entrar'}
      </Button>
    </Shell>
  );
}

function Shell({ children, onSubmit }: { children: ReactNode; onSubmit?: (event: FormEvent) => void }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--page)',
        fontFamily: 'var(--sans)',
        color: 'var(--ink)',
        padding: 24,
      }}
    >
      <form
        onSubmit={onSubmit ?? ((event) => event.preventDefault())}
        style={{ width: '100%', maxWidth: 404, display: 'flex', flexDirection: 'column', gap: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <YuntaMark size={36} />
          <YuntaWordmark />
        </div>
        {children}
      </form>
    </div>
  );
}
