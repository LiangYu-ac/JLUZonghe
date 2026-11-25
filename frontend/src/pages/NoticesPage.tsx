import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Bookmark,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { apiDelete, apiGet, apiPost } from "../lib/api";
import type {
  AppSnapshot,
  CollegeCatalogCategory,
  OAChannel,
  OANoticeItem,
  OANoticesResponse,
  OAPrefs,
  OASubscriptionMatch,
  OASubscriptionRule,
} from "../types/api";
import { EmptyState, Modal, StatusChip } from "../components/ui/Primitives";
import { cn } from "../lib/utils";

function safeNoticeUrl(url?: string): string {
  try {
    const u = new URL(url || "");
    if (!/^https?:$/.test(u.protocol)) return "";
    const h = u.hostname.toLowerCase();
    if (
      h === "jlu.edu.cn" ||
      h.endsWith(".jlu.edu.cn") ||
      /\.(jdyy\.cn|jdey\.com\.cn|zrlyyy\.com)$/.test(h)
    ) {
      return url || "";
    }
  } catch {}
  return "";
}

export function NoticesPage({
  data,
  initialNoticeId,
  onClearInitialNotice,
  toast,
}: {
  data: AppSnapshot;
  initialNoticeId?: string | null;
  onClearInitialNotice?: () => void;
  toast: (msg: string, tone?: "info" | "success" | "error") => void;
}) {
  const [subView, setSubView] = useState<"feed" | "subs">("feed");
  const [channels, setChannels] = useState<OAChannel[]>([{ id: "179577", name: "校内通知" }]);
  const [prefs, setPrefs] = useState<OAPrefs | null>(null);
  const [activeChannel, setActiveChannel] = useState("179577");
  const [noticesRes, setNoticesRes] = useState<OANoticesResponse | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [kw, setKw] = useState("");
  const [dept, setDept] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OANoticeItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // College picker / channel management modal
  const [manageOpen, setManageOpen] = useState(false);
  const [catalog, setCatalog] = useState<CollegeCatalogCategory[]>([]);
  const [pickedColleges, setPickedColleges] = useState<string[]>([]);

  // Subscriptions
  const [rules, setRules] = useState<OASubscriptionRule[]>([]);
  const [matches, setMatches] = useState<OASubscriptionMatch[]>([]);
  const [subKw, setSubKw] = useState("");
  const [subDept, setSubDept] = useState("");
  const [subBusy, setSubBusy] = useState(false);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);

  async function loadChannelsAndList(targetChannel?: string) {
    setErrorMsg("");
    let nextCh = targetChannel || activeChannel;
    try {
      const chRes = await apiGet<{ channels: OAChannel[]; prefs?: OAPrefs }>("/api/oa/channels");
      const list = chRes.channels || [{ id: "179577", name: "校内通知" }];
      setChannels(list);
      if (chRes.prefs) setPrefs(chRes.prefs);
      if (!list.some((c) => c.id === nextCh)) {
        nextCh = list[0]?.id || "179577";
      }
      setActiveChannel(nextCh);
    } catch {}

    setLoadingList(true);
    try {
      const res = await apiGet<OANoticesResponse>(
        `/api/oa/notices?category=${encodeURIComponent(nextCh)}`,
      );
      setNoticesRes(res);
      if (!initialNoticeId && res.items?.length && !selectedId) {
        void openNotice(res.items[0].id);
      }
    } catch (err) {
      setNoticesRes(null);
      setErrorMsg(err instanceof Error ? err.message : "读取通知失败");
    } finally {
      setLoadingList(false);
    }
  }

  async function loadSubscriptions() {
    try {
      const res = await apiGet<{ rules: OASubscriptionRule[]; matches: OASubscriptionMatch[] }>(
        "/api/oa/subscriptions?limit=30",
      );
      setRules(res.rules || []);
      setMatches(res.matches || []);
    } catch {}
  }

  useEffect(() => {
    void loadChannelsAndList();
    void loadSubscriptions();
  }, [data.updated]);

  useEffect(() => {
    if (initialNoticeId) {
      setSubView("feed");
      void openNotice(initialNoticeId);
      onClearInitialNotice?.();
    }
  }, [initialNoticeId]);

  async function openNotice(id: string) {
    setSelectedId(id);
    setLoadingDetail(true);
    try {
      const res = await apiGet<{ item: OANoticeItem }>(
        `/api/oa/notice?id=${encodeURIComponent(id)}`,
      );
      setDetail(res.item);
    } catch (err) {
      setDetail(null);
      toast(err instanceof Error ? err.message : "读取正文失败", "error");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleRefreshChannel() {
    setRefreshing(true);
    try {
      const res = await apiPost<OANoticesResponse>("/api/oa/refresh", {
        category: activeChannel,
      });
      setNoticesRes(res);
      if (res.items?.length && !selectedId) {
        void openNotice(res.items[0].id);
      }
      if (res.status === "link_only") {
        toast("请点击官网入口查看该学院通知");
      } else {
        toast("通知已更新", "success");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "更新通知失败", "error");
    } finally {
      setRefreshing(false);
    }
  }

  async function openManageModal() {
    setManageOpen(true);
    if (!catalog.length) {
      try {
        const res = await apiGet<{ catalog: { categories: CollegeCatalogCategory[] } }>(
          "/api/oa/catalog",
        );
        setCatalog(res.catalog?.categories || []);
      } catch {}
    }
    const enabledSet = new Set(prefs?.enabled || []);
    const activeIds: string[] = [];
    for (const g of catalog) {
      for (const c of g.colleges) {
        const cols = c.scrape ? Object.keys(c.cols || {}).map((k) => `${c.id}-${k}`) : [`${c.id}-site`];
        if (cols.some((id) => enabledSet.has(id))) {
          activeIds.push(c.id);
        }
      }
    }
    setPickedColleges(activeIds);
  }

  async function saveManageColleges() {
    const enabled = ["179577"];
    const allCols = catalog.flatMap((g) => g.colleges);
    for (const cid of pickedColleges) {
      const col = allCols.find((c) => c.id === cid);
      if (!col) continue;
      const ids = col.scrape
        ? Object.keys(col.cols || {})
            .slice(0, 2)
            .map((k) => `${col.id}-${k}`)
        : [`${col.id}-site`];
      for (const id of ids) {
        if (!enabled.includes(id)) enabled.push(id);
      }
    }
    try {
      const res = await apiPost<{ prefs: OAPrefs; channels: OAChannel[] }>("/api/oa/prefs", {
        enabled,
        order: enabled,
        onboarded: true,
        home_college: pickedColleges[0] || prefs?.home_college || "",
      });
      setPrefs(res.prefs);
      setChannels(res.channels);
      setManageOpen(false);
      if (!res.channels.some((c) => c.id === activeChannel)) {
        const nextId = res.channels[0]?.id || "179577";
        await loadChannelsAndList(nextId);
      }
      toast("已更新订阅学院频道", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存失败", "error");
    }
  }

  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    if (!subKw.trim()) return toast("请输入要关注的关键词", "error");
    setSubBusy(true);
    try {
      await apiPost("/api/oa/subscriptions", {
        keywords: subKw.trim(),
        depts: subDept
          .split(/[,，、]/)
          .map((s) => s.trim())
          .filter(Boolean),
        channel: activeChannel,
      });
      setSubKw("");
      setSubDept("");
      await loadSubscriptions();
      toast("已添加关键词订阅规则", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "添加订阅失败", "error");
    } finally {
      setSubBusy(false);
    }
  }

  async function handleSyncSubs() {
    setSubBusy(true);
    try {
      const res = await apiPost<{ new?: number; matches?: number }>(
        "/api/oa/subscriptions/sync",
        {},
      );
      await loadSubscriptions();
      toast(
        res.matches ? `发现 ${res.matches} 条新命中通知` : "扫描完成，暂未发现新命中",
        res.matches ? "success" : "info",
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "扫描订阅失败", "error");
    } finally {
      setSubBusy(false);
    }
  }

  const allItems = noticesRes?.items || [];
  const depts = useMemo(
    () => [...new Set(allItems.map((i) => i.dept).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh")),
    [allItems],
  );
  const filteredItems = useMemo(() => {
    const q = kw.trim().toLowerCase();
    return allItems.filter(
      (i) =>
        (!dept || i.dept === dept) &&
        (!q || `${i.title} ${i.dept}`.toLowerCase().includes(q)),
    );
  }, [allItems, kw, dept]);

  const activeMatches = useMemo(
    () => matches.filter((m) => rules.some((r) => r.id === m.rule_id)),
    [matches, rules],
  );

  return (
    <div className="space-y-4 animate-in">
      {/* Top Toolbar */}
      <div className="surface-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-0.5 rounded-xl border bg-[var(--surface-2)] text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSubView("feed")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg transition-colors",
                subView === "feed"
                  ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm"
                  : "text-[var(--text-muted)]",
              )}
            >
              通知公告
            </button>
            <button
              type="button"
              onClick={() => setSubView("subs")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1.5",
                subView === "subs"
                  ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm"
                  : "text-[var(--text-muted)]",
              )}
            >
              关键词订阅
              {activeMatches.length > 0 && (
                <span className="px-1.5 rounded-full bg-[var(--accent)] text-white text-[10px]">
                  {activeMatches.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openManageModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-xs font-medium"
            >
              <Settings2 className="w-3.5 h-3.5" />
              选择学院/栏目
            </button>
            {subView === "feed" ? (
              <button
                type="button"
                disabled={refreshing}
                onClick={handleRefreshChannel}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-60"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
                更新当前栏目
              </button>
            ) : (
              <button
                type="button"
                disabled={subBusy}
                onClick={handleSyncSubs}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5" />
                扫描最新命中
              </button>
            )}
          </div>
        </div>

        {/* Channel Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {channels.map((ch) => {
            const on = ch.id === activeChannel;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setDetail(null);
                  setDept("");
                  void loadChannelsAndList(ch.id);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-full border text-xs font-semibold transition-all",
                  on
                    ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm"
                    : "bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                {ch.name || ch.id}
              </button>
            );
          })}
        </div>

        {subView === "feed" && (
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                placeholder="搜索通知标题或发文单位..."
                value={kw}
                onChange={(e) => setKw(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-xl border bg-[var(--surface-2)] text-xs outline-none focus:border-[var(--accent)]"
              />
            </div>
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-xs"
            >
              <option value="">全部发文单位</option>
              {depts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            {noticesRes?.fetched_at && (
              <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                {filteredItems.length} 条 · 更新于{" "}
                {noticesRes.fetched_at.replace("T", " ").slice(0, 16)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main Split-Pane Notice Reader */}
      {subView === "feed" ? (
        noticesRes?.status === "link_only" ? (
          <div className="surface-card p-8 text-center space-y-3">
            <h3 className="text-base font-bold">该学院暂不支持自动抓取列表</h3>
            <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
              {noticesRes.hint}
            </p>
            {safeNoticeUrl(noticesRes.source_url) && (
              <a
                href={safeNoticeUrl(noticesRes.source_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold"
              >
                打开学院官网查看 <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left List */}
            <div
              className={cn(
                "lg:col-span-5 surface-card overflow-hidden",
                selectedId && "hidden lg:block",
              )}
            >
              {loadingList ? (
                <div className="p-10 flex flex-col items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
                  正在读取通知列表...
                </div>
              ) : errorMsg ? (
                <div className="p-6 text-center space-y-2 text-xs">
                  <div className="font-semibold text-rose-600">{errorMsg}</div>
                  <button
                    type="button"
                    onClick={() => loadChannelsAndList(activeChannel)}
                    className="px-3 py-1.5 rounded-lg border"
                  >
                    重试
                  </button>
                </div>
              ) : filteredItems.length > 0 ? (
                <div className="divide-y max-h-[68vh] overflow-y-auto">
                  {filteredItems.map((item) => {
                    const active = item.id === selectedId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openNotice(item.id)}
                        className={cn(
                          "w-full p-3.5 text-left transition-colors hover:bg-[var(--surface-2)]",
                          active && "bg-[var(--accent-soft)]/70 border-l-4 border-l-[var(--accent)]",
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          {item.top && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/12 text-rose-600 dark:text-rose-400 text-[10px] font-bold shrink-0 mt-0.5">
                              置顶
                            </span>
                          )}
                          <span className="text-[13px] font-semibold leading-snug line-clamp-2">
                            {item.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] mt-1.5 flex items-center justify-between gap-2 tabular-nums">
                          <span className="truncate">{item.dept || "校内通知"}</span>
                          <span className="shrink-0">{item.time?.slice(0, 16)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={<Bell className="w-6 h-6" />}
                  title="当前栏目暂无通知"
                  description="点击右上角「更新当前栏目」从学校或学院官网拉取最新公告。"
                />
              )}
            </div>

            {/* Right Reading Pane */}
            <div
              className={cn(
                "lg:col-span-7 surface-card p-6 min-h-[420px]",
                !selectedId && "hidden lg:flex lg:items-center lg:justify-center",
              )}
            >
              {loadingDetail ? (
                <div className="py-16 flex flex-col items-center gap-2 text-xs text-[var(--text-muted)] w-full">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
                  正在解析通知正文...
                </div>
              ) : detail ? (
                <div className="space-y-4 w-full">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(null);
                        setDetail(null);
                      }}
                      className="lg:hidden inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)]"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> 返回列表
                    </button>
                    {safeNoticeUrl(detail.url) && (
                      <a
                        href={safeNoticeUrl(detail.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        打开原文 <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  <div className="space-y-2 pb-3 border-b">
                    <h2 className="text-lg font-bold leading-snug">
                      {detail.top && (
                        <StatusChip tone="bad" className="mr-2 align-middle">
                          置顶
                        </StatusChip>
                      )}
                      {detail.title}
                    </h2>
                    <div className="text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-3 tabular-nums">
                      <span>发文单位：{detail.dept || "未知单位"}</span>
                      {detail.time && <span>发布时间：{detail.time}</span>}
                    </div>
                  </div>

                  {detail.html ? (
                    <div
                      className="rich-notice"
                      dangerouslySetInnerHTML={{ __html: detail.html }}
                    />
                  ) : detail.text ? (
                    <div className="rich-notice whitespace-pre-wrap">{detail.text}</div>
                  ) : (
                    <div className="p-8 text-center rounded-xl bg-[var(--surface-2)] text-xs text-[var(--text-muted)]">
                      {detail.detail_error || "该通知暂无正文内容，请点击右上角「打开原文」查看。"}
                    </div>
                  )}

                  {detail.attachments && detail.attachments.length > 0 && (
                    <div className="pt-4 border-t space-y-2">
                      <div className="text-xs font-bold flex items-center gap-1.5">
                        <Paperclip className="w-3.5 h-3.5 text-[var(--accent)]" />
                        相关附件 ({detail.attachments.length})
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {detail.attachments.map((att, idx) => (
                          <a
                            key={idx}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2.5 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--accent)] text-xs font-medium transition-colors"
                          >
                            <FileText className="w-4 h-4 text-[var(--accent)] shrink-0" />
                            <span className="truncate flex-1">{att.name}</span>
                            <ExternalLink className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={<FileText className="w-6 h-6" />}
                  title="选择左侧通知以阅读全文"
                  description="支持置顶标记、全文排版预览、图片代理显示及附件一键下载。"
                />
              )}
            </div>
          </div>
        )
      ) : (
        /* Subscriptions View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 surface-card p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-[var(--accent)]" />
                关键词订阅规则
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                本地监听「{channels.find((c) => c.id === activeChannel)?.name || activeChannel}」的关键词命中。
              </p>
            </div>

            <form onSubmit={handleAddRule} className="space-y-2.5">
              <input
                type="text"
                placeholder="关键词，逗号分隔，如：奖学金, 补考, 讲座"
                value={subKw}
                onChange={(e) => setSubKw(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-xs outline-none focus:border-[var(--accent)]"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="限定发文单位（可选）"
                  value={subDept}
                  onChange={(e) => setSubDept(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-xs outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="submit"
                  disabled={subBusy}
                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> 添加
                </button>
              </div>
            </form>

            <div className="space-y-2 pt-1">
              {rules.length > 0 ? (
                rules.map((r) => {
                  const armed = armedDeleteId === r.id;
                  return (
                    <div
                      key={r.id}
                      className="p-3 rounded-xl border bg-[var(--surface-2)] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap gap-1">
                          {r.keywords.map((k) => (
                            <StatusChip key={k} tone="accent">
                              {k}
                            </StatusChip>
                          ))}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {r.depts.length ? `单位：${r.depts.join("、")} · ` : ""}
                          栏目：{channels.find((c) => c.id === r.channel)?.name || r.channel}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!armed) {
                            setArmedDeleteId(r.id);
                            setTimeout(() => setArmedDeleteId(null), 3000);
                            return;
                          }
                          await apiDelete(`/api/oa/subscriptions/${encodeURIComponent(r.id)}`);
                          setArmedDeleteId(null);
                          await loadSubscriptions();
                          toast("已删除订阅规则");
                        }}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[11px] font-medium shrink-0",
                          armed
                            ? "bg-rose-600 text-white"
                            : "text-[var(--text-muted)] hover:text-rose-600",
                        )}
                      >
                        {armed ? "确认删除" : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-[var(--text-muted)] text-center py-6">
                  尚未添加任何关键词订阅规则。
                </p>
              )}
            </div>
          </div>

          <div className="lg:col-span-7 surface-card p-5 space-y-3">
            <h3 className="text-sm font-bold">最近命中通知 ({activeMatches.length})</h3>
            {activeMatches.length > 0 ? (
              <div className="divide-y">
                {activeMatches.map((m, idx) => (
                  <button
                    key={`${m.rule_id}-${idx}`}
                    type="button"
                    onClick={() => {
                      setSubView("feed");
                      if (m.notice?.id) void openNotice(m.notice.id);
                    }}
                    className="w-full py-3 text-left hover:bg-[var(--surface-2)] px-2 -mx-2 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <StatusChip tone="ok">命中：{m.keywords_hit.join("、")}</StatusChip>
                      <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                        {m.notice?.time}
                      </span>
                    </div>
                    <div className="text-sm font-semibold">{m.notice?.title}</div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {m.notice?.dept}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Bell className="w-6 h-6" />}
                title="暂无新命中消息"
                description="点击右上角「扫描最新命中」即可比对订阅规则与最新通知。"
              />
            )}
          </div>
        </div>
      )}

      {/* Manage Colleges Modal */}
      <Modal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        title="选择关注学院"
        subtitle="选中的学院通知栏目将显示在顶部快捷切换栏中"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="max-h-[55vh] overflow-y-auto space-y-3 pr-1">
            {catalog.map((cat) => (
              <div key={cat.id} className="space-y-2">
                <div className="text-xs font-bold text-[var(--text-muted)]">{cat.name}</div>
                <div className="flex flex-wrap gap-2">
                  {cat.colleges.map((col) => {
                    const checked = pickedColleges.includes(col.id);
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() =>
                          setPickedColleges((prev) =>
                            checked ? prev.filter((x) => x !== col.id) : [...prev, col.id],
                          )
                        }
                        className={cn(
                          "px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
                          checked
                            ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                            : "bg-[var(--surface-2)] hover:border-[var(--border-strong)]",
                        )}
                      >
                        {col.name}
                        {!col.scrape && " · 官网"}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button
              type="button"
              onClick={() => setManageOpen(false)}
              className="px-4 py-2 rounded-xl border text-xs font-medium"
            >
              取消
            </button>
            <button
              type="button"
              onClick={saveManageColleges}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold"
            >
              保存设置
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
