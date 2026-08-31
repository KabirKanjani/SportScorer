// Visual court-surface picker. Replaces the plain <select> dropdown with a
// grid of court thumbnails that actually look like the playing surface, so
// choosing "Clay court", "Glass court", "Grass court" etc. is visual instead
// of textual.

import { useState } from 'react';
import { SPORTS } from '../lib/sports.js';

// surface label -> recognizable color/texture for the thumbnail fill.
const SURFACE_FILL = {
  'Hard court': '#c2543b',
  'Clay court': '#c97c52',
  'Grass court': '#4c8a3d',
  'Carpet court': '#3f6ea8',
  'Glass indoor padel': '#127cae',
  'Outdoor padel': '#b6533f',
  'Artificial grass': '#3f8a52',
  'Glass court': '#1da1c9',
  'Full-height front wall': '#1f78b4',
  'Standard four-wall': '#2f6fb2',
  Outdoor: '#3f8a52',
  Indoor: '#b07a3a',
  'Competition table': '#1e6f9c',
  'Home table': '#2f7fbf',
  'Competition hall': '#4c8a4c',
  'Club hall': '#6a8a4c',
};

const OPEN_LAYOUTS = ['tennis', 'pickle', 'hall', 'open'];

function fillFor(sportId, label) {
  if (SURFACE_FILL[label]) return SURFACE_FILL[label];
  return SPORTS[sportId]?.court?.accent || '#94a3b8';
}

function CourtThumb({ kind, surface, accent }) {
  const isBox = kind === 'box';
  const isTable = kind === 'table';
  const isOpen = OPEN_LAYOUTS.includes(kind);
  const lines = 'rgba(255,255,255,.9)';
  return (
    <svg viewBox="0 0 120 80" className="court-thumb-svg" aria-hidden="true">
      {isTable ? (
        <g>
          <rect x="14" y="20" width="92" height="40" rx="4" fill={surface} />
          <line x1="60" y1="20" x2="60" y2="60" stroke={lines} strokeWidth="2.4" />
          <line x1="14" y1="40" x2="106" y2="40" stroke={lines} strokeWidth="1.2" strokeOpacity=".8" />
          <line x1="30" y1="40" x2="90" y2="40" stroke={lines} strokeWidth="1.4" />
          <line x1="10" y1="14" x2="10" y2="66" stroke="currentColor" strokeOpacity=".5" strokeWidth="6" />
          <line x1="110" y1="14" x2="110" y2="66" stroke="currentColor" strokeOpacity=".5" strokeWidth="6" />
          <line x1="10" y1="14" x2="110" y2="14" stroke="currentColor" strokeOpacity=".5" strokeWidth="6" />
          <line x1="10" y1="66" x2="110" y2="66" stroke="currentColor" strokeOpacity=".5" strokeWidth="6" />
        </g>
      ) : (
        <g>
          <rect x="22" y="14" width="76" height="52" rx="3" fill={surface} />
          {isBox ? (
            <>
              <rect x="22" y="14" width="76" height="52" rx="3" fill="none" stroke="currentColor" strokeOpacity=".4" />
              <path d="M22 24 H98 M22 56 H98" stroke="currentColor" strokeOpacity=".25" />
            </>
          ) : (
            <>
              <rect x="28" y="20" width="64" height="40" rx="2" fill="none" stroke={lines} strokeWidth="1.4" />
              <line x1="60" y1="20" x2="60" y2="60" stroke={lines} strokeWidth="1.4" />
              <line x1="28" y1="40" x2="92" y2="40" stroke={lines} strokeWidth="1.3" />
              <line x1="30" y1="33" x2="30" y2="47" stroke={lines} strokeWidth="1" />
              <line x1="90" y1="33" x2="90" y2="47" stroke={lines} strokeWidth="1" />
            </>
          )}
          {accent && <rect x="22" y="14" width="76" height="3.5" rx="1.75" fill={accent} opacity=".95" />}
        </g>
      )}
    </svg>
  );
}

export default function CourtPicker({ sport, value, onChange }) {
  const s = SPORTS[sport];
  const [touched, setTouched] = useState(false);
  if (!s) return null;

  const seen = new Set();
  const options = [];
  for (const o of [s.court.surface, ...(s.courtOptions || [])]) {
    if (o && !seen.has(o)) {
      seen.add(o);
      options.push(o);
    }
  }
  const effective = value ?? s.court.surface;
  const kind = s.court.kind || 'open';

  return (
    <div className="court-picker">
      {options.map((o) => {
        const active = effective === o;
        return (
          <button
            key={o}
            type="button"
            className={`court-option ${active ? 'active' : ''}`}
            onClick={() => {
              setTouched(true);
              onChange(active && touched ? null : o);
            }}
          >
            <span className="court-thumb" style={{ color: s.court.accent }}>
              <CourtThumb kind={kind} surface={fillFor(sport, o)} accent={active ? s.court.accent : null} />
            </span>
            <span className="court-opt-label">{o}</span>
          </button>
        );
      })}
    </div>
  );
}
