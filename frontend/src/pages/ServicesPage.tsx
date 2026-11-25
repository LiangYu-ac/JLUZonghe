import React, { useEffect, useState } from "react";
import {
  Activity,
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  Globe,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sun,
  Moon,
  Monitor,
  Wifi,
  XCircle,
  Smartphone,
  BellRing,
  GraduationCap,
  DoorOpen,
  Bell,
  Clock3,
  BatteryCharging,
  Pin,
} from "lucide-react";
import { apiGet, apiPost } from "../lib/api";
import { exportIcsOnDevice, isAndroidApp } from "../lib/android";
import { weekOfDate } from "../lib/schedule";
import type {
  AppSnapshot,
  CampusLink,
  LoginMode,
  NetworkCheckReport,
  NetworkState,
  SiteSessionStatus,
  TabId,
  ThemeMode,
} from "../types/api";
import { StatusChip } from "../components/ui/Primitives";
import { cn } from "../lib/utils";

export function ServicesPage({
  data,
  theme,
  onChangeTheme,
  networkMode,
  onChangeNetworkMode,
  onSnapshotUpdate,
  onOpenLogin,
  onNavigate,
  toast,
}: {
  data: AppSnapshot;
  theme: ThemeMode;
  onChangeTheme: (t: ThemeMode) => void;
  networkMode: LoginMode;
  onChangeNetworkMode: (m: LoginMode) => void;
  onSnapshotUpdate: (next: AppSnapshot) => void;
  onOpenLogin: () => void;
  onNavigate?: (tab: TabId) => void;
  toast: (msg: string, tone?: "info" | "success" | "error") => void;
}) {
  const [links, setLinks] = useState<CampusLink[]>([]);
  const [sites, setSites] = useState<Record<string, SiteSessionStatus>>({});
  const [netState, setNetState] = useState<NetworkState | null>(null);
  const [checkingSession, setCheckingSession] = useState(false);

  const [probeLoading, setProbeLoading] = useState(false);
  const [probeReport, setProbeReport] = useState<NetworkCheckReport | null>(null);

  const [firstMonday, setFirstMonday] = useState(data.first_monday || "");
  const [updateInfo, setUpdateInfo] = useState<{
    current?: string;
    latest?: string;
    has_update?: boolean;
    url?: string;
    unavailable?: boolean;
  } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const inAndroid = isAndroidApp();
  const [lockNotify, setLockNotify] = useState(() => {
    try {
      return Boolean(window.SuperJLU?.lockNotifyEnabled?.());
    } catch {
      return false;
    }
  });
  const canPinWidget = (() => {
    try {
      return Boolean(window.SuperJLU?.canPinWidget?.());
    } catch {
      return false;
    }
  })();
  const androidBrand = (() => {
    try {
      return window.SuperJLU?.brandLabel?.() || "当前手机";
    } catch {
      return "当前手机";
    }
  })();
  const androidBgHint = (() => {
    try {
      return window.SuperJLU?.backgroundHint?.() || "";
    } catch {
      return "";
    }
  })();
  const androidApkVersion = (() => {
    try {
      return window.SuperJLU?.appVersion?.() || "";
    } catch {
      return "";
    }
  })();

  useEffect(() => {
    setFirstMonday(data.first_monday || "");
  }, [data.first_monday]);

  async function loadAll() {
    try {
      const [lk, ss, ns, up] = await Promise.all([
        apiGet<{ links: CampusLink[]; route?: LoginMode }>("/api/links"),
        apiGet<{ sites: SiteSessionStatus[] }>("/api/sessions"),
        apiGet<NetworkState>("/api/network/state"),
        apiGet<{ current?: string }>("/api/update?local=1"),
      ]);
      setLinks(lk.links || []);
      const map: Record<string, SiteSessionStatus> = {};
      (ss.sites || []).forEach((s) => {
        if (s.id) map[s.id] = s;
      });
      setSites(map);
      setNetState(ns);
      if (ns.mode) onChangeNetworkMode(ns.mode);
      setUpdateInfo((prev) => ({ ...prev, ...up }));
    } catch {}
  }

  useEffect(() => {
    void loadAll();
  }, [data.updated]);

  async function handleVerifySession() {
    setCheckingSession(true);
    try {
      const res = await apiPost<{ site: SiteSessionStatus }>("/api/sessions/check", {
        site: "jwxt",
      });
      await loadAll();
      toast(
        res.site.state === "ok"
          ? "应用内教务会话验证通过"
          : res.site.message || "会话暂未验证通过",
        res.site.state === "ok" ? "success" : "info",
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "验证失败", "error");
    } finally {
      setCheckingSession(false);
    }
  }

  async function handleProbeNetwork() {
    setProbeLoading(true);
    try {
      const rep = await apiPost<NetworkCheckReport>("/api/network/check", {});
      setProbeReport(rep);
    } catch (err) {
      toast(err instanceof Error ? err.message : "检测失败", "error");
    } finally {
      setProbeLoading(false);
    }
  }

  async function handleSaveFirstMonday(val: string) {
    try {
      const next = await apiPost<AppSnapshot>("/api/settings", { first_monday: val });
      onSnapshotUpdate(next);
      toast(val ? "已覆盖第一周起始日" : "已恢复教务校历日期", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存失败", "error");
    }
  }

  async function handleCheckUpdate() {
    setCheckingUpdate(true);
    try {
      const res = await apiGet<{
        current?: string;
        latest?: string;
        has_update?: boolean;
        url?: string;
        unavailable?: boolean;
      }>("/api/update?force=1");
      setUpdateInfo(res);
      if (res.has_update) {
        toast(`发现新版本 v${res.latest}`, "success");
      } else if (res.unavailable) {
        toast("暂时无法连接 GitHub 查询最新版本", "info");
      } else {
        toast("当前已是最新版本", "success");
      }
    } catch {
      toast("检查更新失败", "error");
    } finally {
      setCheckingUpdate(false);
    }
  }

  const currentWeek = data.first_monday ? weekOfDate(data.first_monday, new Date()) : 1;

  return (
    <div className="space-y-5 animate-in">
      {/* Mobile Quick Navigation Tiles */}
      {onNavigate && (
        <div className="md:hidden surface-card p-4 space-y-2.5">
          <div className="text-xs font-bold text-[var(--text-muted)]">全部功能模块</div>
          <div className="grid grid-cols-2 gap-2.5">
            {(
              [
                { id: "academic", label: "学业进度", desc: "培养方案完成度", icon: GraduationCap },
                { id: "rooms", label: "空教室", desc: "全天 12 节查询", icon: DoorOpen },
                { id: "notices", label: "校园通知", desc: "OA 与关键词订阅", icon: Bell },
                { id: "exams", label: "考试安排", desc: "考场与倒计时", icon: Clock3 },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className="flex items-center gap-2.5 p-3 rounded-xl border bg-[var(--surface-2)] text-left hover:border-[var(--accent)] transition-colors"
                >
                  <span className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{item.label}</div>
                    <div className="text-[10.5px] text-[var(--text-muted)] truncate">{item.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Campus Services Grid */}
      <div className="surface-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold">校园服务直达</h2>
            <p className="text-xs text-[var(--text-muted)]">
              支持统一身份认证免登跳转与校外 WebVPN 自动路由
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadAll}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-medium hover:bg-[var(--surface-2)]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              刷新状态
            </button>
            <button
              type="button"
              disabled={checkingSession}
              onClick={handleVerifySession}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold"
            >
              {checkingSession && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              验证教务会话
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {links.map((lk) => {
            const st = sites[lk.id];
            const useVpn = Boolean(lk.vpn_url && networkMode === "webvpn");
            const primaryUrl = useVpn ? lk.vpn_sso_url || lk.vpn_url! : lk.sso_url || lk.url;
            const altUrl = useVpn ? lk.sso_url || lk.url : lk.vpn_sso_url || lk.vpn_url;
            return (
              <div
                key={lk.id}
                className="p-4 rounded-xl border bg-[var(--surface-2)] flex flex-col justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{lk.name}</span>
                    {st && !["xsxk", "lib", "ilearn"].includes(lk.id) && (
                      <StatusChip
                        tone={
                          st.state === "ok"
                            ? "ok"
                            : st.state === "expired"
                              ? "bad"
                              : "neutral"
                        }
                      >
                        {st.state === "ok"
                          ? "已连接"
                          : st.state === "expired"
                            ? "已过期"
                            : "未登录"}
                      </StatusChip>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {lk.purpose}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={primaryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors"
                  >
                    {useVpn ? "经 WebVPN 打开" : "立即访问"}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {altUrl && (
                    <a
                      href={altUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-[var(--surface)]"
                    >
                      {useVpn ? "直连" : "WebVPN"}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Account & Network Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 surface-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-sm font-bold">账号与网络通道</h3>
            </div>
            <StatusChip tone={networkMode === "webvpn" ? "accent" : "ok"}>
              当前：{networkMode === "webvpn" ? "校外 WebVPN" : "校园网直连"}
            </StatusChip>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl border bg-[var(--surface-2)]">
            <button
              type="button"
              onClick={async () => {
                onChangeNetworkMode("direct");
                try {
                  await apiPost("/api/network/direct", {});
                  toast("已切换为校园网直连模式");
                } catch {}
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold",
                networkMode === "direct"
                  ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm"
                  : "text-[var(--text-muted)]",
              )}
            >
              <Wifi className="w-3.5 h-3.5" />
              校园网直连
            </button>
            <button
              type="button"
              onClick={() => onChangeNetworkMode("webvpn")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold",
                networkMode === "webvpn"
                  ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm"
                  : "text-[var(--text-muted)]",
              )}
            >
              <Globe className="w-3.5 h-3.5" />
              校外 WebVPN
            </button>
          </div>

          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            {netState?.note ||
              "在学校连校园网时选择直连；在家或使用移动热点时选择校外 WebVPN 后登录同步。"}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenLogin}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)]"
            >
              登录 / 切换账号
            </button>
            <button
              type="button"
              disabled={probeLoading}
              onClick={handleProbeNetwork}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border bg-[var(--surface-2)] text-xs font-medium"
            >
              {probeLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Activity className="w-3.5 h-3.5" />
              )}
              检测校园网连通性
            </button>
          </div>

          {probeReport && (
            <div className="space-y-2 pt-2 border-t text-xs">
              <div className="text-[11px] text-[var(--text-muted)]">
                检测于 {probeReport.checked_at.replace("T", " ")}
              </div>
              <div className="space-y-1.5">
                {probeReport.services.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface-2)] border"
                  >
                    <div>
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-[11px] text-[var(--text-muted)] ml-2">
                        {s.host}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 tabular-nums">
                      {s.reachable ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {s.milliseconds} ms
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-500 font-semibold">
                          <XCircle className="w-3.5 h-3.5" />
                          未连通
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {(probeReport.hint || probeReport.route_hint) && (
                <p className="text-amber-700 dark:text-amber-300 leading-relaxed">
                  {probeReport.hint || probeReport.route_hint}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Preferences & About */}
        <div className="lg:col-span-6 space-y-5">
          <div className="surface-card p-5 space-y-4">
            <h3 className="text-sm font-bold">软件偏好与校历设置</h3>

            {/* Theme */}
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">界面外观</span>
              <div className="inline-flex p-0.5 rounded-xl border bg-[var(--surface-2)]">
                {(
                  [
                    { id: "system", label: "跟随系统", icon: Monitor },
                    { id: "light", label: "浅色", icon: Sun },
                    { id: "dark", label: "深色", icon: Moon },
                  ] as const
                ).map((t) => {
                  const Icon = t.icon;
                  const on = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onChangeTheme(t.id)}
                      className={cn(
                        "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium",
                        on
                          ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm"
                          : "text-[var(--text-muted)]",
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* First Monday */}
            <div className="space-y-2 pt-2 border-t text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[var(--accent)]" />
                  开学第 1 周周一
                </span>
                <span className="text-[var(--text-muted)] tabular-nums">
                  {data.calendar?.term || ""} · 当前第 {currentWeek} 周
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={firstMonday}
                  onChange={(e) => setFirstMonday(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border bg-[var(--surface-2)]"
                />
                <button
                  type="button"
                  onClick={() => handleSaveFirstMonday(firstMonday)}
                  className="px-3 py-1.5 rounded-xl bg-[var(--accent)] text-white font-semibold"
                >
                  保存覆盖
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveFirstMonday("")}
                  className="px-3 py-1.5 rounded-xl border hover:bg-[var(--surface-2)]"
                >
                  恢复校历
                </button>
              </div>
            </div>

            {/* Export iCal */}
            <div className="flex items-center justify-between pt-2 border-t text-xs">
              <div>
                <div className="font-semibold">导出手机/电脑日历 (.ics)</div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  包含全部教学周排课、考试安排及考前/课前提醒
                </div>
              </div>
              <a
                href="/api/ics"
                download="jlu-schedule.ics"
                onClick={(e) => {
                  if (inAndroid) {
                    e.preventDefault();
                    void exportIcsOnDevice("/api/ics", "jlu-schedule.ics").catch((err) =>
                      toast(err instanceof Error ? err.message : "导出失败", "error"),
                    );
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-[var(--surface-2)] font-semibold hover:border-[var(--accent)]"
              >
                <Download className="w-3.5 h-3.5" />
                导出日历
              </a>
            </div>
          </div>

          {/* Android Native Widgets & System Integration */}
          {inAndroid && (
            <div className="surface-card p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[var(--accent)]" />
                  <h3 className="text-sm font-bold">安卓桌面小组件与系统设置</h3>
                </div>
                <StatusChip tone="accent">{androidBrand}</StatusChip>
              </div>

              <div className="space-y-2">
                <div className="font-semibold flex items-center gap-1.5">
                  <Pin className="w-3.5 h-3.5 text-[var(--accent)]" />
                  桌面小组件（实时同步课表与考试）
                </div>
                {canPinWidget ? (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { kind: 0, label: "今日课表" },
                      { kind: 1, label: "本周课表" },
                      { kind: 2, label: "下节倒计时" },
                    ].map((w) => (
                      <button
                        key={w.kind}
                        type="button"
                        onClick={() => window.SuperJLU?.pinWidget?.(w.kind)}
                        className="px-2.5 py-2 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--accent)] font-medium text-center transition-colors"
                      >
                        添加到桌面 · {w.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    请长按手机桌面空白处 → 添加小组件，搜索「吉大综合」即可添加今日课表、本周课表与下节倒计时组件。
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-2)] border">
                <div>
                  <div className="font-semibold flex items-center gap-1.5">
                    <BellRing className="w-3.5 h-3.5 text-emerald-500" />
                    锁屏与通知栏下节课提醒
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    在通知栏常驻显示下一节课程/考试地点与时间
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !lockNotify;
                    setLockNotify(next);
                    try {
                      window.SuperJLU?.setLockNotify?.(next);
                    } catch {}
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-semibold transition-colors",
                    lockNotify ? "bg-[var(--accent)] text-white" : "border bg-[var(--surface)]",
                  )}
                >
                  {lockNotify ? "已开启" : "已关闭"}
                </button>
              </div>

              {androidBgHint && (
                <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
                  <div className="font-semibold flex items-center gap-1 mb-1">
                    <BatteryCharging className="w-3.5 h-3.5" />
                    后台刷新建议
                  </div>
                  {androidBgHint}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => window.SuperJLU?.requestBatteryExemption?.()}
                  className="px-3 py-1.5 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--border-strong)] font-medium"
                >
                  申请忽略电池优化
                </button>
                <button
                  type="button"
                  onClick={() => window.SuperJLU?.openAutostartSettings?.()}
                  className="px-3 py-1.5 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--border-strong)] font-medium"
                >
                  打开自启动设置
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = "superjlu://browser-settings";
                  }}
                  className="px-3 py-1.5 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--border-strong)] font-medium"
                >
                  设置外部链接打开方式
                </button>
              </div>
            </div>
          )}

          <div className="surface-card p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span className="font-bold text-sm">
                  吉大综合 v{androidApkVersion || updateInfo?.current || "1.3.4"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {updateInfo?.has_update && updateInfo.url && (
                  <a
                    href={updateInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white font-semibold"
                  >
                    前往下载 v{updateInfo.latest}
                  </a>
                )}
                <button
                  type="button"
                  disabled={checkingUpdate}
                  onClick={handleCheckUpdate}
                  className="px-3 py-1.5 rounded-lg border bg-[var(--surface-2)] font-medium"
                >
                  {checkingUpdate ? "检查中..." : "检查更新"}
                </button>
              </div>
            </div>
            <p className="text-[var(--text-muted)] leading-relaxed">
              所有教务数据与登录会话均加密保存在您的本机设备上，不经过任何第三方服务器。
              基于 MIT 开源项目 <code className="px-1 py-0.5 rounded bg-[var(--surface-2)]">Runa-Asahi/SuperJLU</code>（及镜像维护仓库 <code className="px-1 py-0.5 rounded bg-[var(--surface-2)]">Aohpup/SuperJLU</code>）核心后端构建。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
