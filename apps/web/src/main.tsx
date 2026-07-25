import { ClerkProvider } from "@clerk/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";

const rootElement = document.querySelector("#root");

if (rootElement === null) {
  throw new Error("Root element not found");
}

function envString(name: string): string | undefined {
  const value: unknown = import.meta.env[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

const publishableKey =
  envString("VITE_CLERK_PUBLISHABLE_KEY") ?? envString("CLERK_PUBLISHABLE_KEY");
const isLocalDevHost =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

createRoot(rootElement).render(
  <StrictMode>
    {publishableKey === undefined && isLocalDevHost ? (
      <App authMode="development" />
    ) : publishableKey === undefined ? (
      <main className="auth-shell">
        <section className="auth-panel" aria-labelledby="auth-config-title">
          <p>Authentication unavailable</p>
          <h1 id="auth-config-title">This deployment is missing Clerk configuration.</h1>
        </section>
      </main>
    ) : (
      <ClerkProvider publishableKey={publishableKey}>
        <App authMode="clerk" />
      </ClerkProvider>
    )}
  </StrictMode>,
);
