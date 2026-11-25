import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookmarkPlus,
  CheckSquare,
  ChevronDown,
  Copy,
  FileSpreadsheet,
  Filter,
  HelpCircle,
  Pin,
  PinOff,
  RefreshCw,
  RotateCcw,
  Search,
  Square,
  Trash2,
  Upload,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { apiGet, apiPost } from "../lib/api";
import {
  computeGradeIssues,
  computeGradeTotals,
  computeSchemeSelection,
  computeScoreDistribution,
  computeTermTrends,
  formatSignedDelta,
  GRADE_BUILTINS,
  gradeBaseLabel,
  gradeHasIssue,
  isBuiltinScheme,
  resolveSchemeBase,
} from "../lib/grades";
import type { AppSnapshot, GradeRecord } from "../types/api";
import { Modal, StatusChip } from "../components/ui/Primitives";
import { cn, roundNum } from "../lib/utils";

type SortKey = "" | "nature" | "credit" | "numeric_score" | "point" | "term";

export function GradesPage({
  data,
  onSnapshotUpdate,
  toast,
}: {
  data: AppSnapshot;
  onSnapshotUpdate: (next: AppSnapshot) => void;
  toast: (msg: string, tone?: "info" | "success" | "error") => void;
}) {
  const [scheme, setScheme] = useState<string>("__postgraduate__");
  const [selected, setSelected] = useState<Set<string>>(() =>
    computeSchemeSelection(data.grades || [], "__postgraduate__", data.schemes, data.scheme_rules),
  );
  const [pinned, setPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem("jlu-grade-pinned") !== "false";
    } catch {
      return true;
    }
  });
  const [search, setSearch] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advTerms, setAdvTerms] = useState<string[]>([]);
  const [advNatures, setAdvNatures] = useState<string[]>([]);
  const [scoreMin, setScoreMin] = useState("");
  const [scoreMax, setScoreMax] = useState("");
  const [pointMin, setPointMin] = useState("");
  const [pointMax, setPointMax] = useState("");
  const [creditMin, setCreditMin] = useState("");
  const [creditMax, setCreditMax] = useState("");
  const [inclusionFilter, setInclusionFilter] = useState<"" | "in" | "out">("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 0 | 1 | -1 }>({ key: "", dir: 0 });

  const [showPolicy, setShowPolicy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [collegeLinks, setCollegeLinks] = useState<{ name: string; url: string }[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const grades = data.grades || [];
  const baseScheme = resolveSchemeBase(scheme, data.scheme_rules);

  const savedSelection = useMemo(
    () => computeSchemeSelection(grades, scheme, data.schemes, data.scheme_rules),
    [grades, scheme, data.schemes, data.scheme_rules],
  );

  const dirty = useMemo(
    () => grades.some((g) => selected.has(g.key) !== savedSelection.has(g.key)),
    [grades, selected, savedSelection],
  );

  // Sync selection when grades or scheme change
  useEffect(() => {
    const targetScheme =
      isBuiltinScheme(scheme) || scheme in (data.schemes || {}) ? scheme : "__postgraduate__";
    if (targetScheme !== scheme) setScheme(targetScheme);
    setSelected(computeSchemeSelection(grades, targetScheme, data.schemes, data.scheme_rules));
  }, [data.grades, data.grade_source, data.schemes, data.scheme_rules]);

  function handleSelectScheme(nextScheme: string) {
    setScheme(nextScheme);
    setSelected(computeSchemeSelection(grades, nextScheme, data.schemes, data.scheme_rules));
  }

  function handleTogglePin() {
    const next = !pinned;
    setPinned(next);
    try {
      localStorage.setItem("jlu-grade-pinned", String(next));
    } catch {}
  }

  const currentTotals = useMemo(() => computeGradeTotals(grades, selected), [grades, selected]);
  const savedTotals = useMemo(
    () => computeGradeTotals(grades, savedSelection),
    [grades, savedSelection],
  );
  const issues = useMemo(() => computeGradeIssues(grades, selected), [grades, selected]);
  const termTrends = useMemo(() => computeTermTrends(grades, selected), [grades, selected]);
  const distribution = useMemo(() => computeScoreDistribution(grades), [grades]);

  const allTerms = useMemo(
    () => [...new Set(grades.map((g) => g.term).filter(Boolean))].sort().reverse(),
    [grades],
  );
  const allNatures = useMemo(
    () => [...new Set(grades.map((g) => g.nature || "未标注"))].sort(),
    [grades],
  );

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = grades.filter((g) => {
      if (q && !`${g.name} ${g.nature} ${g.term}`.toLowerCase().includes(q)) return false;
      if (termFilter && g.term !== termFilter) return false;
      if (advTerms.length && !advTerms.includes(g.term)) return false;
      if (advNatures.length && !advNatures.includes(g.nature || "未标注")) return false;
      if (inclusionFilter && selected.has(g.key) !== (inclusionFilter === "in")) return false;
      if (
        (statusFilter === "unknown" ||
          statusFilter === "missing-point" ||
          statusFilter === "missing-nature") &&
        !gradeHasIssue(g, statusFilter)
      ) {
        return false;
      }
      if (statusFilter === "fail" && !(g.numeric_score != null && g.numeric_score < 60)) return false;
      if (statusFilter === "pass" && !(g.numeric_score != null && g.numeric_score >= 60)) return false;
      if (scoreMin !== "" && (g.numeric_score == null || g.numeric_score < Number(scoreMin))) return false;
      if (scoreMax !== "" && (g.numeric_score == null || g.numeric_score > Number(scoreMax))) return false;
      if (pointMin !== "" && (g.point == null || g.point < Number(pointMin))) return false;
      if (pointMax !== "" && (g.point == null || g.point > Number(pointMax))) return false;
      if (creditMin !== "" && g.credit < Number(creditMin)) return false;
      if (creditMax !== "" && g.credit > Number(creditMax)) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (!sort.dir || !sort.key) {
        return (b.term || "").localeCompare(a.term || "");
      }
      const x = a[sort.key];
      const y = b[sort.key];
      if (x == null) return y == null ? 0 : 1;
      if (y == null) return -1;
      const cmp =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "zh-CN");
      return cmp * sort.dir;
    });
  }, [
    grades,
    search,
    termFilter,
    advTerms,
    advNatures,
    inclusionFilter,
    statusFilter,
    scoreMin,
    scoreMax,
    pointMin,
    pointMax,
    creditMin,
    creditMax,
    selected,
    sort,
  ]);

  const activeAdvCount =
    advTerms.length +
    advNatures.length +
    (inclusionFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (scoreMin !== "" || scoreMax !== "" ? 1 : 0) +
    (pointMin !== "" || pointMax !== "" ? 1 : 0) +
    (creditMin !== "" || creditMax !== "" ? 1 : 0);

  function toggleSort(key: SortKey) {
    if (sort.key !== key) {
      setSort({ key, dir: -1 });
    } else if (sort.dir === -1) {
      setSort({ key, dir: 1 });
    } else {
      setSort({ key: "", dir: 0 });
    }
  }

  function toggleRow(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  }

  async function handleSaveScheme(e: React.FormEvent) {
    e.preventDefault();
    const name = saveName.trim();
    if (!name) return;
    try {
      const next = await apiPost<AppSnapshot>("/api/schemes", {
        name,
        include: [...selected],
        base: baseScheme,
        grade_source: data.grade_source || "jwxt",
      });
      onSnapshotUpdate(next);
      setScheme(name);
      setSaveOpen(false);
      setSaveName("");
      toast(`已保存自定义模板「${name}」`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存模板失败", "error");
    }
  }

  async function handleDeleteScheme() {
    if (isBuiltinScheme(scheme)) return;
    try {
      const next = await apiPost<AppSnapshot>("/api/schemes/delete", { name: scheme });
      onSnapshotUpdate(next);
      setScheme("__postgraduate__");
      toast(`已删除模板「${scheme}」`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "删除失败", "error");
    }
  }

  async function handleSyncGrades() {
    setSyncing(true);
    try {
      const res = await apiPost<AppSnapshot & { grade_result?: { count: number } }>(
        "/api/grades/refresh",
        { auto: false },
      );
      onSnapshotUpdate(res);
      toast(`已同步 ${res.grade_result?.count ?? (res.grades || []).length} 门教务成绩`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "同步成绩失败", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function handleFileUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast("成绩单文件不能超过 5 MB", "error");
      return;
    }
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const b64 = btoa(bin);
      const next = await apiPost<AppSnapshot>("/api/grades/import", {
        filename: file.name,
        data: b64,
      });
      onSnapshotUpdate(next);
      toast(`已导入「${file.name}」，可自由勾选参与加权的课程`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "导入成绩单失败", "error");
    } finally {
      setImporting(false);
    }
  }

  async function handleSwitchSource(source: "jwxt" | "import") {
    try {
      const next = await apiPost<AppSnapshot>("/api/grades/source", { grade_source: source });
      onSnapshotUpdate(next);
    } catch (err) {
      toast(err instanceof Error ? err.message : "切换失败", "error");
    }
  }

  function openHelpModal() {
    setHelpOpen(true);
    if (!collegeLinks.length) {
      apiGet<{ links: { name: string; url: string }[] }>("/api/grades/colleges")
        .then((r) => setCollegeLinks(r.links || []))
        .catch(() => {});
    }
  }

  const deltaScore =
    currentTotals.score != null && savedTotals.score != null
      ? currentTotals.score - savedTotals.score
      : null;
  const deltaPoint =
    currentTotals.point != null && savedTotals.point != null
      ? currentTotals.point - savedTotals.point
      : null;

  const templateChanges = useMemo(() => {
    const added = grades.filter((g) => selected.has(g.key) && !g.builtin?.[baseScheme]);
    const removed = grades.filter((g) => !selected.has(g.key) && g.builtin?.[baseScheme]);
    return { added, removed };
  }, [grades, selected, baseScheme]);

  return (
    <div className="space-y-5 animate-in">
      {/* Sticky KPI Overview */}
      <div
        className={cn(
          "surface-card p-4 transition-shadow",
          pinned && "md:sticky md:top-[68px] z-10 shadow-md",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold">加权成绩工作室</h2>
            <StatusChip tone={data.grade_source === "import" ? "warn" : "accent"}>
              {data.grade_source === "import"
                ? `文件导入 · ${data.grade_filename || "本地成绩单"}`
                : "教务成绩"}
            </StatusChip>
            {dirty && <StatusChip tone="warn">有未保存调整</StatusChip>}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleTogglePin}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                pinned
                  ? "bg-[var(--accent-soft)] text-[var(--accent)] border-transparent"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
              title={pinned ? "取消顶部吸顶" : "固定在屏幕顶部"}
            >
              {pinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{pinned ? "已吸顶" : "吸顶"}</span>
            </button>
            <button
              type="button"
              onClick={openHelpModal}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              规则说明
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border">
            <div className="text-xs text-[var(--text-muted)]">加权平均分</div>
            <div className="text-2xl font-bold tracking-tight tabular-nums mt-1 text-[var(--accent)]">
              {currentTotals.score != null ? currentTotals.score.toFixed(3) : "—"}
            </div>
            {dirty && (
              <div className="text-[11px] font-semibold tabular-nums mt-0.5 text-[var(--text-muted)]">
                较模板 {formatSignedDelta(deltaScore)}
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border">
            <div className="text-xs text-[var(--text-muted)]">加权平均绩点</div>
            <div className="text-2xl font-bold tracking-tight tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
              {currentTotals.point != null ? currentTotals.point.toFixed(3) : "—"}
            </div>
            {dirty && (
              <div className="text-[11px] font-semibold tabular-nums mt-0.5 text-[var(--text-muted)]">
                较模板 {formatSignedDelta(deltaPoint)}
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border">
            <div className="text-xs text-[var(--text-muted)]">计入总学分</div>
            <div className="text-2xl font-bold tracking-tight tabular-nums mt-1">
              {roundNum(currentTotals.credits, 2)}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              按学分加权计算
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border">
            <div className="text-xs text-[var(--text-muted)]">计入课程数</div>
            <div className="text-2xl font-bold tracking-tight tabular-nums mt-1">
              {currentTotals.selectedTotal}
              <span className="text-sm font-medium text-[var(--text-muted)]">
                {" "}
                / {grades.length}
              </span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              通过类与 0 学分不计入加权
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      {grades.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 surface-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold">各学期加权走势</h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  随下方勾选课程实时重算各学期加权均分
                </p>
              </div>
            </div>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={termTrends} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2557D6" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#2557D6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="shortTerm" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis domain={["dataMin - 4", 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--surface)",
                      fontSize: 12,
                    }}
                    formatter={(value, name) => [
                      String(value ?? ""),
                      name === "score" ? "加权均分" : "加权绩点",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="#2557D6"
                    strokeWidth={2.5}
                    fill="url(#scoreGrad)"
                    dot={{ r: 4, fill: "#2557D6" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-5 surface-card p-5">
            <div className="mb-3">
              <h3 className="text-sm font-bold">成绩分段分布</h3>
              <p className="text-[11px] text-[var(--text-muted)]">全部已修可换算课程的分数段分布</p>
            </div>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--surface)",
                      fontSize: 12,
                    }}
                    formatter={(val) => [`${val ?? 0} 门`, "课程数"]}
                  />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {distribution.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Official GPA Strip */}
      {data.grade_source !== "import" && data.official_gpa?.items?.length ? (
        <div className="surface-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                教务官方统计（只读）
              </h3>
              {data.official_gpa.plan && (
                <span className="text-xs text-[var(--text-muted)]">· {data.official_gpa.plan}</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {data.official_gpa.items.map((item) => (
              <div key={item.key} className="p-2.5 rounded-xl bg-[var(--surface-2)] border">
                <div className="text-[11px] text-[var(--text-muted)] truncate">{item.label}</div>
                <div className="text-base font-bold tabular-nums mt-0.5">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Template Studio & Filter Controls */}
      <div className="surface-card p-5 space-y-4">
        {/* Template Selector Row */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={scheme}
            onChange={(e) => handleSelectScheme(e.target.value)}
            aria-label="选择计算模板"
            className="px-3.5 py-2 rounded-xl border bg-[var(--surface-2)] text-xs font-semibold outline-none focus:border-[var(--accent)] min-w-[210px]"
          >
            <optgroup label="内置模板">
              {Object.values(GRADE_BUILTINS).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </optgroup>
            {Object.keys(data.schemes || {}).length > 0 && (
              <optgroup label="自定义模板">
                {Object.keys(data.schemes || {}).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          <button
            type="button"
            onClick={() => {
              setSaveName(isBuiltinScheme(scheme) ? "" : scheme);
              setSaveOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            另存为自定义模板
          </button>

          <button
            type="button"
            disabled={!dirty}
            onClick={() => {
              setSelected(savedSelection);
              toast("已恢复当前模板的课程选择");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium disabled:opacity-40 hover:bg-[var(--surface-2)]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            恢复模板选择
          </button>

          {!isBuiltinScheme(scheme) && (
            <button
              type="button"
              onClick={handleDeleteScheme}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <Trash2 className="w-3.5 h-3.5" />
              删除模板
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowPolicy((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            规则详情与改动对比
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showPolicy && "rotate-180")} />
          </button>
        </div>

        {showPolicy && (
          <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border text-xs space-y-2">
            <p className="text-[var(--text-muted)]">
              <strong className="text-[var(--text)]">当前基础规则（{gradeBaseLabel(baseScheme)}）：</strong>
              {GRADE_BUILTINS[
                baseScheme === "postgraduate"
                  ? "__postgraduate__"
                  : baseScheme === "scholarship"
                    ? "__scholarship__"
                    : "__all__"
              ].policy}
            </p>
            {(templateChanges.added.length > 0 || templateChanges.removed.length > 0) && (
              <div className="space-y-1 pt-1 border-t">
                {templateChanges.added.length > 0 && (
                  <div>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold mr-2">
                      + 额外计入 ({templateChanges.added.length})：
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {templateChanges.added.map((g) => g.name).join("、")}
                    </span>
                  </div>
                )}
                {templateChanges.removed.length > 0 && (
                  <div>
                    <span className="text-rose-600 dark:text-rose-400 font-semibold mr-2">
                      − 手动排除 ({templateChanges.removed.length})：
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {templateChanges.removed.map((g) => g.name).join("、")}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Issues Alert */}
        {(issues.unknown > 0 || issues["missing-point"] > 0 || issues["missing-nature"] > 0) && (
          <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-950/25 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>需要核对的数据（点击即可筛选查看）：</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {issues.unknown > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setStatusFilter((s) => (s === "unknown" ? "" : "unknown"))
                  }
                  className={cn(
                    "px-2.5 py-1 rounded-lg border font-medium",
                    statusFilter === "unknown"
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-[var(--surface)] text-amber-800 dark:text-amber-200",
                  )}
                >
                  无法换算 · {issues.unknown} 门
                </button>
              )}
              {issues["missing-point"] > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setStatusFilter((s) => (s === "missing-point" ? "" : "missing-point"))
                  }
                  className={cn(
                    "px-2.5 py-1 rounded-lg border font-medium",
                    statusFilter === "missing-point"
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-[var(--surface)] text-amber-800 dark:text-amber-200",
                  )}
                >
                  缺失绩点 · {issues["missing-point"]} 门
                </button>
              )}
              {issues["missing-nature"] > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setStatusFilter((s) => (s === "missing-nature" ? "" : "missing-nature"))
                  }
                  className={cn(
                    "px-2.5 py-1 rounded-lg border font-medium",
                    statusFilter === "missing-nature"
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-[var(--surface)] text-amber-800 dark:text-amber-200",
                  )}
                >
                  未标注性质 · {issues["missing-nature"]} 门
                </button>
              )}
            </div>
          </div>
        )}

        {/* Search, Filter & Sync Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              placeholder="搜索课程名、课程性质或学期..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-xl border bg-[var(--surface-2)] text-xs outline-none focus:border-[var(--accent)]"
            />
          </div>

          <select
            value={termFilter}
            onChange={(e) => setTermFilter(e.target.value)}
            aria-label="按学期筛选"
            className="px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-xs outline-none"
          >
            <option value="">全部学期</option>
            {allTerms.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors",
              showAdvanced || activeAdvCount > 0
                ? "bg-[var(--accent-soft)] text-[var(--accent)] border-transparent"
                : "bg-[var(--surface-2)]",
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            高级筛选
            {activeAdvCount > 0 && (
              <span className="px-1.5 rounded-full bg-[var(--accent)] text-white text-[10px]">
                {activeAdvCount}
              </span>
            )}
          </button>

          {data.grade_source === "import" ? (
            <button
              type="button"
              onClick={() => handleSwitchSource("jwxt")}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold hover:bg-[var(--surface-2)]"
            >
              返回教务成绩
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSyncGrades}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-xs font-medium"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
              同步教务成绩
            </button>
          )}

          {data.has_imported_grades && data.grade_source !== "import" && (
            <button
              type="button"
              onClick={() => handleSwitchSource("import")}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              查看导入成绩
            </button>
          )}

          <button
            type="button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-xs font-medium"
          >
            <Upload className="w-3.5 h-3.5" />
            {importing ? "解析中..." : "导入 Excel/CSV"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) handleFileUpload(f);
            }}
          />
        </div>

        {/* Advanced Filter Drawer */}
        {showAdvanced && (
          <div className="p-4 rounded-xl bg-[var(--surface-2)] border space-y-3 text-xs">
            <div>
              <div className="font-semibold text-[var(--text-muted)] mb-1.5">多选学期</div>
              <div className="flex flex-wrap gap-1.5">
                {allTerms.map((t) => {
                  const on = advTerms.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setAdvTerms((prev) =>
                          on ? prev.filter((x) => x !== t) : [...prev, t],
                        )
                      }
                      className={cn(
                        "px-2.5 py-1 rounded-full border transition-colors",
                        on
                          ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                          : "bg-[var(--surface)]",
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="font-semibold text-[var(--text-muted)] mb-1.5">多选课程性质</div>
              <div className="flex flex-wrap gap-1.5">
                {allNatures.map((n) => {
                  const on = advNatures.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() =>
                        setAdvNatures((prev) =>
                          on ? prev.filter((x) => x !== n) : [...prev, n],
                        )
                      }
                      className={cn(
                        "px-2.5 py-1 rounded-full border transition-colors",
                        on
                          ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                          : "bg-[var(--surface)]",
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-1">
              <label className="space-y-1">
                <span className="text-[var(--text-muted)]">成绩区间</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="最低"
                    value={scoreMin}
                    onChange={(e) => setScoreMin(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border bg-[var(--surface)]"
                  />
                  <span>–</span>
                  <input
                    type="number"
                    placeholder="最高"
                    value={scoreMax}
                    onChange={(e) => setScoreMax(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border bg-[var(--surface)]"
                  />
                </div>
              </label>

              <label className="space-y-1">
                <span className="text-[var(--text-muted)]">绩点区间</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.1"
                    placeholder="最低"
                    value={pointMin}
                    onChange={(e) => setPointMin(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border bg-[var(--surface)]"
                  />
                  <span>–</span>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="最高"
                    value={pointMax}
                    onChange={(e) => setPointMax(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border bg-[var(--surface)]"
                  />
                </div>
              </label>

              <label className="space-y-1">
                <span className="text-[var(--text-muted)]">学分区间</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.5"
                    placeholder="最低"
                    value={creditMin}
                    onChange={(e) => setCreditMin(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border bg-[var(--surface)]"
                  />
                  <span>–</span>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="最高"
                    value={creditMax}
                    onChange={(e) => setCreditMax(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border bg-[var(--surface)]"
                  />
                </div>
              </label>

              <label className="space-y-1">
                <span className="text-[var(--text-muted)]">计入状态</span>
                <select
                  value={inclusionFilter}
                  onChange={(e) => setInclusionFilter(e.target.value as "" | "in" | "out")}
                  className="w-full px-2 py-1.5 rounded-lg border bg-[var(--surface)]"
                >
                  <option value="">全部</option>
                  <option value="in">已计入</option>
                  <option value="out">已排除</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[var(--text-muted)]">成绩状态</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border bg-[var(--surface)]"
                >
                  <option value="">全部</option>
                  <option value="pass">及格</option>
                  <option value="fail">不及格</option>
                  <option value="unknown">成绩无法换算</option>
                  <option value="missing-point">缺失绩点</option>
                  <option value="missing-nature">未标注性质</option>
                </select>
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setTermFilter("");
                  setAdvTerms([]);
                  setAdvNatures([]);
                  setScoreMin("");
                  setScoreMax("");
                  setPointMin("");
                  setPointMax("");
                  setCreditMin("");
                  setCreditMax("");
                  setInclusionFilter("");
                  setStatusFilter("");
                  setSort({ key: "", dir: 0 });
                }}
                className="px-3 py-1 rounded-lg border bg-[var(--surface)] hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                重置全部筛选
              </button>
            </div>
          </div>
        )}

        {/* Bulk Selection Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          <div className="text-[var(--text-muted)]">
            显示 <strong className="text-[var(--text)]">{visibleRows.length}</strong> / {grades.length} 门课程
            （筛选只改变列表显示，上方结果统计整份成绩单中勾选的课程）
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelected(new Set(grades.map((g) => g.key)))}
              className="px-2.5 py-1 rounded-lg border bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
            >
              全部计入
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="px-2.5 py-1 rounded-lg border bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
            >
              全部排除
            </button>
            <button
              type="button"
              onClick={() => {
                const next = new Set(selected);
                grades
                  .filter((g) => g.required && g.credit > 0)
                  .forEach((g) => next.add(g.key));
                setSelected(next);
              }}
              className="px-2.5 py-1 rounded-lg border bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
            >
              追加计入必修课
            </button>
          </div>
        </div>
      </div>

      {/* Grades Data Table */}
      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b bg-[var(--surface-2)] text-[var(--text-muted)] font-semibold">
                <th className="py-3 px-3.5 w-14 whitespace-nowrap">计入</th>
                <th className="py-3 px-3">课程名称</th>
                {(
                  [
                    { key: "nature", label: "性质", align: "left" },
                    { key: "credit", label: "学分", align: "right" },
                    { key: "numeric_score", label: "成绩", align: "right" },
                    { key: "point", label: "绩点", align: "right" },
                    { key: "term", label: "学期", align: "left" },
                  ] as const
                ).map((col) => {
                  const active = sort.key === col.key && sort.dir !== 0;
                  return (
                    <th
                      key={col.key}
                      className={cn("py-3 px-3", col.align === "right" && "text-right")}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-[var(--text)] transition-colors",
                          active && "text-[var(--accent)] font-bold",
                        )}
                      >
                        {col.label}
                        {active ? (
                          sort.dir === 1 ? (
                            <ArrowUp className="w-3 h-3" />
                          ) : (
                            <ArrowDown className="w-3 h-3" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleRows.map((g) => {
                const on = selected.has(g.key);
                const failed = g.numeric_score != null && g.numeric_score < 60;
                return (
                  <tr
                    key={g.key}
                    onClick={() => toggleRow(g.key)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-[var(--surface-2)]/80",
                      !on && "opacity-55",
                      failed && "bg-rose-50/40 dark:bg-rose-950/15",
                    )}
                  >
                    <td className="py-2.5 px-3.5">
                      {on ? (
                        <CheckSquare className="w-4 h-4 text-[var(--accent)]" />
                      ) : (
                        <Square className="w-4 h-4 text-[var(--text-muted)]" />
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[13px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{g.name}</span>
                        {g.ungraded && <StatusChip tone="neutral">通过类 · 不加权</StatusChip>}
                        {!g.ungraded && !g.score_valid && (
                          <StatusChip tone="bad">无法换算 · 按 0 分</StatusChip>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusChip
                        tone={
                          g.nature === "必修"
                            ? "accent"
                            : g.nature === "限选"
                              ? "warn"
                              : "neutral"
                        }
                      >
                        {g.nature}
                      </StatusChip>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{roundNum(g.credit, 2)}</td>
                    <td
                      className={cn(
                        "py-2.5 px-3 text-right font-semibold tabular-nums",
                        failed && "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {g.score}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      <span>{g.point == null ? "—" : roundNum(g.point, 2)}</span>
                      {g.point_source === "estimated" && g.point != null && (
                        <span className="ml-1 text-[10px] text-[var(--text-muted)]">(估)</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--text-muted)] tabular-nums">
                      {g.term || "未标注"}
                    </td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[var(--text-muted)]">
                    {grades.length
                      ? "没有符合筛选条件的课程，请调整或重置筛选条件。"
                      : "还没有成绩数据，登录教务同步或点击上方「导入 Excel/CSV」即可开始计算。"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save Template Modal */}
      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="另存为自定义模板"
        subtitle="保存基础规则以及当前手动调整的计入/排除课程，后续新成绩将按基础规则自动匹配。"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveScheme} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" htmlFor="tpl-name">
              模板名称
            </label>
            <input
              id="tpl-name"
              type="text"
              required
              maxLength={40}
              placeholder="例如：软件学院保研、奖学金综测"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border bg-[var(--surface-2)] text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSaveOpen(false)}
              className="px-4 py-2 rounded-xl border text-xs font-medium"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold"
            >
              保存模板
            </button>
          </div>
        </form>
      </Modal>

      {/* Grade Help Modal */}
      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="成绩与加权计算说明（适用于吉林大学）"
        maxWidth="max-w-xl"
      >
        <div className="space-y-3.5 text-xs leading-relaxed text-[var(--text-muted)]">
          <p>
            不同学院保研推免与奖学金评选细则存在差异。建议核对本学院最新文件后微调勾选课程，再点击「另存为自定义模板」。
          </p>
          <div className="p-3 rounded-xl bg-[var(--surface-2)] border space-y-1.5 text-[var(--text)]">
            <div>
              <strong>保研加权：</strong>排除选修、限选、通用学术英语、体育、军事理论、军事训练。
            </div>
            <div>
              <strong>奖学金加权：</strong>只计必修，排除英语、体育、军事训练；军事理论计入。
            </div>
            <div>
              <strong>所有课程：</strong>计入全部有学分课程（通过/不通过类不计入）。
            </div>
          </div>
          <p>
            等级成绩默认按：优秀 95、良好 85、中等 75、及格 65、不及格 55 换算；优先采用教务单科绩点，缺失时按吉大标准规则估算并标注。支持导入 5 MB 以内的 Excel（.xlsx/.xls）及 CSV 成绩单。
          </p>

          <div className="pt-2 border-t space-y-2">
            <div className="font-semibold text-[var(--text)]">快捷检索本学院推免/奖学金政策</div>
            <div className="flex flex-wrap gap-1.5">
              {["免试", "推荐优秀应届本科毕业生免试攻读研究生", "推免"].map((kw) => (
                <button
                  key={kw}
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(kw).then(
                      () => toast(`已复制关键词：${kw}`, "success"),
                      () => toast("复制失败", "error"),
                    );
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-[var(--surface-2)] hover:border-[var(--accent)] text-[var(--text)]"
                >
                  <Copy className="w-3 h-3" />
                  {kw}
                </button>
              ))}
            </div>
            {collegeLinks.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {collegeLinks.map((lk) => (
                  <a
                    key={lk.url}
                    href={lk.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                  >
                    {lk.name}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
