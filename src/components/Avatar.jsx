const PALETTE = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#22c55e'];

// Local uploads live under /uploads; seeded bot avatars are absolute URLs.
export function avatarHref(avatar) {
  if (!avatar) return null;
  return /^https?:\/\//.test(avatar) ? avatar : `/uploads/${avatar}`;
}

// Renders a user's uploaded picture, or a colored initial fallback.
export default function Avatar({ user, className = '', title }) {
  if (!user) return <span className={`avatar ${className}`}>?</span>;
  if (user.avatar) {
    return (
      <img
        className={`avatar photo ${className}`}
        src={avatarHref(user.avatar)}
        alt={user.name}
        title={title ?? user.name}
        loading="lazy"
      />
    );
  }
  const c = PALETTE[Math.abs((typeof user.id === 'number' ? user.id : 0) % PALETTE.length)];
  return (
    <span
      className={`avatar ${className}`}
      style={{ background: `linear-gradient(135deg, ${c}, #1e3a8a)`, color: '#fff' }}
    >
      {user.name?.[0]?.toUpperCase() || '?'}
    </span>
  );
}