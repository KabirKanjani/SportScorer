import { useState } from 'react';

export default function Controls({
  scoreboard,
  display,
  meta,
  detailEnabled,
  detailWinner,
  detailPromptOn,
  detailOptions = [],
  onRecordDetail,
  onDismissDetail,
}) {
  const { playerNames, matchOver } = display;

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

        {detailEnabled && detailPromptOn && (
          <div className="point-detail">
            <div className="point-detail-head">
              How did <b>{detailWinner}</b> win the point?
              <button className="x" onClick={onDismissDetail} aria-label="dismiss">
                ✕
              </button>
            </div>
            <div className="point-detail-chips">
              {detailOptions.map((d) => (
                <button key={d} className="chip" onClick={() => onRecordDetail(d)}>
                  {d}
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