import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Radio, Trophy, BarChart3, Search, LayoutDashboard, LogOut, LogIn, UserPlus, PlusCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import NotificationsBell from './NotificationsBell.jsx';

function BrandMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ssg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#0284c7" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#ssg)" />
      <circle cx="24" cy="24" r="12.5" fill="none" stroke="#fff" strokeWidth="2.6" />
      <path d="M13.5 20.5 9 24l4.5 3.5M34.5 20.5 39 24l-4.5 3.5M18.5 14.5 20 33.5M29.5 14.5 28 33.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="15" y1="24" x2="33" y2="24" stroke="#fff" strokeWidth="2.2" />
    </svg>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          <span className="brand-icon brand-mark">
            <BrandMark />
          </span>
          <span className="brand-name">SportScore</span>
        </Link>

        <nav className="nav-links">
          <NavLink to="/matches" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            <Radio size={15} /> Live Feed
          </NavLink>
          <NavLink to="/tournaments" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            <Trophy size={15} /> Tournaments
          </NavLink>
          <NavLink to="/leaderboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            <BarChart3 size={15} /> Leaderboard
          </NavLink>
          <NavLink to="/search" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            <Search size={15} /> Search
          </NavLink>
          {user && (
            <>
              <NotificationsBell />
              <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <LayoutDashboard size={15} /> My Matches
              </NavLink>
              <NavLink to="/new-match" className="nav-link cta">
                <PlusCircle size={15} /> New Match
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
              <LogOut size={15} /> Log out
            </button>
          ) : (
            <>
              <Link to="/login" className="btn ghost">
                <LogIn size={15} /> Log in
              </Link>
              <Link to="/register" className="btn primary">
                <UserPlus size={15} /> Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}