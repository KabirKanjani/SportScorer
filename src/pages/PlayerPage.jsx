import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import MatchCard from '../components/MatchCard.jsx';
import Avatar from '../components/Avatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { SPORTS } from '../lib/sports.js';

const IMG_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export default function PlayerPage() {
  const { id } = useParams();
  const { user, refresh } = useAuth();
  const [data, setData] = useState(null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picMsg, setPicMsg] = useState('');
  const [picBusy, setPicBusy] = useState(false);
  const fileRef = useRef(null);

  const reload = () =>
    api(`/api/users/${id}`)
      .then((d) => {
        setData(d);
        setFollowing(d.isFollowing);
      })
      .catch(() => setError('Player not found'));

  useEffect(() => {
    setData(null);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function toggleFollow() {
    setBusy(true);
    try {
      if (following) {
        await api(`/api/users/${id}/follow`, { method: 'DELETE' });
        setFollowing(false);
        setData((d) => ({ ...d, followers: d.followers - 1 }));
      } else {
        await api(`/api/users/${id}/follow`, { method: 'POST' });
        setFollowing(true);
        setData((d) => ({ ...d, followers: d.followers + 1 }));
      }
    } catch (e) {
      if (e.status === 401) setError('Log in to follow players');
      else setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function changePic(file) {
    if (!file) return;
    if (!IMG_TYPES.includes(file.type)) {
      setPicMsg('Choose a PNG, JPG, GIF or WebP image.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setPicMsg('Image must be under 3MB.');
      return;
    }
    setPicBusy(true);
    setPicMsg('');
    try {
      const reader = new FileReader();
      const buf = await new Promise((res, rej) => {
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      await api('/api/me/avatar', { method: 'POST', body: { data: buf } });
      setPicMsg('Picture updated ✓');
      await refresh();
      await reload();
    } catch (e) {
      setPicMsg(e.message);
    } finally {
      setPicBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removePic() {
    setPicBusy(true);
    setPicMsg('');
    try {
      await api('/api/me/avatar', { method: 'DELETE' });
      setPicMsg('Picture removed.');
      await refresh();
      await reload();
    } catch (e) {
      setPicMsg(e.message);
    } finally {
      setPicBusy(false);
    }
  }

  if (error && !data) return <div className="form-error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const isMe = user?.id === data.user.id;
  const stats = data.stats;

  return (
    <div className="player-page">
      <header className="player-head">
        <div className="avatar-wrap">
          <Avatar user={data.user} className="big" />
          {isMe && (
            <div className="avatar-edit">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                hidden
                onChange={(e) => changePic(e.target.files?.[0])}
              />
              <button
                className="btn ghost small"
                disabled={picBusy}
                onClick={() => fileRef.current?.click()}
              >
                {picBusy ? '…' : data.user.avatar ? 'Change photo' : 'Add photo'}
              </button>
              {data.user.avatar && (
                <button className="btn ghost small" disabled={picBusy} onClick={removePic}>
                  Remove
                </button>
              )}
            </div>
          )}
          {picMsg && <div className="form-ok small">{picMsg}</div>}
        </div>
        <div>
          <h1>
            {data.user.name}
            {data.user.username && <span className="username-tag">@{data.user.username}</span>}
            {data.user.emailVerified && (
              <span className="cred-chip ok">✓ email verified</span>
            )}
          </h1>
          <p className="muted">
            {data.followers} followers · following {data.following} · joined{' '}
            {new Date(data.user.createdAt).toLocaleDateString()}
          </p>
        </div>
        {!isMe && (
          <button className="btn primary" disabled={busy} onClick={toggleFollow}>
            {following ? '✓ Following' : '+ Follow'}
          </button>
        )}
        {isMe && (
          <Link to="/new-match" className="btn ghost">
            + Score a match
          </Link>
        )}
      </header>

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
      <p className="muted small">
        Stats only count fully confirmed results (the players agreed on the final score).
      </p>

      {Object.keys(stats.bySport).length > 0 && (
        <section className="panel">
          <div className="panel-title">By sport</div>
          <div className="sport-stats">
            {Object.entries(stats.bySport).map(([s, st]) => (
              <div key={s} className="sport-stat">
                <span className="sport-icon">
                  {SPORTS[s]?.icon} {SPORTS[s]?.name}
                </span>
                <span>
                  {st.wins}W · {st.losses}L
                </span>
                <span className="win-pct">{st.winPct}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>Match history</h2>
        </div>
        {data.matches.length === 0 ? (
          <p className="muted">No matches yet.</p>
        ) : (
          <div className="match-grid">
            {data.matches.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}