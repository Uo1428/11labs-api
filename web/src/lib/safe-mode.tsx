import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "ll_safe_mode";

interface SafeModeCtx {
  safeMode: boolean;
  setSafeMode: (v: boolean) => void;
}

const Ctx = createContext<SafeModeCtx>({ safeMode: false, setSafeMode: () => {} });

export function SafeModeProvider({ children }: { children: ReactNode }) {
  const [safeMode, setSafeModeState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.body.dataset.safeMode = safeMode ? "on" : "off";
  }, [safeMode]);

  const setSafeMode = (v: boolean) => {
    setSafeModeState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      // storage unavailable
    }
  };

  return <Ctx.Provider value={{ safeMode, setSafeMode }}>{children}</Ctx.Provider>;
}

export function useSafeMode() {
  return useContext(Ctx);
}

const BULLET = "••••";

export function maskEmail(email?: string | null): string {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  let maskedLocal: string;
  if (local.length <= 2) {
    maskedLocal = local[0] + "*".repeat(Math.max(1, local.length - 1));
  } else {
    maskedLocal = local[0] + "*".repeat(local.length - 2) + local[local.length - 1];
  }
  return maskedLocal + domain;
}

export function maskToken(token?: string | null): string {
  return token ? BULLET.repeat(4) : "";
}
