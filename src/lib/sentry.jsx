import * as Sentry from "@sentry/react";

/**
 * Error monitoring — DORMANT until a DSN is provided.
 *
 * With no `VITE_SENTRY_DSN`, initSentry() does nothing and AppErrorBoundary
 * renders its children unchanged, so the app behaves byte-identically to having
 * no Sentry at all (the "degrade gracefully when absent" integration principle).
 * Add the DSN at launch to activate — no code change.
 *
 * Privacy posture (see docs/SECURITY.md §7): we transmit stack traces, NOT tenant
 * data. `sendDefaultPii: false` keeps IPs/cookies/headers out; errors-only
 * (`tracesSampleRate: 0`) means no performance data; and `beforeSend` strips the
 * user object and any request body/cookies/query so nothing practice-identifying,
 * no member email, and no PHI-adjacent content leaves the browser.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN;
export const sentryEnabled = Boolean(DSN);

export function initSentry() {
  if (!sentryEnabled) return; // dormant without a DSN
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE, // "development" | "production" (Netlify)
    sendDefaultPii: false,
    tracesSampleRate: 0, // errors only — no performance traces
    beforeSend(event) {
      // Defense in depth on top of sendDefaultPii:false — never ship identifying data.
      delete event.user;
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        delete event.request.query_string;
        delete event.request.headers;
      }
      return event;
    },
  });
}

// Minimal, brand-neutral crash screen (a crash can precede the practice theme
// loading, so this stays platform-neutral rather than practice-branded).
function CrashFallback() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif", color: "#14263D" }}>
      <div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ marginBottom: 16, color: "#5b6b7a" }}>The page hit an unexpected error. Reloading usually fixes it.</p>
        <button onClick={() => window.location.reload()} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #14263D", background: "#14263D", color: "#fff", cursor: "pointer" }}>
          Reload
        </button>
      </div>
    </div>
  );
}

// Wrap the app. When dormant, this is a transparent pass-through (children render
// exactly as before, dev error overlays still work); with a DSN it catches, reports,
// and shows the fallback.
export function AppErrorBoundary({ children }) {
  if (!sentryEnabled) return children;
  return <Sentry.ErrorBoundary fallback={<CrashFallback />}>{children}</Sentry.ErrorBoundary>;
}
