// Custom SVG sport icons. Every racket/ball is drawn as a clean line icon so
// the whole set reads consistently at small sizes. Each icon is a 48x48 viewBox
// using `currentColor` strokes/fills so it inherits surrounding color.
//
// Usage:
//   <SportIcon id="tennis" />
//   <SportIcon id="padel" size={28} className="..." />

const ICONS = {
  tennis: (
    <>
      <circle cx="24" cy="24" r="15" />
      <path d="M24 9a15 15 0 0 1 0 30M10.5 15.5 37.5 32.5M10.5 32.5 37.5 15.5" strokeWidth="2" />
    </>
  ),
  padel: (
    <>
      <ellipse cx="18" cy="27" rx="13" ry="15" />
      <path d="M6 13c0-1.7 1.3-3 3-3 8 0 16-1 22-6" strokeWidth="2.4" />
      <path d="M6 17v8" strokeWidth="2.4" />
      <path d="M11 17v8" strokeWidth="2.4" />
      <line x1="18" y1="12" x2="18" y2="42" />
    </>
  ),
  squash: (
    <>
      <path d="M24 10a14 14 0 1 0 14 14" />
      <path d="M22 12v8" />
      <rect x="20.4" y="18" width="3.2" height="6" rx="1" />
      <circle cx="24" cy="28" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  racquetball: (
    <>
      <path d="M24 10a14 14 0 1 0 14 14" />
      <circle cx="24" cy="27" r="8" strokeWidth="2.2" />
    </>
  ),
  pickleball: (
    <>
      <path d="M16 6 42 32c1.6 1.6 1.6 4.2 0 5.8l-4.2 4.2c-1.6 1.6-4.2 1.6-5.8 0L6 16" />
      <path d="M20 6l-3 3" />
      <path d="M16 10l3-3" />
    </>
  ),
  tabletennis: (
    <>
      <path d="M8 26h32v10a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6z" strokeWidth="2.4" />
      <line x1="8" y1="26" x2="40" y2="26" strokeWidth="2.4" />
      <line x1="24" y1="26" x2="24" y2="42" strokeWidth="2.2" />
      <rect x="19" y="26" width="10" height="16" fill="currentColor" fillOpacity=".16" stroke="none" />
    </>
  ),
  badminton: (
    <>
      <circle cx="31" cy="16" r="4" />
      <path d="M27 18c3 6 9 9 13 11l-7 7c-2-4-5-10-11-13z" strokeWidth="2.2" />
      <path d="M25 12 42 5c2.4-1.2 4.8 1.2 3.6 3.6L38 22" strokeWidth="2.2" />
    </>
  ),
};

export function SportIcon({ id, size = 20, className = '', style }) {
  const body = ICONS[id];
  if (!body) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`sport-icon-svg ${className}`}
      style={style}
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}

// Per-sport accent color (deeper, readable version of the court surface color).
export const SPORT_COLORS = {
  tennis: '#16a34a',
  padel: '#0ea5e9',
  squash: '#e11d48',
  racquetball: '#2563eb',
  pickleball: '#ca8a04',
  tabletennis: '#475569',
  badminton: '#65a30d',
};
