import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import posthog from "posthog-js";
import App from "./App";
import "./styles.css";

// 1. Initialize Sentry Telemetry
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || "https://examplePublicKey@o0.ingest.sentry.io/0",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// 2. Initialize PostHog Product Analytics
posthog.init(import.meta.env.VITE_POSTHOG_KEY || "phc_mock_key_for_telemetry_L4", {
  api_host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
  person_profiles: "identified_only",
  capture_pageview: true,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 20_000
    }
  }
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
