import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Calculator,
  Loader2,
  RefreshCw,
  Search,
  Layers,
} from "lucide-react";
import { apiGet, apiPost } from "../lib/api";
import type { AppSnapshot, CompletionGroup, PlanCourse } from "../types/api";
import { EmptyState, Modal, StatusChip } from "../components/ui/Primitives";
import { cn, formatTimeAgo, roundNum } from "../lib/utils";

interface RecalcStatus {
  state: string;
  message?: string;
  progress?: number;
}

function isCourseDone(c: PlanCourse): boolean {
  return (c.status_code || (c.status === "已修" ? "done" : "")) === "done";
}

function sumDoneCredits(node: CompletionGroup, seen = new Set<string>()): number {
  if (seen.has(node.code)) return 0;
  seen.add(node.code);
  const direct = (node.courses || []).filter(isCourseDone).reduce((s, c) => s + (c.credit || 0), 0);
  const child = (node.children || []).reduce((s, ch) => s + sumDoneCredits(ch, seen), 0);
  return direct + child;
}

function countNodeCourses(node: CompletionGroup): number {
  return (
    (node.courses || []).length +
    (node.children || []).reduce((s, ch) => s + countNodeCourses(ch), 0)
  );
}

function statusChipTone(status: string): "ok" | "accent" | "bad" | "neutral" {
  if (status === "已修") return "ok";
  if (status === "在修") return "accent";
  if (status === "未通过") return "bad";
  return "neutral";
}

export function AcademicPage({
  data,
  onSnapshotUpdate,
  toast,
}: {
  data: AppSnapshot;
  onSnapshotUpdate: (next: AppSnapshot) => void;
  toast: (msg: string, tone?: "info" | "success" | "error") => void;
}) {
  const [statusFilter, setStatusFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [natureFilter, setNatureFilter] = useState("");
  const [search, setSearch] = useState("");

  const [updating, setUpdating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [recalcStatus, setRecalcStatus] = useState<RecalcStatus>({ state: "idle" });

  const allCourses = data.plan_courses?.courses || [];

  useEffect(() => {
    if (!["submitting", "running", "syncing"].includes(recalcStatus.state)) return;
    const t = setInterval(async () => {
      try {
        const res = await apiGet<RecalcStatus>("/api/academic/recalculate");
        setRecalcStatus(res);
        if (res.state === "success") {
          const snap = await apiGet<AppSnapshot>("/api/data");
          onSnapshotUpdate(snap);
          toast("教务学业重算完成，课程与学分已更新", "success");
        }
      } catch {
        setRecalcStatus({
          state: "unconfirmed",
          message: "暂未获取到重算进度，请稍后点「从教务更新」查看结果。",
        });
      }
    }, 2000);
    return () => clearInterval(t);
  }, [recalcStatus.state]);

  async function handleUpdateAcademic() {
    setUpdating(true);
    try {
      const next = await apiPost<AppSnapshot>("/api/academic/refresh", {});
      onSnapshotUpdate(next);
      toast("学业进度与培养方案已更新", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "学业更新失败", "error");
    } finally {
      setUpdating(false);
    }
  }

  async function handleStartRecalc() {
    setConfirmOpen(false);
    setRecalcStatus({ state: "submitting", message: "正在提交教务重新计算请求..." });
    try {
      const res = await apiPost<RecalcStatus>("/api/academic/recalculate", { confirmed: true });
      setRecalcStatus(res);
      if (res.state === "success") {
        const snap = await apiGet<AppSnapshot>("/api/data");
        onSnapshotUpdate(snap);
        toast(res.message || "已完成重新计算", "success");
      }
    } catch (err) {
      setRecalcStatus({
        state: "failed",
        message: err instanceof Error ? err.message : "重新计算请求失败",
      });
    }
  }

  const courseMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (c: PlanCourse) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (termFilter && (c.term || "") !== termFilter) return false;
      if (natureFilter && (c.nature || c.category || "") !== natureFilter) return false;
      if (q && !`${c.name} ${c.code} ${c.dept || ""}`.toLowerCase().includes(q)) return false;
      return true;
    };
  }, [statusFilter, termFilter, natureFilter, search]);

  const terms = useMemo(
    () => [...new Set(allCourses.map((c) => c.term).filter(Boolean) as string[])].sort(),
    [allCourses],
  );
  const natures = useMemo(
    () =>
      [...new Set(allCourses.map((c) => c.nature || c.category).filter(Boolean) as string[])].sort(),
    [allCourses],
  );

  const statsCounts = useMemo(() => {
    const count = (s: string) => allCourses.filter((c) => c.status === s).length;
    return {
      total: allCourses.length,
      done: count("已修"),
      inprog: count("在修"),
      todo: count("未修"),
    };
  }, [allCourses]);

  const comp = data.completion;
  const pct =
    comp?.required && comp.required > 0
      ? Math.min(100, ((comp.earned || 0) / comp.required) * 100)
      : 0;

  const isFiltering = Boolean(statusFilter || termFilter || natureFilter || search.trim());
  const busy = updating || ["submitting", "running", "syncing"].includes(recalcStatus.state);

  return (
    <div className="space-y-5 animate-in">
      {/* Top Progress Hero */}
      <div className="surface-card p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="relative w-24 h-24 shrink-0">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="9"
                  className="text-slate-200 dark:text-slate-800"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="9"
                  strokeDasharray={`${pct * 2.64} 264`}
                  strokeLinecap="round"
                  className="text-[var(--accent)] transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center tabular-nums">
                <span className="text-lg font-bold">{Math.round(pct)}%</span>
                <span className="text-[10px] text-[var(--text-muted)]">学分完成</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight">
                  {comp?.plan || "培养方案学业进度"}
                </h2>
                {comp &&
                  (comp.passed ? (
                    <StatusChip tone="ok">已满足毕业学分</StatusChip>
                  ) : (
                    <StatusChip tone="warn">还差 {roundNum(comp.missing, 1)} 学分</StatusChip>
                  ))}
              </div>
              {comp ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)] tabular-nums">
                  <span>
                    已获 <strong className="text-[var(--text)]">{roundNum(comp.earned, 1)}</strong> /{" "}
                    {roundNum(comp.required, 1)} 学分
                  </span>
                  {comp.selected != null && <span>含在修已选 {roundNum(comp.selected, 1)} 学分</span>}
                  {allCourses.length > 0 && (
                    <span>
                      课程统计：已修 {statsCounts.done} · 在修 {statsCounts.inprog} · 未修{" "}
                      {statsCounts.todo}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  尚未读取到培养方案完成情况，登录后点击「从教务更新」即可获取。
                </p>
              )}
              <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                本机同步：{formatTimeAgo(data.academic_meta?.local_synced_at)} · 教务计算：
                {formatTimeAgo(
                  data.academic_meta?.school_calculated_at || comp?.calculated_at,
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={handleUpdateAcademic}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-xs font-semibold disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", updating && "animate-spin")} />
              从教务更新
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold disabled:opacity-50"
            >
              <Calculator className="w-3.5 h-3.5" />
              请求教务重算
            </button>
          </div>
        </div>

        {recalcStatus.state !== "idle" && recalcStatus.message && (
          <div className="mt-4 p-3 rounded-xl border bg-[var(--surface-2)] flex items-center gap-2.5 text-xs">
            {["submitting", "running", "syncing"].includes(recalcStatus.state) ? (
              <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)] shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            )}
            <span>{recalcStatus.message}</span>
          </div>
        )}
      </div>

      {/* Filters */}
      {allCourses.length > 0 && (
        <div className="surface-card p-4 flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              placeholder="搜索课程名、课程号或开课学院..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-xl border bg-[var(--surface-2)] text-xs outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {["", "已修", "在修", "未修", "未通过"].map((st) => (
              <button
                key={st || "all"}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={cn(
                  "px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors",
                  statusFilter === st
                    ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                    : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                )}
              >
                {st || "全部"}
              </button>
            ))}
          </div>

          <select
            value={termFilter}
            onChange={(e) => setTermFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-xs"
          >
            <option value="">全部修读学期</option>
            {terms.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={natureFilter}
            onChange={(e) => setNatureFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-xs"
          >
            <option value="">全部性质</option>
            {natures.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Course Tree or Flat Groups */}
      {!comp ? (
        <div className="surface-card">
          <EmptyState
            icon={<Layers className="w-6 h-6" />}
            title="暂无学业完成数据"
            description="登录后点击右上角「刷新同步」或「从教务更新」，即可查看完整的培养方案课程树。"
          />
        </div>
      ) : comp.tree && comp.tree.length > 0 ? (
        <div className="space-y-3">
          {comp.tree.map((node) => (
            <TreeNodeCard
              key={node.code}
              node={node}
              depth={0}
              courseMatches={courseMatches}
              forceExpand={isFiltering}
            />
          ))}
        </div>
      ) : (comp.groups || []).length > 0 ? (
        <div className="space-y-3">
          {comp.groups!.map((g) => (
            <TreeNodeCard
              key={g.code || g.name}
              node={g}
              depth={0}
              courseMatches={courseMatches}
              forceExpand={isFiltering}
            />
          ))}
        </div>
      ) : (
        <div className="surface-card p-6 text-center text-xs text-[var(--text-muted)]">
          教务未返回专业课组树，仅显示总学分概况。
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="让教务系统重新计算学业进度？"
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-xs leading-relaxed text-[var(--text-muted)]">
          <p>
            教务后台会重新核对你的已修课程与培养方案学分。计算通常需要 5–30 秒，完成后本页面将自动刷新结果。
          </p>
          <p>如果你刚在教务网站上计算过，只需点击「从教务更新」，无需重复提交计算。</p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="px-4 py-2 rounded-xl border font-medium"
            >
              暂不计算
            </button>
            <button
              type="button"
              onClick={handleStartRecalc}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white font-semibold"
            >
              确认重新计算
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TreeNodeCard({
  node,
  depth,
  courseMatches,
  forceExpand,
}: {
  node: CompletionGroup;
  depth: number;
  courseMatches: (c: PlanCourse) => boolean;
  forceExpand: boolean;
}) {
  const [open, setOpen] = useState(depth === 0);
  const effectiveOpen = forceExpand || open;

  const computedEarned = Math.max(
    node.earned > 0 ? node.earned : 0,
    Math.round(sumDoneCredits(node) * 100) / 100,
  );
  const req = node.required;
  const missing = req != null ? Math.max(0, Math.round((req - computedEarned) * 100) / 100) : 0;
  const ok = req != null && missing === 0;
  const pct = req && req > 0 ? Math.min(100, (computedEarned / req) * 100) : 0;

  const courses = (node.courses || []).filter(courseMatches);
  const totalCount = countNodeCourses(node);

  return (
    <div
      className={cn(
        "surface-card overflow-hidden transition-all",
        depth > 0 && "shadow-none bg-[var(--surface-2)]/60 rounded-xl",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 text-left hover:bg-[var(--surface-2)]/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {effectiveOpen ? (
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          )}
          <span className="text-sm font-bold truncate">{node.name}</span>
          {node.nature && <StatusChip tone="neutral">{node.nature}</StatusChip>}
          <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
            {totalCount} 门课
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-xs font-semibold tabular-nums">
            {roundNum(computedEarned, 1)}
            {req != null ? ` / ${roundNum(req, 1)} 学分` : " 学分"}
          </div>
          {req != null &&
            (ok ? (
              <StatusChip tone="ok">已达标</StatusChip>
            ) : (
              <StatusChip tone="warn">差 {roundNum(missing, 1)}</StatusChip>
            ))}
        </div>
      </button>

      {req != null && (
        <div className="px-4 pb-2.5">
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                ok ? "bg-emerald-500" : "bg-[var(--accent)]",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {effectiveOpen && (
        <div className="px-4 pb-4 space-y-3">
          {courses.length > 0 && (
            <div className="overflow-x-auto rounded-xl border bg-[var(--surface)]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b bg-[var(--surface-2)] text-[var(--text-muted)]">
                    <th className="py-2 px-3">状态</th>
                    <th className="py-2 px-3">课程号</th>
                    <th className="py-2 px-3">课程名</th>
                    <th className="py-2 px-3 text-right">学分</th>
                    <th className="py-2 px-3">性质</th>
                    <th className="py-2 px-3">修读学期</th>
                    <th className="py-2 px-3 text-right">成绩</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {courses.map((c, idx) => (
                    <tr key={`${c.code}-${idx}`} className="hover:bg-[var(--surface-2)]/60">
                      <td className="py-2 px-3">
                        <StatusChip tone={statusChipTone(c.status)}>{c.status}</StatusChip>
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-[var(--text-muted)]">
                        {c.code}
                      </td>
                      <td className="py-2 px-3 font-medium">{c.name}</td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {c.credit != null ? roundNum(c.credit, 1) : "—"}
                      </td>
                      <td className="py-2 px-3 text-[var(--text-muted)]">
                        {c.nature || c.category || "—"}
                      </td>
                      <td className="py-2 px-3 text-[var(--text-muted)] tabular-nums">
                        {c.term || "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold tabular-nums">
                        {c.score || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(node.children || []).length > 0 && (
            <div className="space-y-2.5 pl-2 md:pl-4 border-l-2 border-[var(--border-strong)]">
              {node.children!.map((child) => (
                <TreeNodeCard
                  key={child.code}
                  node={child}
                  depth={depth + 1}
                  courseMatches={courseMatches}
                  forceExpand={forceExpand}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
