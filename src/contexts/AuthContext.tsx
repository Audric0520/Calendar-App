import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../services/supabase';
import { clearLocalUploadDismissals } from '../services/cloudSync';

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(() => Boolean(supabase));
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.warn('Failed to restore auth session:', error.message);
        }
        if (!data.session) {
          clearLocalUploadDismissals();
        }
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.warn('Failed to restore auth session:', err);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === 'SIGNED_OUT' || !nextSession) {
        clearLocalUploadDismissals();
      }
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    clearLocalUploadDismissals();
    if (!supabase) {
      setAuthError(
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to sign in.'
      );
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

    if (error) {
      setAuthError(error.message);
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    clearLocalUploadDismissals();
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError(error.message);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      isConfigured: isSupabaseConfigured,
      authError,
      clearAuthError,
      signInWithGoogle,
      signOut,
    }),
    [user, session, loading, authError, clearAuthError, signInWithGoogle, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
