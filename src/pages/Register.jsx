import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const phoneBased = phone.trim().length > 0;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await register({ name, phone, email, password });
      if (d.needsVerification) {
        if (phone.trim()) {
          const q = new URLSearchParams({ phone });
          if (d.devCode) q.set('dev', d.devCode);
          nav(`/verify-phone?${q.toString()}`);
        } else {
          const q = new URLSearchParams({ email });
          if (d.devCode) q.set('dev', d.devCode);
          nav(`/verify-email?${q.toString()}`);
        }
      } else {
        nav('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Create your account</h1>
        <p className="muted">
          Use your phone number and friends can find you by it — exactly like a
          unique handle.
        </p>
        <label>
          Display name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            placeholder="e.g. Alex"
          />
        </label>
        <label>
          Phone number <span className="opt">(recommended)</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            autoComplete="tel"
          />
        </label>
        <div className="divider">
          <span>optional extras</span>
        </div>
        <label>
          Email <span className="opt">(optional)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder={phoneBased ? 'you@example.com' : 'Required without a phone'}
          />
        </label>
        <label>
          Password <span className="opt">(optional)</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            autoComplete="new-password"
            placeholder={phoneBased ? 'Set one if you like' : 'Required without a phone'}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary big" disabled={busy}>
          {busy ? 'Creating…' : 'Sign up'}
        </button>
        <p className="muted small">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}