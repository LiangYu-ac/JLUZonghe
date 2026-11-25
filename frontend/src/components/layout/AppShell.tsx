import React, { useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  BarChart3,
  GraduationCap,
  DoorOpen,
  Clock3,
  Bell,
  Compass,
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  Wifi,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  LogIn,
} from "lucide-react";
import type { TabId, ThemeMode, SessionInfo, LoginMode } from "../../types/api";
import { cn } from "../../lib/utils";

export const NAV_ITEMS: { id: TabId; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: "今日总览", shortLabel: "总览", icon: LayoutDashboard },
  { id: "schedule", label: "我的课表", shortLabel: "课表", icon: CalendarDays },
  { id: "grades", label: "成绩与绩点", shortLabel: "成绩", icon: BarChart3 },
  { id: "academic", label: "学业进度", shortLabel: "学业", icon: GraduationCap },
  { id: "rooms", label: "空教室", shortLabel: "教室", icon: DoorOpen },
  { id: "exams", label: "考试安排", shortLabel: "考试", icon: Clock3 },
  { id: "notices", label: "校园通知", shortLabel: "通知", icon: Bell },
  { id: "services", label: "服务与设置", shortLabel: "更多", icon: Compass },
];

export function AppShell({
  activeTab,
  onSelectTab,
  theme,
  onChangeTheme,
  refreshing,
  onRefresh,
  session,
  networkMode,
  updatedAt,
  hasUpdate,
  onOpenLogin,
  children,
}: {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  theme: ThemeMode;
  onChangeTheme: (t: ThemeMode) => void;
  refreshing: boolean;
  onRefresh: () => void;
  session: SessionInfo | null;
  networkMode: LoginMode;
  updatedAt: string | null;
  hasUpdate?: boolean;
  onOpenLogin: () => void;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const currentMeta = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen flex bg-[var(--bg)] text-[var(--text)]">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col shrink-0 border-r bg-[var(--surface)] transition-all duration-200 sticky top-0 h-screen z-30",
          collapsed ? "w-[74px]" : "w-[236px]",
        )}
      >
        {/* Brand Header */}
        <div className="h-[60px] flex items-center justify-between px-4 border-b">
          <button
            type="button"
            onClick={() => onSelectTab("dashboard")}
            className="flex items-center gap-2.5 min-w-0 text-left group"
          >
            <img
              src="/favicon.svg"
              alt="吉大综合"
              className="w-8 h-8 rounded-xl shrink-0 shadow-sm"
            />
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-[15px] font-bold tracking-tight leading-tight truncate">
                  吉大综合
                </div>
                <div className="text-[11px] text-[var(--text-muted)] leading-tight truncate">
                  吉林大学校园助手
                </div>
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                data-nav={item.id}
                onClick={() => onSelectTab(item.id)}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all relative",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)] font-semibold"
                    : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-slate-100/80 dark:hover:bg-slate-800/60",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {item.id === "services" && hasUpdate && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 ml-auto shrink-0" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Status Card */}
        <div className="p-3 border-t">
          {!collapsed ? (
            <button
              type="button"
              onClick={onOpenLogin}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--border-strong)] transition-colors text-left"
            >
              <span
                className={cn(
                  "w-2.5 h-2.5 rounded-full shrink-0",
                  session?.state === "ok" ? "bg-emerald-500" : "bg-rose-500",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold truncate">
                  {session?.state === "ok"
                    ? "教务会话已连接"
                    : session?.state === "expired"
                      ? "会话已过期 · 点此重登"
                      : "未登录 · 点击登录"}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] truncate">
                  {networkMode === "webvpn" ? "校外 WebVPN 通道" : "校园网直连通道"}
                </div>
              </div>
              <LogIn className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenLogin}
              title="账号与登录"
              className="w-full flex items-center justify-center py-2 rounded-xl border bg-[var(--surface-2)]"
            >
              <span
                className={cn(
                  "w-2.5 h-2.5 rounded-full",
                  session?.state === "ok" ? "bg-emerald-500" : "bg-rose-500",
                )}
              />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 h-[60px] border-b surface-glass px-4 md:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/favicon.svg"
              alt="吉大综合"
              className="w-7 h-7 rounded-lg md:hidden shadow-sm"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] md:text-base font-bold tracking-tight truncate">
                  {currentMeta.label}
                </h1>
                {session?.offline && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <ShieldCheck className="w-3 h-3" />
                    本机离线缓存
                  </span>
                )}
              </div>
              {updatedAt && (
                <p className="text-[11px] text-[var(--text-muted)] hidden sm:block tabular-nums">
                  数据同步于 {updatedAt.replace("T", " ")}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Network Channel Pill */}
            <button
              type="button"
              onClick={() => onSelectTab("services")}
              className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] bg-[var(--surface)] transition-colors"
              title="查看校园网连接状态与通道设置"
            >
              <Wifi className="w-3.5 h-3.5 text-[var(--ok)]" />
              {networkMode === "webvpn" ? "校外 WebVPN" : "校园网直连"}
            </button>

            {/* Theme Switcher */}
            <div
              className="inline-flex items-center p-0.5 rounded-xl border bg-[var(--surface)]"
              role="group"
              aria-label="外观主题"
            >
              {(
                [
                  { id: "system", icon: Monitor, title: "跟随系统" },
                  { id: "light", icon: Sun, title: "浅色外观" },
                  { id: "dark", icon: Moon, title: "深色外观" },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const on = theme === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeTheme(item.id)}
                    title={item.title}
                    aria-label={item.title}
                    aria-pressed={on}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      on
                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text)]",
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-60"
              title="从教务同步课表、成绩、考试、校历与学业"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
              <span className="hidden sm:inline">{refreshing ? "同步中..." : "刷新同步"}</span>
            </button>
          </div>
        </header>

        {/* Session Warning Banner (expired/missing) */}
        {session && session.state !== "ok" && activeTab !== "services" && (
          <div className="mx-4 md:mx-6 mt-4 px-4 py-2.5 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/30 flex items-center justify-between gap-3 text-xs">
            <div className="text-amber-900 dark:text-amber-200">
              <span className="font-semibold">
                {session.state === "expired" ? "教务登录已过期" : "尚未登录吉大统一身份认证"}
              </span>
              <span className="opacity-85 ml-2">
                {session.offline
                  ? "当前可离线查看本地缓存；刷新教务、查询空教室或校内 OA 需重新登录。"
                  : "登录后即可同步你的个人课表、成绩、考试安排与学业进度。"}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onOpenLogin}
                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors"
              >
                {session.state === "expired" ? "重新登录" : "立即登录"}
              </button>
            </div>
          </div>
        )}

        {/* Page Body */}
        <main className="flex-1 p-4 md:p-6 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation (5 ergonomic primary tabs; 学业/教室/通知 in 更多) */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t surface-glass px-1 py-1.5 pb-[env(safe-area-inset-bottom)] flex items-center justify-around"
        aria-label="移动导航"
      >
        {(
          ["dashboard", "schedule", "grades", "exams", "services"] as const
        ).map((id) => {
          const item = NAV_ITEMS.find((n) => n.id === id)!;
          const Icon = item.icon;
          const active =
            id === "services"
              ? ["services", "academic", "rooms", "notices"].includes(activeTab)
              : activeTab === id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-1 rounded-xl text-[11px] font-medium transition-colors",
                active ? "text-[var(--accent)] font-semibold" : "text-[var(--text-muted)]",
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
