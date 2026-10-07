import { Component, Suspense, type ReactNode } from 'react';
import { copy } from '../content';
import ui from './ui.module.css';

/** Shown while a lazy screen loads: a landmark and a status, never a blank page. */
function Loading() {
  return (
    <main aria-busy="true" style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
      <p role="status" className={ui.muted}>
        {copy.app.loading}
      </p>
    </main>
  );
}

/**
 * Lazy screens (M7 perf) can fail to load on weak Wi-Fi or after a redeploy removes old chunks:
 * show a way out (Reload) instead of a white screen. Progress is saved, so Reload resumes.
 */
class LoadErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main style={{ flex: 1, display: 'grid', placeItems: 'center', gap: 12, textAlign: 'center' }}>
        <p role="alert">{copy.app.loadError}</p>
        <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={() => window.location.reload()}>
          {copy.app.reload}
        </button>
      </main>
    );
  }
}

export function ScreenBoundary({ children }: { children: ReactNode }) {
  return (
    <LoadErrorBoundary>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </LoadErrorBoundary>
  );
}
