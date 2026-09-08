import { useCallback, useEffect, useState } from "react";
import { api, getAdminKey, setAdminKey, clearAdminKey } from "./api";
import type { Account } from "./types";
import { Sidebar } from "./components/Sidebar";
import { Studio } from "./components/Studio";
import { HistoryTab } from "./components/HistoryTab";
import { VoicesTab } from "./components/VoicesTab";
import { ApiKeysTab } from "./components/ApiKeysTab";
import { UsageTab } from "./components/UsageTab";
import { HealthTab } from "./components/HealthTab";
import { DocsTab } from "./components/DocsTab";
import { AdminGate } from "./components/AdminGate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Button } from "./components/ui/button";

type Tab = "studio" | "history" | "voices" | "api-keys" | "usage" | "health" | "docs";
type AuthState = "checking" | "locked" | "open";

const TABS: { id: Tab; label: string }[] = [
  { id: "studio", label: "Studio" },
  { id: "history", label: "History" },
  { id: "voices", label: "Voices" },
  { id: "api-keys", label: "API Keys" },
  { id: "usage", label: "Usage" },
  { id: "health", label: "Health" },
  { id: "docs", label: "API Docs" },
];

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateBusy, setGateBusy] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountMode, setAccountMode] = useState("auto");
  const [tab, setTab] = useState<Tab>("studio");

  const refreshAccounts = useCallback(async () => {
    try {
      const data = await (await api("/accounts")).json();
      setAccounts(data as Account[]);
    } catch {
      // ignore polling errors
    }
  }, []);

  useEffect(() => {
    const existing = getAdminKey();
    if (existing) {
      api("/admin/verify")
        .then(() => setAuthState("open"))
        .catch(() => {
          clearAdminKey();
          setAuthState("locked");
        });
    } else {
      setAuthState("locked");
    }

    const onUnauthorized = () => {
      clearAdminKey();
      setAuthState("locked");
    };
    window.addEventListener("ll:unauthorized", onUnauthorized);
    return () => window.removeEventListener("ll:unauthorized", onUnauthorized);
  }, []);

  useEffect(() => {
    if (authState !== "open") return;
    refreshAccounts();
    const t = setInterval(refreshAccounts, 30_000);
    return () => clearInterval(t);
  }, [authState, refreshAccounts]);

  async function login(key: string) {
    setGateBusy(true);
    setGateError(null);
    setAdminKey(key);
    try {
      await api("/admin/verify");
      setAuthState("open");
      return true;
    } catch (e) {
      clearAdminKey();
      setGateError(e instanceof Error ? e.message : String(e));
      setAuthState("locked");
      return false;
    } finally {
      setGateBusy(false);
    }
  }

  if (authState === "checking") {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Checking…
      </div>
    );
  }

  if (authState === "locked") {
    return <AdminGate onLogin={login} error={gateError} busy={gateBusy} />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        accounts={accounts}
        accountMode={accountMode}
        onSelect={setAccountMode}
        onChanged={refreshAccounts}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} variant="pill" className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-border px-6 pt-4 pb-3">
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <Button variant="ghost" size="sm" onClick={refreshAccounts} className="text-muted-foreground">
              Refresh
            </Button>
          </header>
          <div className="flex-1 overflow-auto p-6">
            <TabsContent value="studio" className="mt-0">
              <Studio
                accounts={accounts}
                accountMode={accountMode}
                setAccountMode={setAccountMode}
                onGenerated={refreshAccounts}
              />
            </TabsContent>
            <TabsContent value="history" className="mt-0">
              <HistoryTab accountMode={accountMode} />
            </TabsContent>
            <TabsContent value="voices" className="mt-0">
              <VoicesTab accountMode={accountMode} />
            </TabsContent>
            <TabsContent value="api-keys" className="mt-0">
              <ApiKeysTab />
            </TabsContent>
            <TabsContent value="usage" className="mt-0">
              <UsageTab />
            </TabsContent>
            <TabsContent value="health" className="mt-0">
              <HealthTab />
            </TabsContent>
            <TabsContent value="docs" className="mt-0">
              <DocsTab />
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}
