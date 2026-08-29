import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';

// Passwordless login: enter an email, we email a code, enter the code.
export default function LoginOtp() {
  const { otpLogin } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendCode(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const d = await api('/api/otp/send', {
        method: 'POST',
        body: { email, purpose: 'login' },
      });
      setDevCode(d.devCode || '');
      setBlocked(!!d.emailBlocked);
      setMsg(
        d.emailBlocked
          ? 'Email delivery is unavailable right now — use the code shown below.'
          : d.devCode
            ? 'Code created (dev preview below).'
            : 'We emailed you a login code. It expires in 10 minutes.'
      );
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await otpLogin(email, code);
      nav('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Sign in with a code</h1>
        <p className="muted">
          No password needed — we email you a one-time code. New emails get an
          account automatically.
        </p>

        <form onSubmit={sendCode}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={sent}
            />
          </label>
          {devCode && (
            <div className="dev-banner">
              <b>{blocked ? 'Your code: ' : 'Dev code: '}{devCode}</b>
              <span>
                {blocked
                  ? 'Email delivery is unavailable right now — this code signs you in.'
                  : 'No email sender configured yet — use this code to sign in.'}
              </span>
            </div>
          )}
          <button className="btn primary big" disabled={busy || sent}>
            {busy ? 'Sending…' : sent ? 'Code sent' : 'Send login code'}
          </button>
        </form>

        {sent && (
          <form className="otp-step" onSubmit={submit}>
            <label>
              Login code
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
            {msg && <div className="form-ok">{msg}</div>}
            {error && <div className="form-error">{error}</div>}
            <button className="btn primary big" disabled={busy}>
              {busy ? 'Logging in…' : 'Log in'}
            </button>
          </form>
        )}
        {error && sent && null}

        <p className="muted small">
          Prefer a password? <Link to="/login">Log in here</Link> ·{' '}
          <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}