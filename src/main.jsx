import React from "react";
import ReactDOM from "react-dom/client";
import Root from "./Root.jsx";
import { initSentry, AppErrorBoundary } from "./lib/sentry.jsx";

initSentry(); // no-op unless VITE_SENTRY_DSN is set

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <Root />
    </AppErrorBoundary>
  </React.StrictMode>
);
