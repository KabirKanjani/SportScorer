import { useState } from 'react';

export default function Controls({
  scoreboard,
  display,
  meta,
  detailEnabled,
  detailWinner,
  detailWinnerIdx,
  detailServerIdx,
  detailPromptOn,
  detailOptions = [],
  onRecordDetail,
  onDismissDetail,
}) {
  const { playerNames, matchOver } = display;

  // Ace needs the server to have won the point; a double fault hands it to the
  // receiver — so only offer options that match who actually won the point.
  const validOptions = detailOptions.filter((o) => {
    if (!o.only) return true;
    if (detailWinnerIdx == null || detailServerIdx == null) return false;
    return o.only === 'server'
      ? detailWinnerIdx === detailServerIdx
      : detailWinnerIdx !== detailServerIdx;
  });

  return (
    <div className="controls">
      <div className="panel score-panel">
        <div className="panel-title">Score</div>
        <div className="point-buttons">
          <button
            className="point-btn p1"
            disabled={matchOver}
            onClick={() => scoreboard.pointFor(0)}
          >
            <span className="btn-label">Point</span>
            <span className="btn-name">{playerNames[0]}</span>
          </button>
          <button
            className="point-btn p2"
            disabled={matchOver}
            onClick={() => scoreboard.pointFor(1)}
          >
            <span className="btn-label">Point</span>
            <span className="btn-name">{playerNames[1]}</span>
          </button>
        </div>

        {detailEnabled && detailPromptOn && validOptions.length > 0 && (
          <div className="point-detail">
            <div className="point-detail-head">
              How did <b>{detailWinner}</b> win the point?
              <button className="x" onClick={onDismissDetail} aria-label="dismiss">
                ✕
              </button>
            </div>
            <div className="point-detail-chips">
              {validOptions.map((o, i) => (
                <button key={o.key || i} className="chip" onClick={() => onRecordDetail(o)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-title">Actions</div>
        <div className="actions-row">
          <button className="action-btn" disabled={matchOver} onClick={scoreboard.doUndo}>
            ↩ Undo
          </button>
          <button className="action-btn" disabled={matchOver} onClick={scoreboard.doSwap}>
            ⇄ Swap sides
          </button>
          <button
            className="action-btn danger"
            disabled={matchOver}
            onClick={() => {
              if (confirm('Start a fresh match with the same players?')) {
                scoreboard.doReset();
              }
            }}
          >
            ⟲ New game
          </button>
        </div>
        {meta && (
          <p className="meta-note">You are {matchOver ? '' : 'scoring '}this match — friends watching see every point live.</p>
        )}
      </div>
    </div>
  );
}