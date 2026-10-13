import { Link } from 'react-router-dom';

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link className="logo" to={to}>
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#2563eb" />
        <path d="M10 6v20M10 10h4v9h-4zM21 4v22M19 9h4v12h-4z" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      PipRewind
    </Link>
  );
}
