import { useState } from 'react';

// Shown once a match is over: winner + full score, per-player point tallies
// (built from the structured point-detail events), and one-tap sharing.
export default function MatchReport({ display, events, meta, venue }) {
  const [copied, setCopied] = useState(false);

  if (!display || display.winnerIdx == null) return null;
  const winner = display.playerNames[display.winnerIdx];
  const loser = display.playerNames[1 - display.winnerIdx];

  const scoreText = display.setsFamily
    ? (display.completedSets || [])
        .map((s) =>
          s.tb
            ? `${s.a}-${s.b}${Array.isArray(s.tbPts) ? ` (${s.tbPts[0]}-${s.tbPts[1]})` : ''}`
            : `${s.a}-${s.b}`
        )
        .join(', ')
    : (display.completedGames || []).map(([a, b]) => `${a}-${b}`).join(', ');

  // tally: per playerIdx -> { kind: count }
  const tally = [{}, {}];
  (events || []).forEach((e) => {
    if (e.playerIdx == null || !e.kind || e.playerIdx > 1) return;
    tally[e.playerIdx][e.kind] = (tally[e.playerIdx][e.kind] || 0) + 1;
  });
  const hasStats = tally[0][Object.keys(tally[0])[0]] ?? tally[1][Object.keys(tally[1])[0]] ?? false;

  const KIND_LABELS = {
    ace: 'Aces',
    doublefault: 'Double faults',
    serve: 'Aces',
    winner: 'Winners',
    unforced: 'Unforced errors',
    forced: 'Forced errors',
    drop: 'Drop shots',
    net: 'Net plays',
    bandeja: 'Bandejas',
    vibora: 'Viboras',
    let: 'Lets',
    tin: 'Tin errors',
    dink: 'Dink errors',
    kitchen: 'Kitchen faults',
    erne: 'Ernes',
    netkill: 'Netkills',
    lift: 'Lift errors',
    smash: 'Smashes',
    fault: 'Faults',
    block: 'Blocks',
    push: 'Push errors',
    other: 'Other',
  };

  const statsRow = (idx) =>
    Object.entries(tally[idx])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, n]) => (
        <span key={k} className="report-stat">
          <b>{n}</b> {KIND_LABELS[k] || k}
        </span>
      ));

  const url = window.location.href;
  const shareText = `${meta?.sportName || 'Sport'} result: ${winner} beats ${loser} ${scoreText} — see it on SportScore: ${url}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  function whatsapp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener');
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: `${meta?.sportName || 'Sport'} result`, text: shareText, url });
    } catch { /* user dismissed or unsupported */ }
  }

  return (
    <div className="panel report">
      <div className="report-head">
        <div className="report-trophy">🏆</div>
        <div className="report-title">
          <h2>{meta?.icon || ''} {meta?.sportName || 'Match'} · Final</h2>
          <div className="report-winner">
            <b>{winner}</b> beats {loser}
          </div>
          <div className="report-score">{scoreText || '—'}</div>
        </div>
      </div>

      {hasStats && (
        <div className="report-stats">
          {[0, 1].map(
            (idx) =>
              Object.keys(tally[idx]).length > 0 && (
                <div key={idx} className="report-player-stats">
                  <span className="report-player-name">
                    {display.playerNames[idx]}
                    {idx === display.winnerIdx && <em>champion</em>}
                  </span>
                  <div className="report-stat-row">{statsRow(idx)}</div>
                </div>
              )
          )}
        </div>
      )}

      <div className="report-facts">
        {meta?.durationMinutes != null && <span>⏱ {meta.durationMinutes} min</span>}
        {venue ? <span>📍 {venue}</span> : null}
        <span className="muted small">Live score, saved to both players' history.</span>
      </div>

      <div className="report-share">
        <button className="btn primary" onClick={copyLink}>
          {copied ? 'Copied ✓' : '🔗 Copy link'}
        </button>
        <button className="btn ghost" onClick={whatsapp}>
          💬 WhatsApp
        </button>
        {navigator.share && (
          <button className="btn ghost" onClick={nativeShare}>
            📤 Share
          </button>
        )}
      </div>
    </div>
  );
}