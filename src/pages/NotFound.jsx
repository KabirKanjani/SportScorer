import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="empty-state notfound">
      <div className="notfound-num">404</div>
      <h2>Page not found</h2>
      <p>
        That link doesn&rsquo;t exist or may have moved. The player, match or
        tournament you&rsquo;re after might be private, removed, or misspelled.
      </p>
      <div className="notfound-actions">
        <Link to="/" className="btn primary">
          <Compass size={16} /> Go to home
        </Link>
        <Link to="/matches" className="btn ghost">
          Browse live matches
        </Link>
      </div>
    </div>
  );
}