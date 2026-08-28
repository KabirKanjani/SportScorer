import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';

export default function VerifyPhone() {
  const { user, refresh, verifyPhone } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const phone = params.get('phone') || user?.phone || '';
  const initialDev = params.get('dev') || '';

  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(initialDev);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!phone) {
      setError('We need the number you signed up with.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await verifyPhone(phone, code, 'register');
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
      const d = await api('/api/phone/send', {
        method: 'POST',
        body: { phone, purpose: 'register' },
      });
      setDevCode(d.devCode || '');
      setMsg(d.devCode ? 'New code sent (dev preview below).' : 'A new code was sent to your phone.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (user?.phoneVerified) {
    return (
      <div className="auth-page">
        <div className="auth-card center">
          <h1>You're verified ✓</h1>
          <p className="muted">Your phone number is confirmed.</p>
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
        <h1>Verify your phone</h1>
        <p className="muted">
          We sent a 6-digit code to <b>{phone || 'your number'}</b>. Enter it below to
          prove it's really you.
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
            <span>No SMS sender configured yet — use this code to verify.</span>
          </div>
        )}
        {msg && <div className="form-ok">{msg}</div>}
        {error && <div className="form-error">{error}</div>}

        <button className="btn primary big" disabled={busy}>
          {busy ? 'Checking…' : 'Verify phone'}
        </button>

        <p className="muted small">
          Didn't get it?{' '}
          <button type="button" className="link-btn" onClick={resend} disabled={busy}>
            Resend code
          </button>
        </p>
        <p className="muted small">
          Not your number? <Link to="/login">Switch account</Link>
        </p>
      </form>
    </div>
  );
}