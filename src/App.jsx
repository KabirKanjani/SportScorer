import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { Component } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import Navbar from './components/Navbar.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import LoginOtp from './pages/LoginOtp.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Register from './pages/Register.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MatchPage from './pages/MatchPage.jsx';
import NewMatch from './pages/NewMatch.jsx';
import Feed from './pages/Feed.jsx';
import PlayerPage from './pages/PlayerPage.jsx';
import Tournaments from './pages/Tournaments.jsx';
import NewTournament from './pages/NewTournament.jsx';
import Tournament from './pages/Tournament.jsx';
import Search from './pages/Search.jsx';
import Legal from './pages/Legal.jsx';

function CrashFallback({ resetError }) {
  return (
    <div className="empty-state">
      <h2>Something went wrong</h2>
      <p>The page hit an unexpected error — it's been reported if monitoring is on.</p>
      <button className="btn primary" onClick={resetError}>
        Try again
      </button>
    </div>
  );
}

// Render-time crash shield. Reports through the Sentry loader when present, so
// a render error never blanks the whole app.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    window.Sentry?.captureException(error, {
      extra: { componentStack: info?.componentStack },
    });
  }
  render() {
    if (this.state.error) return <CrashFallback resetError={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="boot">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="app-wrap">
      <Navbar />
      <main className="page">
        <ErrorBoundary>
          <Routes>
          <Route path="/" element={user ? <Dashboard /> : <Landing />} />
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/login-otp" element={user ? <Navigate to="/" replace /> : <LoginOtp />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
          <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" replace />} />
          <Route path="/new-match" element={user ? <NewMatch /> : <Navigate to="/login" replace />} />
          <Route path="/matches" element={<Feed />} />
          <Route path="/search" element={<Search />} />
          <Route path="/match/:id" element={<MatchPage />} />
          <Route path="/player/:id" element={<PlayerPage />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/tournaments/new" element={user ? <NewTournament /> : <Navigate to="/login" replace />} />
          <Route path="/tournaments/:id" element={<Tournament />} />
          <Route path="/privacy" element={<Legal kind="privacy" />} />
          <Route path="/terms" element={<Legal kind="terms" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <footer className="footer">
        <span>SportScore · real-time racquet sports scoring for friends 🎾🥒🏓</span>
        <span className="footer-links">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </span>
      </footer>
    </div>
  );
}