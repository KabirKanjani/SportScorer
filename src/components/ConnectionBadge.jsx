const LABELS = {
  connecting: 'Connecting…',
  online: 'Live · remote devices synced',
  offline: 'Offline (local mode)',
};

export default function ConnectionBadge({ mode }) {
  return <span className={`conn-badge ${mode}`}>● {LABELS[mode] || mode}</span>;
}
