import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.tsx';
import { Landing } from './pages/Landing.tsx';

const Workspace = lazy(() => import('./pages/Workspace.tsx').then((m) => ({ default: m.Workspace })));
const Analytics = lazy(() => import('./pages/Analytics.tsx').then((m) => ({ default: m.Analytics })));

const loading = (
  <div className="center-page">
    <div className="spinner" />
  </div>
);

export function App() {
  return (
    <Suspense fallback={loading}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<Dashboard />} />
        <Route path="/app/session/:id" element={<Workspace />} />
        <Route path="/app/session/:id/analytics" element={<Analytics />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
