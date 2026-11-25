import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiGet, apiPost } from "./lib/api";
import { syncAndroidBars, syncAndroidWidgetData } from "./lib/android";
import { getMaxWeek, weekOfDate } from "./lib/schedule";
import type { AppSnapshot, LoginMode, SessionInfo, TabId, ThemeMode } from "./types/api";
import { AppShell } from "./components/layout/AppShell";
import { ToastStack, type ToastMessage } from "./components/ui/Primitives";
import { LoginModal } from "./components/modals/LoginModal";
import { DashboardPage } from "./pages/DashboardPage";
import { SchedulePage } from "./pages/SchedulePage";
import { GradesPage } from "./pages/GradesPage";
import { AcademicPage } from "./pages/AcademicPage";
import { RoomsPage } from "./pages/RoomsPage";
import { ExamsPage } from "./pages/ExamsPage";
import { NoticesPage } from "./pages/NoticesPage";
import { ServicesPage } from "./pages/ServicesPage";

declare global {
  interface Window {
    __PREFS?: Record<string, string>;
    __SUPERJLU__?: { version?: string };
  }
}

function getInitialTheme(): ThemeMode {
  try {
    const raw =
      window.__PREFS?.["jlu-theme"] || localStorage.getItem("jlu-theme") || "system";
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {}
  return "system";
}

function applyThemeToDom(mode: ThemeMode) {
  const prefersDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
  syncAndroidBars(mode, dark);
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [data, setData] = useState<AppSnapshot | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [networkMode, setNetworkMode] = useState<LoginMode>("direct");
  const [scheduleWeek, setScheduleWeek] = useState<number>(1);
  const [refreshing, setRefreshing] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [noticeTargetId, setNoticeTargetId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [bootError, setBootError] = useState("");

  const toast = useCallback(
    (text: string, tone: "info" | "success" | "error" = "info") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3800);
    },
    [],
  );

  // Sync theme
  useEffect(() => {
    applyThemeToDom(theme);
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const listener = () => {
      if (theme === "system") applyThemeToDom("system");
    };
    mq?.addEventListener?.("change", listener);
    return () => mq?.removeEventListener?.("change", listener);
  }, [theme]);

  function handleChangeTheme(next: ThemeMode) {
    setTheme(next);
    try {
      localStorage.setItem("jlu-theme", next);
    } catch {}
    apiPost("/api/prefs", { set: { "jlu-theme": next } }).catch(() => {});
  }

  const loadSnapshot = useCallback(async (initWeek = false) => {
    try {
      const [snap, sess, net] = await Promise.all([
        apiGet<AppSnapshot>("/api/data"),
        apiGet<SessionInfo>("/api/session"),
        apiGet<{ mode: LoginMode }>("/api/network/state").catch(() => ({
          mode: "direct" as LoginMode,
        })),
      ]);
      setData(snap);
      setSession(sess);
      if (net.mode) setNetworkMode(net.mode);
      if (initWeek) {
        const cap = getMaxWeek(
          snap.courses || [],
          snap.calendar?.total_weeks,
          snap.exams,
          snap.first_monday,
        );
        setScheduleWeek(Math.min(Math.max(1, weekOfDate(snap.first_monday, new Date())), cap));
      }
      setBootError("");
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "加载本地数据失败");
    }
  }, []);

  useEffect(() => {
    void loadSnapshot(true);
  }, [loadSnapshot]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  useEffect(() => {
    if (data) syncAndroidWidgetData(data);
  }, [data]);

  async function handleRefreshAll() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const next = await apiPost<AppSnapshot>("/api/refresh", {});
      setData(next);
      const sess = await apiGet<SessionInfo>("/api/session").catch(() => null);
      if (sess) setSession(sess);
      toast("教务数据刷新完成", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "刷新失败", "error");
    } finally {
      setRefreshing(false);
    }
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--text)] p-6">
        <div className="surface-card p-8 max-w-sm w-full text-center space-y-3">
          {bootError ? (
            <>
              <div className="text-sm font-bold text-rose-600">启动加载失败</div>
              <p className="text-xs text-[var(--text-muted)]">{bootError}</p>
              <button
                type="button"
                onClick={() => loadSnapshot(true)}
                className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold"
              >
                重试
              </button>
            </>
          ) : (
            <>
              <Loader2 className="w-7 h-7 animate-spin text-[var(--accent)] mx-auto" />
              <div className="text-sm font-semibold">正在启动 SuperJLU Studio...</div>
              <p className="text-xs text-[var(--text-muted)]">正在读取本地加密缓存与配置</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <AppShell
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        theme={theme}
        onChangeTheme={handleChangeTheme}
        refreshing={refreshing}
        onRefresh={handleRefreshAll}
        session={session}
        networkMode={networkMode}
        updatedAt={data.updated}
        onOpenLogin={() => setLoginOpen(true)}
      >
        {activeTab === "dashboard" && (
          <DashboardPage
            data={data}
            onNavigate={setActiveTab}
            onOpenNotice={(id) => {
              setNoticeTargetId(id);
              setActiveTab("notices");
            }}
            onOpenScheduleWeek={(wk) => {
              setScheduleWeek(wk);
              setActiveTab("schedule");
            }}
          />
        )}

        {activeTab === "schedule" && (
          <SchedulePage
            data={data}
            week={scheduleWeek}
            onChangeWeek={setScheduleWeek}
            onSnapshotUpdate={setData}
            onOpenExams={() => setActiveTab("exams")}
            toast={toast}
          />
        )}

        {activeTab === "grades" && (
          <GradesPage data={data} onSnapshotUpdate={setData} toast={toast} />
        )}

        {activeTab === "academic" && (
          <AcademicPage data={data} onSnapshotUpdate={setData} toast={toast} />
        )}

        {activeTab === "rooms" && <RoomsPage data={data} toast={toast} />}

        {activeTab === "exams" && (
          <ExamsPage
            data={data}
            onSnapshotUpdate={setData}
            onOpenScheduleWeek={(wk) => {
              setScheduleWeek(wk);
              setActiveTab("schedule");
            }}
            toast={toast}
          />
        )}

        {activeTab === "notices" && (
          <NoticesPage
            data={data}
            initialNoticeId={noticeTargetId}
            onClearInitialNotice={() => setNoticeTargetId(null)}
            toast={toast}
          />
        )}

        {activeTab === "services" && (
          <ServicesPage
            data={data}
            theme={theme}
            onChangeTheme={handleChangeTheme}
            networkMode={networkMode}
            onChangeNetworkMode={setNetworkMode}
            onSnapshotUpdate={setData}
            onOpenLogin={() => setLoginOpen(true)}
            onNavigate={setActiveTab}
            toast={toast}
          />
        )}
      </AppShell>

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        mode={networkMode}
        onChangeMode={setNetworkMode}
        onSuccess={async () => {
          await loadSnapshot(true);
          void handleRefreshAll();
        }}
        toast={toast}
      />

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </>
  );
}

export default App;
