import { useEffect, useState, useCallback } from 'react';
import { api, wsUrl } from '../api.js';
import MatchCard from '../components/MatchCard.jsx';
import { SPORTS, SPORT_IDS } from '../lib/sports.js';

export default function Feed() {
  const [matches, setMatches] = useState([]);
  const [sport, setSport] = useState('all');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '40' });
      if (sport !== 'all') params.set('sport', sport);
      if (status !== 'all') params.set('status', status);
      const d = await api(`/api/matches?${params}`);
      setMatches(d.matches);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [sport, status]);

  useEffect(() => {
    load();
  }, [load]);

  // Live feed updates
  useEffect(() => {
    const ws = new WebSocket(wsUrl());
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'feed-changed') load();
      } catch {}
    };
    return () => ws.close();
  }, [load]);

  return (
    <div className="feed">
      <div className="section-head">
        <h1>Match feed</h1>
        <div className="feed-status">
          {connected ? (
            <span className="live-pill">● live updates on</span>
          ) : (
            <span className="muted small">updates paused</span>
          )}
        </div>
      </div>

      <div className="filter-row">
        <div className="sport-tabs">
          <button className={`tab ${sport === 'all' ? 'active' : ''}`} onClick={() => setSport('all')}>
            All sports
          </button>
          {SPORT_IDS.map((id) => (
            <button key={id} className={`tab ${sport === id ? 'active' : ''}`} onClick={() => setSport(id)}>
              {SPORTS[id].icon} {SPORTS[id].name}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-row">
        <div className="status-tabs">
          <button className={`tab ${status === 'all' ? 'active' : ''}`} onClick={() => setStatus('all')}>
            All
          </button>
          <button className={`tab ${status === 'live' ? 'active' : ''}`} onClick={() => setStatus('live')}>
            ● Live
          </button>
          <button className={`tab ${status === 'finished' ? 'active' : ''}`} onClick={() => setStatus('finished')}>
            Finished
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : matches.length === 0 ? (
        <div className="empty-state">
          <p className="muted">No matches found. Start the first one!</p>
        </div>
      ) : (
        <div className="match-grid">
          {matches.map((m) => (
            <MatchCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}