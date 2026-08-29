import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api, API_BASE } from '../api.js';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(params.get('error') || '');
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const noPassword = error.includes('No password');

  useEffect(() => {
    api('/api/auth/google/config')
      .then((d) => setGoogle(!!d.available))
      .catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      nav('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Welcome back</h1>
        <p className="muted">Log in to score matches and follow your friends.</p>

        {google ? (
          <>
            <button
              type="button"
              className="btn google-btn big"
              onClick={() => {
                // Bundled app: the sign-in happens against the hosted backend and
                // Safari returns to the app's own origin, where the session cookie
                // (already stored) makes /api/me resolve the user.
                const redirect = window.location.origin + window.location.pathname;
                window.location.href = `${API_BASE}/api/auth/google?redirect=${encodeURIComponent(redirect)}`;
              }}
            >
              <span className="google-icon">G</span> Continue with Google
            </button>
            <div className="divider">
              <span>or</span>
            </div>
          </>
        ) : (
          <p className="muted small">
            New here? <Link to="/register">Create an account</Link> — or sign in with a{' '}
            <Link to="/login-otp">login code</Link>.
          </p>
        )}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
          />
        </label>
        <label className="pw-field">
          Password
          <span className="pw-wrap">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button type="button" className="pw-eye" onClick={() => setShowPw((s) => !s)}>
              {showPw ? '🙈' : '👁'}
            </button>
          </span>
        </label>

        {noPassword && (
          <div className="form-hint">
            This account has no password. You can sign in with a login code instead:
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary big" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>

        <div className="auth-links">
          <Link to="/login-otp">Sign in with a code</Link>
          <Link to="/register">Create an account</Link>
        </div>
      </form>
    </div>
  );
}