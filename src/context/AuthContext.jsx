import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const d = await api('/api/login', { method: 'POST', body: { email, password } });
    setUser(d.user);
    return d;
  }, []);

  const register = useCallback(async (payload) => {
    const d = await api('/api/register', { method: 'POST', body: payload });
    setUser(d.user);
    return d;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch {}
    setUser(null);
  }, []);

  // Refresh the current user from /api/me (used after verification).
  const refresh = useCallback(async () => {
    try {
      const d = await api('/api/me');
      setUser(d.user);
      return d.user;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  // Passwordless login with an emailed code.
  const otpLogin = useCallback(async (email, code) => {
    const d = await api('/api/otp/verify', {
      method: 'POST',
      body: { email, purpose: 'login', code },
    });
    setUser(d.user);
    return d.user;
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refresh, otpLogin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}