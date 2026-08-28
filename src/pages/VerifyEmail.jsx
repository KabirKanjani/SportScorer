import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';

export default function VerifyEmail() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const email = useMemo(
    () => params.get('email') || user?.email || '',
    [params, user]
  );
  const initialDev = params.get('dev') || '';

  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(initialDev);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(!!initialDev);

  async function submit(e) {
    e.preventDefault();
    if (!email) {
      setError('We need the email you signed up with.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/otp/verify', {
        method: 'POST',
        body: { email, purpose: 'verify', code },
      });
      await refresh();
      nav('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const d = await api('/api/otp/send', {
        method: 'POST',
        body: { email, purpose: 'verify' },
      });
      setDevCode(d.devCode || '');
      setMsg(d.devCode ? 'New code sent (dev preview below).' : 'A new code was sent to your email.');
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (user?.emailVerified) {
    return (
      <div className="auth-page">
        <div className="auth-card center">
          <h1>You're verified ✓</h1>
          <p className="muted">Your email is confirmed.</p>
          <button className="btn primary big" onClick={() => nav('/')}>
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Verify your email</h1>
        <p className="muted">
          We sent a 6-digit code to <b>{email || 'your email'}</b>. Enter it below
          to prove it's really you.
        </p>

        <label>
          Verification code
          <input
            className="otp-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            required
            autoFocus
          />
        </label>

        {devCode && (
          <div className="dev-banner">
            <b>Dev code: {devCode}</b>
            <span>No email sender configured yet — use this code to verify.</span>
          </div>
        )}
        {msg && <div className="form-ok">{msg}</div>}
        {error && <div className="form-error">{error}</div>}

        <button className="btn primary big" disabled={busy || !sent}>
          {busy ? 'Checking…' : !sent ? 'Get a code first' : 'Verify email'}
        </button>

        {!sent ? (
          <p className="muted small">
            <button type="button" className="link-btn" onClick={resend} disabled={busy}>
              Send me a code
            </button>
          </p>
        ) : (
          <p className="muted small">
            Didn't get it?{' '}
            <button type="button" className="link-btn" onClick={resend} disabled={busy}>
              Resend code
            </button>
          </p>
        )}
        <p className="muted small">
          Not your email? <Link to="/login">Switch account</Link>
        </p>
      </form>
    </div>
  );
}