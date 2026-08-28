import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import MatchCard from '../components/MatchCard.jsx';

export default function Landing() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    api('/api/matches?limit=6')
      .then((d) => setMatches(d.matches))
      .catch(() => {});
  }, []);

  return (
    <div className="landing">
      <section className="hero">
        <h1>
          Score your match.
          <br />
          Everyone sees it live.
        </h1>
        <p className="hero-sub">
          SportScore is the free real-time scoreboard for <b>tennis</b>, <b>padel</b>,{' '}
          <b>pickleball</b>, <b>table tennis</b>, <b>squash</b> and <b>badminton</b>. Keep
          score on your phone — friends follow every point from anywhere.
        </p>
        <div className="hero-cta">
          <Link to="/register" className="btn primary big">
            Create free account
          </Link>
          <Link to="/matches" className="btn ghost big">
            Browse live matches
          </Link>
        </div>
        <div className="hero-feats">
          <span>📱 Live point-by-point scoring</span>
          <span>👥 Follow friends &amp; their matches</span>
          <span>📈 Personal stats &amp; history</span>
        </div>
      </section>

      <section className="landing-feed">
        <div className="section-head">
          <h2>Live &amp; recent matches</h2>
          <Link to="/matches" className="see-all">
            See all →
          </Link>
        </div>
        <div className="match-grid">
          {matches.length === 0 && <p className="muted">No matches yet — be the first to score one!</p>}
          {matches.map((m) => (
            <MatchCard key={m.id} m={m} />
          ))}
        </div>
      </section>
    </div>
  );
}