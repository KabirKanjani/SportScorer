import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const STEP_EMAIL = 0;
const STEP_CODE = 1;
const STEP_PASSWORD = 2;

export default function ResetPassword() {
  const nav = useNavigate();
  const [step, setStep] = useState(STEP_EMAIL);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendCode(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('/api/otp/send', {
        method: 'POST',
        body: { email: email.trim(), purpose: 'reset' },
      });
      setDevCode(d.devCode || '');
      setStep(STEP_CODE);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('/api/otp/verify', {
        method: 'POST',
        body: { email: email.trim(), purpose: 'reset', code: code.trim() },
      });
      sessionStorage.setItem('ss_reset_token', d.resetToken);
      setStep(STEP_PASSWORD);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setNewPassword(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    if (pw.length < 6) {
      setError('Password must be at least 6 characters');
      setBusy(false);
      return;
    }
    if (pw !== confirm) {
      setError('Passwords do not match');
      setBusy(false);
      return;
    }
    try {
      const token = sessionStorage.getItem('ss_reset_token');
      if (!token) {
        setError('Your reset session has expired — please restart.');
        setBusy(false);
        return;
      }
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: { resetToken: token, newPassword: pw },
      });
      sessionStorage.removeItem('ss_reset_token');
      nav('/login?reset=done');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={step === STEP_EMAIL ? sendCode : step === STEP_CODE ? verifyCode : setNewPassword}>
        <h1>{step === STEP_PASSWORD ? 'Set a new password' : 'Reset your password'}</h1>

        {step === STEP_EMAIL && (
          <>
            <p className="muted">Enter your account email and we’ll send you a code.</p>
            {error && <div className="form-error">{error}</div>}
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
            <button className="btn primary big" disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </>
        )}

        {step === STEP_CODE && (
          <>
            <p className="muted">We emailed a 6-digit code to <strong>{email}</strong>.</p>
            {devCode && (
              <div className="form-hint">
                E-mail delivery is offline in this build.{' '}
                <strong>Your code: {devCode}</strong>
              </div>
            )}
            {error && <div className="form-error">{error}</div>}
            <label>
              Code
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
            </label>
            <button className="btn primary big" disabled={busy}>
              {busy ? 'Checking…' : 'Continue'}
            </button>
            <button
              type="button"
              className="btn ghost big"
              onClick={() => setStep(STEP_EMAIL)}
              disabled={busy}
            >
              Wrong email? Go back
            </button>
          </>
        )}

        {step === STEP_PASSWORD && (
          <>
            <p className="muted">Choose a password for your account.</p>
            {error && <div className="form-error">{error}</div>}
            <label>
              New password
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                autoFocus
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <button className="btn primary big" disabled={busy}>
              {busy ? 'Saving…' : 'Save new password'}
            </button>
          </>
        )}

        <div className="auth-links">
          <Link to="/login">Back to login</Link>
        </div>
      </form>
    </div>
  );
}