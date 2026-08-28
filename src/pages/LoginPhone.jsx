import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';

// Main login: enter your phone number, we text a code, sign in.
export default function LoginPhone() {
  const { phoneLogin } = useAuth();
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
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
      const d = await api('/api/phone/send', {
        method: 'POST',
        body: { phone, purpose: 'login' },
      });
      setDevCode(d.devCode || '');
      setMsg(
        d.devCode
          ? 'Code created (dev preview below).'
          : 'We texted you a login code. It expires in 10 minutes.'
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
      await phoneLogin(phone, code);
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
        <h1>Sign in with your phone</h1>
        <p className="muted">
          Your phone number is your account — no password needed.
        </p>

        <form onSubmit={sendCode}>
          <label>
            Phone number
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              autoComplete="tel"
              required
              disabled={sent}
            />
          </label>
          {devCode && (
            <div className="dev-banner">
              <b>Dev code: {devCode}</b>
              <span>No SMS sender configured yet — use this code to sign in.</span>
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
          No account yet? <Link to="/register">Sign up</Link> · Prefer email?{' '}
          <Link to="/login">Log in with email</Link>
        </p>
      </div>
    </div>
  );
}