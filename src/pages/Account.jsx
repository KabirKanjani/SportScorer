import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Settings, UserRound, KeyRound, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';

function Section({ icon, title, children }) {
  return (
    <section className="panel settings-section">
      <h2 className="panel-title">
        <span>
          {icon} {title}
        </span>
      </h2>
      {children}
    </section>
  );
}

export default function Account() {
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();

  const [name, setName] = useState(user?.name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const [confirmText, setConfirmText] = useState('');
  const [delMsg, setDelMsg] = useState('');
  const [delErr, setDelErr] = useState('');
  const [delBusy, setDelBusy] = useState(false);

  async function saveProfile(e) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileMsg('');
    setProfileErr('');
    try {
      await api('/api/me/profile', { method: 'PATCH', body: { name, username } });
      await refresh();
      setProfileMsg('Profile updated.');
    } catch (err) {
      setProfileErr(err.message);
    } finally {
      setProfileBusy(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwBusy(true);
    setPwMsg('');
    setPwErr('');
    if (newPassword.length < 6) {
      setPwErr('New password must be at least 6 characters');
      setPwBusy(false);
      return;
    }
    try {
      await api('/api/me/password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setPwMsg('Password updated. Other devices were signed out.');
    } catch (err) {
      setPwErr(err.message);
    } finally {
      setPwBusy(false);
    }
  }

  async function deleteAccount(e) {
    e.preventDefault();
    if (confirmText.trim() !== 'DELETE') {
      setDelErr('Type DELETE to confirm.');
      return;
    }
    setDelBusy(true);
    setDelMsg('');
    setDelErr('');
    try {
      await api('/api/me', { method: 'DELETE', body: { confirm: 'DELETE' } });
      await logout();
      nav('/');
    } catch (err) {
      setDelErr(err.message);
      setDelBusy(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-head">
        <h1>
          <Settings size={22} /> Account settings
        </h1>
        <p className="muted">
          Signed in as {user?.username ? `@${user.username}` : user?.name}. Your
          stats and public matches stay under this account.
        </p>
      </div>

      <Section icon={<UserRound size={15} />} title="Profile">
        <form className="settings-form" onSubmit={saveProfile}>
          <div className="settings-row">
            <label>
              Name
              <input name="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            </label>
            <label>
              Username
              <input
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="@handle"
                pattern="[a-z0-9_]{3,20}"
                title="3–20 lowercase letters, numbers or underscores"
              />
            </label>
          </div>
          {profileMsg && <div className="form-hint ok">{profileMsg}</div>}
          {profileErr && <div className="form-error">{profileErr}</div>}
          <button className="btn primary" disabled={profileBusy}>
            {profileBusy ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </Section>

      <Section icon={<KeyRound size={15} />} title="Change password">
        <form className="settings-form" onSubmit={changePassword}>
          <label>
            Current password
            <input
              name="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label>
            New password
            <input
              name="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
            />
          </label>
          {pwMsg && <div className="form-hint ok">{pwMsg}</div>}
          {pwErr && <div className="form-error">{pwErr}</div>}
          <button className="btn primary" disabled={pwBusy}>
            {pwBusy ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </Section>

      <Section icon={<Trash2 size={15} />} title="Danger zone">
        <form className="settings-form" onSubmit={deleteAccount}>
          <p className="muted">
            Deleting permanently removes your personal data (name, email, password,
            avatar, sessions, follows and notifications). Matches and tournaments
            you took part in stay on the public feed but are anonymized to
            &ldquo;Deleted User&rdquo;. This cannot be undone.
          </p>
          <label>
            Type <strong>DELETE</strong> to confirm
            <input name="confirmDelete" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </label>
          {delMsg && <div className="form-hint ok">{delMsg}</div>}
          {delErr && <div className="form-error">{delErr}</div>}
          <button className="btn danger" disabled={delBusy}>
            {delBusy ? 'Deleting…' : 'Delete my account'}
          </button>
        </form>
      </Section>

      <div className="muted settings-foot">
        <Link to={`/player/${user?.id}`}>View my public profile</Link>
      </div>
    </div>
  );
}