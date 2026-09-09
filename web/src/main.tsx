import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { SafeModeProvider } from "./lib/safe-mode";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SafeModeProvider>
      <App />
    </SafeModeProvider>
  </StrictMode>,
);