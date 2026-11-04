// Entrada de la página del celular (/celular.html): misma API y sesión que la consola.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-mono/400.css";
import "@/celular/phone.css";
import { AuthGate } from "@/ui/components/AuthGate";
import { PhoneProvider } from "@/celular/context";
import { PhoneApp } from "@/celular/PhoneApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate keepMounted>
      <PhoneProvider>
        <PhoneApp />
      </PhoneProvider>
    </AuthGate>
  </StrictMode>,
);
