import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import MatchCard from '../components/MatchCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [mine, setMine] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Phone settings state
  const [phone, setPhone] = useState(user?.phone || '');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneDev, setPhoneDev] = useState('');
  const [phoneSent, setPhoneSent] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState('');
  const [phoneErr, setPhoneErr] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);

  useEffect(() => {
    Promise.all([api('/api/me/live'), api(`/api/users/${user.id}`)])
      .then(([live, prof]) => {
        setMine(live.matches);
        setProfile(prof);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user.id]);

  const live = mine.filter((m) => m.status === 'live');
  const finished = mine.filter((m) => m.status === 'finished');
  const stats = profile?.stats;
  const hasRealEmail = user.email && !user.email.endsWith('@phone');

  async function sendPhoneCode(e) {
    e.preventDefault();
    setPhoneBusy(true);
    setPhoneErr('');
    setPhoneMsg('');
    try {
      const d = await api('/api/phone/send', {
        method: 'POST',
        body: { phone, purpose: 'verify_own' },
      });
      setPhoneDev(d.devCode || '');
      setPhoneSent(true);
      setPhoneMsg(
        d.devCode ? 'Code created (dev preview below).' : 'We texted a code to that number.'
      );
    } catch (err) {
      setPhoneErr(err.message);
    } finally {
      setPhoneBusy(false);
    }
  }

  async function submitPhoneCode(e) {
    e.preventDefault();
    setPhoneBusy(true);
    setPhoneErr('');
    try {
      await api('/api/phone/verify', {
        method: 'POST',
        body: { phone, purpose: 'verify_own', code: phoneCode },
      });
      await refresh();
      setPhoneMsg('Phone verified ✓');
      setPhoneSent(false);
      setPhoneCode('');
    } catch (err) {
      setPhoneErr(err.message);
    } finally {
      setPhoneBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="dash-head">
        <div>
          <h1>Hey, {user.name} 👋</h1>
          <p className="muted">Here's what your friends are up to and your recent matches.</p>
        </div>
        <Link to="/new-match" className="btn primary big">
          + Score a new match
        </Link>
      </header>

      {hasRealEmail && !user.emailVerified && (
        <div className="verify-banner">
          <span>🔎 Your email isn't verified yet — matches you score won't count as confirmed results.</span>
          <Link to={`/verify-email?email=${encodeURIComponent(user.email)}`} className="btn small">
            Verify now
          </Link>
        </div>
      )}

      {!user.phoneVerified && (
        <div className="verify-banner">
          <span>📱 Your phone number isn't verified — verify it so friends can find you by number.</span>
          <Link to="/verify-phone" className="btn small">
            Verify now
          </Link>
        </div>
      )}

      <section className="panel">
        <div className="panel-title">
          <span>Account</span>
          {user.phoneVerified && <span className="cred-chip ok">✓ phone verified</span>}
          {hasRealEmail && user.emailVerified && <span className="cred-chip ok">✓ email verified</span>}
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Friends can add you to a match by your phone number. Yours:{' '}
          <b>{user.phone || 'not set yet'}</b>
        </p>
        <form onSubmit={phoneSent ? submitPhoneCode : sendPhoneCode} className="otp-step">
          <label>
            Phone number
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              autoComplete="tel"
              disabled={phoneSent}
            />
          </label>
          {phoneDev && (
            <div className="dev-banner">
              <b>Dev code: {phoneDev}</b>
              <span>No SMS sender configured yet — use this code to verify.</span>
            </div>
          )}
          {phoneSent ? (
            <label>
              Verification code
              <input
                className="otp-input"
                inputMode="numeric"
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                required
                autoFocus
              />
            </label>
          ) : null}
          {phoneMsg && <div className="form-ok">{phoneMsg}</div>}
          {phoneErr && <div className="form-error">{phoneErr}</div>}
          <button className="btn primary" disabled={phoneBusy}>
            {phoneBusy ? 'Working…' : phoneSent ? 'Verify phone' : 'Send code'}
          </button>
        </form>
      </section>

      {loading ? (
        <div className="status-row">Loading…</div>
      ) : (
        <>
          {live.length > 0 && (
            <section>
              <div className="section-head">
                <h2>Your live matches</h2>
              </div>
              <div className="match-grid">
                {live.map((m) => (
                  <MatchCard key={m.id} m={m} />
                ))}
              </div>
            </section>
          )}

          {stats && (
            <section className="stats-strip">
              <div className="stat-box">
                <b>{stats.total.played}</b>
                <span>Matches</span>
              </div>
              <div className="stat-box">
                <b className="win">{stats.total.wins}</b>
                <span>Wins</span>
              </div>
              <div className="stat-box">
                <b className="loss">{stats.total.losses}</b>
                <span>Losses</span>
              </div>
              <div className="stat-box">
                <b>{stats.total.winPct}%</b>
                <span>Win rate</span>
              </div>
            </section>
          )}

          <section>
            <div className="section-head">
              <h2>History</h2>
              <Link to={`/player/${user.id}`} className="see-all">
                Full profile →
              </Link>
            </div>
            {finished.length === 0 && live.length === 0 ? (
              <p className="muted">
                No matches yet.{' '}
                <Link to="/new-match">Create your first match</Link> or check the{' '}
                <Link to="/matches">live feed</Link>.
              </p>
            ) : (
              <div className="match-grid">
                {[...live, ...finished].map((m) => (
                  <MatchCard key={m.id} m={m} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}