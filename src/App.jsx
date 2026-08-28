import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Navbar from './components/Navbar.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import LoginOtp from './pages/LoginOtp.jsx';
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
        <Routes>
          <Route path="/" element={user ? <Dashboard /> : <Landing />} />
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/login-otp" element={user ? <Navigate to="/" replace /> : <LoginOtp />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
          <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" replace />} />
          <Route path="/new-match" element={user ? <NewMatch /> : <Navigate to="/login" replace />} />
          <Route path="/matches" element={<Feed />} />
          <Route path="/match/:id" element={<MatchPage />} />
          <Route path="/player/:id" element={<PlayerPage />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/tournaments/new" element={user ? <NewTournament /> : <Navigate to="/login" replace />} />
          <Route path="/tournaments/:id" element={<Tournament />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        SportScore · real-time racquet sports scoring for friends 🎾🥒🏓
      </footer>
    </div>
  );
}