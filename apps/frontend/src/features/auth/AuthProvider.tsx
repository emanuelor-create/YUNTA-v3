import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { openedFromRecoveryLink, supabase } from '../../lib/supabaseClient';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  /** true si se entró con el link de "recuperar contraseña" y falta elegir una nueva. */
  recovering: boolean;
  finishRecovery: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(openedFromRecoveryLink);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    setRecovering(false);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, loading, recovering, finishRecovery: () => setRecovering(false), signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return context;
}
