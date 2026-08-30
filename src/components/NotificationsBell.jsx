import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';

// Bell that polls the unread counter and shows a badge. The page marks
// notifications as read, so the badge naturally drains on the next tick.
export default function NotificationsBell() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const tick = async () => {
      try {
        const d = await api('/api/notifications/unread');
        if (alive) setUnread(d.unread || 0);
      } catch {
        /* network hiccup — badge stays as-is */
      }
    };
    tick();
    const t = setInterval(tick, 45000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user]);

  return (
    <Link to="/notifications" className={`bell ${unread ? 'bell-unread' : ''}`} aria-label="Notifications">
      <span className="bell-icon" aria-hidden="true">🔔</span>
      {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
    </Link>
  );
}