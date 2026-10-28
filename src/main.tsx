import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/geist-sans/300.css";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@/ui/styles/prototype.css";
import "@/ui/styles/app.css";
import "@/ui/styles/track.css";
import App from "@/app/App";
import { ConsoleProvider } from "@/application/state/ConsoleContext";
import { ConnectionProvider } from "@/application/state/ConnectionContext";

import { AuthGate } from "@/ui/components/AuthGate";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate>
      <ConnectionProvider>
        <ConsoleProvider>
          <App />
        </ConsoleProvider>
      </ConnectionProvider>
    </AuthGate>
  </StrictMode>,
);
