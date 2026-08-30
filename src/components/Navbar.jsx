import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import NotificationsBell from './NotificationsBell.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          <span className="brand-icon">🎾</span>
          <span className="brand-name">SportScore</span>
        </Link>

        <nav className="nav-links">
          <NavLink to="/matches" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Live Feed
          </NavLink>
          <NavLink to="/tournaments" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Tournaments
          </NavLink>
          <NavLink to="/leaderboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Leaderboard
          </NavLink>
          <NavLink to="/search" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Search
          </NavLink>
          {user && (
            <>
              <NotificationsBell />
              <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                My Matches
              </NavLink>
              <NavLink to="/new-match" className="nav-link cta">
                + New Match
              </NavLink>
              <NavLink to={`/player/${user.id}`} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <span className="nav-avatar"><Avatar user={user} /></span>
                {user.name}
              </NavLink>
            </>
          )}
        </nav>

        <div className="nav-auth">
          {user ? (
            <button
              className="btn ghost"
              onClick={async () => {
                await logout();
                nav('/');
              }}
            >
              Log out
            </button>
          ) : (
            <>
              <Link to="/login" className="btn ghost">
                Log in
              </Link>
              <Link to="/register" className="btn primary">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}