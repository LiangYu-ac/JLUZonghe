import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Globe,
  KeyRound,
  Loader2,
  RefreshCw,
  Shield,
  Trash2,
  Wifi,
  XCircle,
} from "lucide-react";
import { apiDelete, apiGet, apiPost, ApiError } from "../../lib/api";
import type { LoginMode, NetworkCheckReport } from "../../types/api";
import { Modal } from "../ui/Primitives";
import { cn } from "../../lib/utils";

type LoginStepState = "idle" | "sending_code" | "need_second_factor" | "code_sent";
type RawAccountItem = string | { username?: string };

export function LoginModal({
  open,
  onClose,
  mode,
  onChangeMode,
  onSuccess,
  toast,
}: {
  open: boolean;
  onClose: () => void;
  mode: LoginMode;
  onChangeMode: (m: LoginMode) => void;
  onSuccess: () => Promise<void> | void;
  toast: (msg: string, tone?: "info" | "success" | "error") => void;
}) {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [step, setStep] = useState<LoginStepState>("idle");
  const [wechatCode, setWechatCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [vpnHint, setVpnHint] = useState(false);
  const [directHint, setDirectHint] = useState(false);
  const [canConnectVpn, setCanConnectVpn] = useState(false);
  const [activeRoute, setActiveRoute] = useState<LoginMode>(mode);

  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<NetworkCheckReport | null>(null);
  const [deviceHint, setDeviceHint] = useState("");
  const userTouchedRouteRef = useRef(false);
  const probeAbortRef = useRef<AbortController | null>(null);

  const prefix = activeRoute === "webvpn" ? "/api/vpn/login" : "/api/login";

  useEffect(() => {
    setActiveRoute(mode);
  }, [mode]);

  async function runNetworkProbe(applyRecommendation: boolean) {
    probeAbortRef.current?.abort();
    const ctrl = new AbortController();
    probeAbortRef.current = ctrl;
    setProbing(true);
    try {
      const rep = await apiPost<NetworkCheckReport>("/api/network/check", {}, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setProbe(rep);
      if (
        applyRecommendation &&
        !userTouchedRouteRef.current &&
        (rep.recommended_route === "direct" || rep.recommended_route === "webvpn")
      ) {
        setActiveRoute(rep.recommended_route);
        onChangeMode(rep.recommended_route);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      if (!ctrl.signal.aborted) setProbing(false);
    }
  }

  useEffect(() => {
    if (!open) {
      probeAbortRef.current?.abort();
      return;
    }
    userTouchedRouteRef.current = false;
    setError("");
    setVpnHint(false);
    setDirectHint(false);
    setCanConnectVpn(false);
    setWechatCode("");
    setStep("idle");
    setProbe(null);
    setDeviceHint("");

    apiGet<{ saved_username?: string; accounts?: RawAccountItem[] }>("/api/login")
      .then((res) => {
        const normalized = (res.accounts || [])
          .map((a) => (typeof a === "string" ? a : a?.username || ""))
          .filter(Boolean);
        setAccounts(normalized);
        if (!username && res.saved_username) {
          setUsername(res.saved_username);
        }
      })
      .catch(() => {});

    apiGet<{ direct_hint?: string }>("/api/network/device")
      .then((res) => setDeviceHint(res.direct_hint || ""))
      .catch(() => {});

    void runNetworkProbe(true);

    return () => {
      probeAbortRef.current?.abort();
    };
  }, [open]);

  async function triggerSendCode(targetPrefix: string) {
    setBusy(true);
    setError("");
    setCanConnectVpn(false);
    setStep("sending_code");
    try {
      const res = await apiPost<{ step: string; error?: string }>(
        `${targetPrefix}/send_code`,
        {},
      );
      if (res.step === "code_sent") {
        setStep("code_sent");
      } else {
        setStep("need_second_factor");
        if (res.error) setError(res.error);
      }
    } catch (e) {
      setStep("need_second_factor");
      setError(e instanceof Error ? e.message : "发送验证码失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleStart(e: React.FormEvent, routeOverride?: LoginMode) {
    e.preventDefault();
    const useRoute = routeOverride || activeRoute;
    const pfx = useRoute === "webvpn" ? "/api/vpn/login" : "/api/login";
    if (routeOverride) {
      userTouchedRouteRef.current = true;
      setActiveRoute(routeOverride);
      onChangeMode(routeOverride);
    }
    setBusy(true);
    setError("");
    setVpnHint(false);
    setDirectHint(false);
    setCanConnectVpn(false);
    try {
      const res = await apiPost<{ step: string }>(`${pfx}/start`, {
        username: username.trim(),
        password,
        remember,
      });
      if (res.step === "success") {
        toast("登录成功，正在后台同步教务数据", "success");
        onClose();
        void onSuccess();
        return;
      }
      if (res.step === "need_second_factor") {
        await triggerSendCode(pfx);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.vpnHint) setVpnHint(true);
        if (err.directHint) setDirectHint(true);
      }
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!wechatCode.trim()) {
      setError("请输入「智慧吉大」收到的 6 位微信验证码");
      return;
    }
    setBusy(true);
    setError("");
    setCanConnectVpn(false);
    try {
      const res = await apiPost<{ step: string; error?: string }>(`${prefix}/verify`, {
        wechat_code: wechatCode.trim(),
      });
      if (res.step === "success") {
        toast("二次验证通过，正在后台同步教务数据", "success");
        onClose();
        void onSuccess();
        return;
      }
      setError(res.error || "微信验证码不正确或已过期");
    } catch (err) {
      if (err instanceof ApiError && err.canConnectVpn) {
        setCanConnectVpn(true);
      }
      setError(err instanceof Error ? err.message : "验证失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleConnectVpnContinue() {
    setBusy(true);
    setError("");
    try {
      await apiPost("/api/network/vpn", {});
      onChangeMode("webvpn");
      setActiveRoute("webvpn");
      toast("已切换至应用内 WebVPN 并完成登录", "success");
      onClose();
      void onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "WebVPN 连接失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (step !== "idle") {
      try {
        await apiPost(`${prefix}/cancel`, {});
      } catch {}
    }
    onClose();
  }

  async function handleBackToPassword() {
    try {
      await apiPost(`${prefix}/cancel`, {});
    } catch {}
    setStep("idle");
    setError("");
    setWechatCode("");
    setCanConnectVpn(false);
  }

  async function handleDeleteAccount(u: string) {
    try {
      const res = await apiDelete<{ accounts: RawAccountItem[] }>(
        `/api/login/accounts/${encodeURIComponent(u)}`,
      );
      const normalized = (res.accounts || [])
        .map((a) => (typeof a === "string" ? a : a?.username || ""))
        .filter(Boolean);
      setAccounts(normalized);
      if (username === u) setUsername("");
      toast(`已移除保存的账号 ${u}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "删除失败", "error");
    }
  }

  const probeTargets = (probe?.services || []).filter((s) =>
    ["cas", "jwxt", "vpn"].includes(s.id),
  );
  const casService = probeTargets.find((s) => s.id === "cas");
  const vpnService = probeTargets.find((s) => s.id === "vpn");
  const routeMismatchVpn =
    activeRoute === "webvpn" && vpnService && !vpnService.reachable;

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      title="登录吉大统一身份认证"
      subtitle="仅在本地与学校服务器直连通信，凭据加密存放在系统钥匙串中"
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        {/* Route Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl border bg-[var(--surface-2)]">
          <button
            type="button"
            disabled={step !== "idle"}
            onClick={() => {
              userTouchedRouteRef.current = true;
              setActiveRoute("direct");
              onChangeMode("direct");
              setDirectHint(false);
            }}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-60",
              activeRoute === "direct"
                ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            <Wifi className="w-3.5 h-3.5" />
            校园网直连
          </button>
          <button
            type="button"
            disabled={step !== "idle"}
            onClick={() => {
              userTouchedRouteRef.current = true;
              setActiveRoute("webvpn");
              onChangeMode("webvpn");
              setVpnHint(false);
            }}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-60",
              activeRoute === "webvpn"
                ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            <Globe className="w-3.5 h-3.5" />
            校外 WebVPN
          </button>
        </div>

        {/* Live Connectivity Indicator */}
        {step === "idle" && (
          <div className="p-2.5 rounded-xl border bg-[var(--surface-2)] space-y-2 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {probing && !probe ? (
                  <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    正在检测校园网络连通性...
                  </span>
                ) : (
                  probeTargets.map((s) => (
                    <span
                      key={s.id}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-[var(--surface)] tabular-nums",
                        s.reachable
                          ? "text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60"
                          : "text-rose-600 dark:text-rose-300 border-rose-200 dark:border-rose-800/60",
                      )}
                      title={s.error || `${s.host} ${s.milliseconds}ms`}
                    >
                      {s.reachable ? (
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                      ) : (
                        <XCircle className="w-3 h-3 shrink-0" />
                      )}
                      <span>
                        {s.id === "cas"
                          ? "统一认证"
                          : s.id === "jwxt"
                            ? "教务直连"
                            : "WebVPN"}
                      </span>
                      <span className="opacity-75">
                        {s.reachable ? `${s.milliseconds}ms` : "未连通"}
                      </span>
                    </span>
                  ))
                )}
              </div>
              <button
                type="button"
                disabled={probing}
                onClick={() => runNetworkProbe(false)}
                className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text)] shrink-0"
                title="重新检测网络连通性"
              >
                <RefreshCw className={cn("w-3 h-3", probing && "animate-spin")} />
                重测
              </button>
            </div>

            {probe?.route_hint && (
              <div
                className={cn(
                  "flex items-start gap-1.5 leading-relaxed",
                  casService && !casService.reachable
                    ? "text-rose-600 dark:text-rose-300"
                    : routeMismatchVpn
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-[var(--text-muted)]",
                )}
              >
                <Activity className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{probe.route_hint}</span>
              </div>
            )}

            {activeRoute === "direct" && deviceHint && (
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 leading-relaxed">
                {deviceHint}
              </div>
            )}
          </div>
        )}

        {step === "idle" ? (
          <form onSubmit={handleStart} className="space-y-3.5">
            {accounts.length > 0 && (
              <div>
                <div className="text-[11px] font-medium text-[var(--text-muted)] mb-1.5">
                  已保存账号（留空密码可直接复用凭据）
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {accounts.map((acc) => (
                    <div
                      key={acc}
                      className={cn(
                        "inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full border text-xs font-medium transition-colors",
                        username === acc
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "bg-[var(--surface-2)] text-[var(--text)]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setUsername(acc);
                          setPassword("");
                        }}
                      >
                        {acc}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAccount(acc)}
                        className="p-0.5 rounded-full hover:bg-rose-500/15 hover:text-rose-500 transition-colors"
                        title="清除此账号"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="login-user">
                统一身份认证账号（吉大邮箱 @ 前缀）
              </label>
              <input
                id="login-user"
                type="text"
                autoComplete="username"
                placeholder="例如 zhangsan24（不是学号）"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border bg-[var(--surface-2)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="login-pass">
                密码
              </label>
              <input
                id="login-pass"
                type="password"
                autoComplete="current-password"
                placeholder={
                  accounts.includes(username.trim())
                    ? "已记住凭据，可直接点击登录或输入新密码"
                    : "请输入统一身份认证密码"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border bg-[var(--surface-2)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-slate-300 text-[var(--accent)]"
              />
              记住凭据到系统加密钥匙串（会话失效时免重输）
            </label>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-200 leading-relaxed">
                {error}
              </div>
            )}

            {vpnHint && activeRoute === "direct" && (
              <button
                type="button"
                onClick={(e) => handleStart(e, "webvpn")}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors disabled:opacity-60"
              >
                <Globe className="w-3.5 h-3.5" />
                改用应用内 WebVPN 登录
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {(directHint || routeMismatchVpn) && activeRoute === "webvpn" && (
              <button
                type="button"
                onClick={(e) => handleStart(e, "direct")}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-60"
              >
                <Wifi className="w-3.5 h-3.5" />
                改用校园网直连登录
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <div className="flex items-center justify-between pt-2">
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                <Shield className="w-3.5 h-3.5 text-emerald-500" />
                当前仅支持本科生教务
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3.5 py-2 rounded-xl border text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-60"
                >
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {busy ? "验证中..." : "登录并同步"}
                </button>
              </div>
            </div>
          </form>
        ) : step === "sending_code" ? (
          <div className="py-6 px-4 rounded-xl border bg-[var(--surface-2)] text-center space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)] mx-auto" />
            <div className="text-xs font-semibold">
              账号密码已通过，正在自动识别图形验证码并向微信发送动态验证码...
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              通常需要 1–5 秒，请留意微信「智慧吉大」消息推送
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={handleCancel}
                className="px-3.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-[var(--surface)]"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            {step === "code_sent" ? (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <div className="font-semibold text-emerald-800 dark:text-emerald-200">
                    微信动态验证码已触发发送
                  </div>
                  <p className="text-emerald-700/90 dark:text-emerald-300/80 mt-0.5">
                    系统已自动识别图形验证码。请打开微信「智慧吉大 → 统一身份认证」，查收并填入 6 位动态验证码。
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5">
                <RefreshCw className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <div className="font-semibold text-amber-800 dark:text-amber-200">
                    尚未成功发送微信验证码
                  </div>
                  <p className="text-amber-700/90 dark:text-amber-300/80 mt-0.5">
                    请点击下方「重新发送」再次尝试自动获取验证码；若此前已收到验证码也可直接填写提交。
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="login-wechat">
                微信验证码
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-wechat"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="输入微信收到的验证码"
                    value={wechatCode}
                    onChange={(e) => setWechatCode(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border bg-[var(--surface-2)] text-sm tracking-widest tabular-nums outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => triggerSendCode(prefix)}
                  className="px-3 py-2 rounded-xl border text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap disabled:opacity-60"
                >
                  重新发送
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-200 leading-relaxed">
                {error}
              </div>
            )}

            {canConnectVpn && (
              <button
                type="button"
                disabled={busy}
                onClick={handleConnectVpnContinue}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors disabled:opacity-60"
              >
                <Globe className="w-3.5 h-3.5" />
                改用应用内 WebVPN 继续（无需重发验证码）
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={handleBackToPassword}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] underline-offset-2 hover:underline"
              >
                返回重输账号密码
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3.5 py-2 rounded-xl border text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-60"
                >
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  完成登录
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
