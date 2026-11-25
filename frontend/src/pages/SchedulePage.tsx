import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Download,
  SlidersHorizontal,
  AlertTriangle,
  Check,
  Trash2,
  RotateCcw,
  Upload,
  CalendarCheck,
  MapPin,
  User,
  Clock,
  Edit3,
  EyeOff,
  Armchair,
} from "lucide-react";
import { apiPost } from "../lib/api";
import { exportIcsOnDevice, isNativeMobileApp } from "../lib/android";
import {
  describeOp,
  findNextAgendaItem,
  formatCourseSlot,
  formatWeeksList,
  getCoursePalette,
  getCourseTimeRange,
  getMaxWeek,
  getPeriodMap,
  placeExamsOnSchedule,
  WEEKDAYS,
  weekOfDate,
  type PlacedExam,
} from "../lib/schedule";
import type { AppSnapshot, CourseItem } from "../types/api";
import { Modal, StatusChip } from "../components/ui/Primitives";
import { cn } from "../lib/utils";

interface CourseFormState {
  mode: "add" | "edit";
  course: CourseItem | null;
  name: string;
  location: string;
  teacher: string;
  weekday: number;
  start: number;
  end: number;
  weeks: number[];
  scope: "week" | "all";
}

export function SchedulePage({
  data,
  week,
  onChangeWeek,
  onSnapshotUpdate,
  onOpenExams,
  toast,
}: {
  data: AppSnapshot;
  week: number;
  onChangeWeek: (w: number) => void;
  onSnapshotUpdate: (next: AppSnapshot) => void;
  onOpenExams?: () => void;
  toast: (msg: string, tone?: "info" | "success" | "error") => void;
}) {
  const [selectedCourse, setSelectedCourse] = useState<CourseItem | null>(null);
  const [selectedExam, setSelectedExam] = useState<PlacedExam | null>(null);
  const [formState, setFormState] = useState<CourseFormState | null>(null);
  const [editsOpen, setEditsOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const swipeRef = useRef<{ x: number; y: number; t: number; width: number } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const placedExams = useMemo(
    () => placeExamsOnSchedule(data.exams || [], data.first_monday, data.periods),
    [data.exams, data.first_monday, data.periods],
  );
  const showExams = data.settings?.show_exams_in_schedule !== false;

  const maxWeek = getMaxWeek(
    data.courses || [],
    data.calendar?.total_weeks,
    data.exams,
    data.first_monday,
  );
  const currentWeek = Math.min(Math.max(1, weekOfDate(data.first_monday, now)), maxWeek);
  const periodsMap = useMemo(() => getPeriodMap(data.periods), [data.periods]);

  const weekCourses = useMemo(
    () => (data.courses || []).filter((c) => (c.weeks || []).includes(week)),
    [data.courses, week],
  );

  const weekExamCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const pe of placedExams) {
      map.set(pe.week, (map.get(pe.week) || 0) + 1);
    }
    return map;
  }, [placedExams]);

  const weekExams = useMemo(
    () => placedExams.filter((pe) => pe.week === week),
    [placedExams, week],
  );
  const timedWeekExams = useMemo(
    () => weekExams.filter((pe) => !pe.allDay),
    [weekExams],
  );

  const maxPeriod = useMemo(
    () =>
      Math.max(
        11,
        ...weekCourses.map((c) => c.end || 0),
        ...(showExams ? timedWeekExams.map((e) => e.end || 0) : []),
      ),
    [weekCourses, timedWeekExams, showExams],
  );

  const nextHit = useMemo(
    () =>
      findNextAgendaItem(
        data.courses || [],
        data.exams || [],
        data.periods,
        data.first_monday,
        now,
        maxWeek,
      ),
    [data.courses, data.exams, data.periods, data.first_monday, now, maxWeek],
  );

  const dayHeaders = useMemo(() => {
    const fm = data.first_monday ? new Date(`${data.first_monday.slice(0, 10)}T00:00:00`) : null;
    const todayStr = now.toDateString();
    return WEEKDAYS.map((label, i) => {
      let dateStr = "";
      let isToday = false;
      if (fm && !Number.isNaN(fm.getTime())) {
        const d = new Date(fm.getTime());
        d.setDate(d.getDate() + (week - 1) * 7 + i);
        dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
        isToday = d.toDateString() === todayStr;
      }
      return { label: `周${label}`, dateStr, isToday, weekday: i + 1 };
    });
  }, [data.first_monday, week, now]);

  async function postOverlay(body: unknown, okMsg?: string) {
    setBusy(true);
    try {
      const res = await apiPost<Partial<AppSnapshot>>("/api/schedule/overlay", body);
      onSnapshotUpdate({ ...data, ...res } as AppSnapshot);
      if (okMsg) toast(okMsg, "success");
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "操作失败", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleAdjustments(checked: boolean) {
    try {
      const next = await apiPost<AppSnapshot>("/api/settings", {
        apply_adjustments: checked,
      });
      onSnapshotUpdate(next);
      toast(checked ? "已开启自动应用调课/停课" : "已按原始教务课表显示");
    } catch (e) {
      toast(e instanceof Error ? e.message : "设置保存失败", "error");
    }
  }

  async function handleToggleShowExams(checked: boolean) {
    try {
      const next = await apiPost<AppSnapshot>("/api/settings", {
        show_exams_in_schedule: checked,
      });
      onSnapshotUpdate(next);
      toast(checked ? "已在课表中显示考试安排" : "已在课表中隐藏考试安排");
    } catch (e) {
      toast(e instanceof Error ? e.message : "设置保存失败", "error");
    }
  }

  function openAddModal(seed?: { weekday: number; period: number }) {
    const occupied = new Set<string>();
    for (const c of weekCourses) {
      for (let p = c.start; p <= c.end; p++) {
        occupied.add(`${c.weekday}-${p}`);
      }
    }
    let start = seed?.period ?? 1;
    let end = start;
    if (seed) {
      const mate = start % 2 === 1 ? start + 1 : start - 1;
      if (mate >= 1 && mate <= maxPeriod && !occupied.has(`${seed.weekday}-${mate}`)) {
        start = Math.min(seed.period, mate);
        end = Math.max(seed.period, mate);
      }
    } else {
      end = 2;
    }

    setFormState({
      mode: "add",
      course: null,
      name: "",
      location: "",
      teacher: "",
      weekday: seed?.weekday ?? 1,
      start,
      end,
      weeks: seed ? [week] : Array.from({ length: maxWeek }, (_, i) => i + 1),
      scope: "all",
    });
  }

  function openEditModal(c: CourseItem) {
    setSelectedCourse(null);
    setFormState({
      mode: "edit",
      course: c,
      name: c.name,
      location: c.location || "",
      teacher: c.teacher || "",
      weekday: c.weekday,
      start: c.start,
      end: c.end,
      weeks: [...(c.weeks || [])],
      scope: "week",
    });
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!formState) return;
    const name = formState.name.trim();
    if (!name) return toast("请填写课程名称", "error");
    if (formState.end < formState.start) return toast("结束节次不能早于开始节次", "error");

    if (formState.mode === "add") {
      if (!formState.weeks.length) return toast("请至少选择一周", "error");
      const ok = await postOverlay(
        {
          action: "add",
          course: {
            name,
            location: formState.location.trim(),
            teacher: formState.teacher.trim(),
            weekday: formState.weekday,
            start: formState.start,
            end: formState.end,
            weeks: formState.weeks,
          },
        },
        "已添加课程（刷新课表也不会覆盖）",
      );
      if (ok) setFormState(null);
      return;
    }

    const c = formState.course!;
    const vals = {
      name,
      location: formState.location.trim(),
      teacher: formState.teacher.trim(),
      weekday: formState.weekday,
      start: formState.start,
      end: formState.end,
    };

    if (c.src === "custom") {
      if (!formState.weeks.length) return toast("请至少选择一周", "error");
      const ok = await postOverlay(
        {
          action: "update",
          id: c.oid,
          course: { ...vals, weeks: formState.weeks },
        },
        "已保存修改",
      );
      if (ok) setFormState(null);
      return;
    }

    const setObj: Record<string, string | number> = {};
    (Object.keys(vals) as (keyof typeof vals)[]).forEach((k) => {
      if (String(vals[k]) !== String(c[k] ?? "")) {
        setObj[k] = vals[k];
      }
    });

    if (c.src === "edited") {
      const existingOp = (data.schedule_ops || []).find((o) => o.id === c.oid);
      const ok = await postOverlay(
        {
          action: "update",
          id: c.oid,
          set: { ...(existingOp?.set || {}), ...setObj },
        },
        "已更新课程修改",
      );
      if (ok) setFormState(null);
      return;
    }

    const ok = await postOverlay(
      {
        action: "edit",
        target: c.key,
        jxbid: c.jxbid || undefined,
        weeks: formState.scope === "week" ? [week] : null,
        set: setObj,
      },
      "已保存课程修改",
    );
    if (ok) setFormState(null);
  }

  async function handleSkipWeek(c: CourseItem) {
    let req: unknown = null;
    if (c.src === "official") {
      req = { action: "hide", target: c.key, jxbid: c.jxbid || undefined, weeks: [week] };
    } else if (c.src === "custom") {
      const rest = c.weeks.filter((w) => w !== week);
      req = rest.length
        ? {
            action: "update",
            id: c.oid,
            course: {
              name: c.name,
              teacher: c.teacher,
              location: c.location,
              weekday: c.weekday,
              start: c.start,
              end: c.end,
              weeks: rest,
            },
          }
        : { action: "remove", id: c.oid };
    }
    if (!req) return;
    const ok = await postOverlay(req, `已将第 ${week} 周「${c.name}」设为不上`);
    if (ok) setSelectedCourse(null);
  }

  async function handleDeleteOrRestore(c: CourseItem) {
    const req =
      c.src === "official"
        ? { action: "hide", target: c.key, jxbid: c.jxbid || undefined }
        : { action: "remove", id: c.oid };
    const ok = await postOverlay(
      req,
      c.src === "edited" ? "已恢复教务原样" : "已移除课程",
    );
    if (ok) {
      setConfirmDelete(false);
      setSelectedCourse(null);
    }
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const doc = JSON.parse(String(reader.result));
        await postOverlay({ action: "import", doc }, "课表备份已导入");
      } catch {
        toast("文件不是有效的吉大综合课表修改备份", "error");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-4 animate-in">
      {/* Schedule Issues Banner */}
      {(data.schedule_issues || []).length > 0 && (
        <div className="surface-card p-4 border-amber-300 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-950/25 space-y-2.5">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            有 {data.schedule_issues.length} 条课表个人修改需确认
          </div>
          <div className="space-y-2">
            {data.schedule_issues.map((iss) => (
              <div
                key={iss.oid}
                className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--surface)] border text-xs"
              >
                <div>
                  <span className="font-semibold">「{iss.name || "课程"}」</span>
                  <span className="text-[var(--text-muted)] ml-1.5">{iss.message}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => postOverlay({ action: "ack", id: iss.oid }, "已确认")}
                    className="px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] font-semibold"
                  >
                    我知道了
                  </button>
                  {iss.kind === "missing" && iss.op === "edit" && (
                    <button
                      type="button"
                      onClick={() =>
                        postOverlay({ action: "detach", id: iss.oid }, "已保留为自定义课")
                      }
                      className="px-2.5 py-1 rounded-lg border font-medium"
                    >
                      保留为自定义课
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => postOverlay({ action: "remove", id: iss.oid }, "已删除修改")}
                    className="px-2.5 py-1 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Controls Bar */}
      <div className="surface-card p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => week > 1 && onChangeWeek(week - 1)}
            disabled={week <= 1}
            className="p-2 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--border-strong)] disabled:opacity-40 transition-colors"
            aria-label="上一周"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <select
            value={week}
            onChange={(e) => onChangeWeek(Number(e.target.value))}
            aria-label="选择周次"
            className="px-3 py-1.5 rounded-xl border bg-[var(--surface-2)] text-sm font-bold tabular-nums outline-none focus:border-[var(--accent)]"
          >
            {Array.from({ length: maxWeek }, (_, i) => i + 1).map((w) => {
              const exCnt = showExams ? weekExamCounts.get(w) || 0 : 0;
              return (
                <option key={w} value={w}>
                  第 {w} 周{w === currentWeek ? "（本周）" : ""}
                  {exCnt > 0 ? `（含 ${exCnt} 场考试）` : ""}
                </option>
              );
            })}
          </select>

          <button
            type="button"
            onClick={() => week < maxWeek && onChangeWeek(week + 1)}
            disabled={week >= maxWeek}
            className="p-2 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--border-strong)] disabled:opacity-40 transition-colors"
            aria-label="下一周"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {week !== currentWeek && (
            <button
              type="button"
              onClick={() => onChangeWeek(currentWeek)}
              className="px-3 py-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              回到本周
            </button>
          )}

          {nextHit && (
            <button
              type="button"
              onClick={() => onChangeWeek(nextHit.week)}
              className="hidden xl:inline-flex items-center gap-2 ml-2 px-3 py-1.5 rounded-xl bg-[var(--surface-2)] border text-xs"
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  nextHit.itemType === "exam"
                    ? "bg-rose-500 animate-pulse"
                    : nextHit.kind === "now"
                      ? "bg-emerald-500 animate-pulse"
                      : "bg-[var(--accent)]",
                )}
              />
              <span className="font-semibold">
                {nextHit.itemType === "exam"
                  ? `${nextHit.kind === "now" ? "正在考" : "下场考"}：${nextHit.exam.name}`
                  : `${nextHit.kind === "now" ? "正在上" : "下节"}：${nextHit.course.name}`}
              </span>
              <span className="text-[var(--text-muted)] tabular-nums">
                {nextHit.itemType === "exam"
                  ? `${nextHit.dateStr} ${nextHit.hm} · ${nextHit.exam.location || "地点待定"}`
                  : `${nextHit.hm} · ${nextHit.course.location}`}
              </span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-[var(--surface-2)] text-xs font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showExams}
              onChange={(e) => handleToggleShowExams(e.target.checked)}
              className="rounded text-rose-500"
            />
            显示考试
            {placedExams.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-300 text-[10px] font-bold">
                {placedExams.length}
              </span>
            )}
          </label>

          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-[var(--surface-2)] text-xs font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={data.schedule_adjust?.enabled !== false}
              onChange={(e) => handleToggleAdjustments(e.target.checked)}
              className="rounded text-[var(--accent)]"
            />
            自动调停课
            {(data.schedule_adjust?.applied || 0) > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 text-[10px] font-bold">
                {data.schedule_adjust.applied}
              </span>
            )}
          </label>

          <button
            type="button"
            onClick={() => setEditsOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-xs font-medium transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            我的修改
            {(data.schedule_edits || 0) > 0 && (
              <span className="px-1.5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold">
                {data.schedule_edits}
              </span>
            )}
          </button>

          <a
            href="/api/ics"
            download="jlu-schedule.ics"
            onClick={(e) => {
              if (isNativeMobileApp()) {
                e.preventDefault();
                void exportIcsOnDevice("/api/ics", "jlu-schedule.ics").catch((err) =>
                  toast(err instanceof Error ? err.message : "导出失败", "error"),
                );
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-xs font-medium transition-colors"
            title="导出课表与考试安排至苹果/安卓/Outlook日历（.ics）"
          >
            <Download className="w-3.5 h-3.5" />
            导出日历
          </a>

          <button
            type="button"
            onClick={() => openAddModal()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            添加课程
          </button>
        </div>
      </div>

      {/* This Week Exams Strip */}
      {showExams && weekExams.length > 0 && (
        <div className="surface-card p-3.5 border-rose-200 dark:border-rose-800/60 bg-rose-50/70 dark:bg-rose-950/25 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-semibold text-xs">
              <CalendarCheck className="w-4 h-4 shrink-0" />
              本周考试安排（{weekExams.length} 场）
            </div>
            {onOpenExams && (
              <button
                type="button"
                onClick={onOpenExams}
                className="text-[11px] font-semibold text-rose-600 dark:text-rose-300 hover:underline"
              >
                管理全部考试
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {weekExams.map((pe, i) => (
              <button
                key={`wk-ex-${pe.exam.name}-${pe.exam.start}-${i}`}
                type="button"
                onClick={() => setSelectedExam(pe)}
                className="inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-rose-200 dark:border-rose-800/60 hover:border-rose-400 text-xs transition-colors text-left"
              >
                <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-bold">
                  考
                </span>
                <span className="font-bold">{pe.exam.name}</span>
                <span className="text-[var(--text-muted)] tabular-nums">
                  周{WEEKDAYS[pe.weekday - 1]} {pe.dateStr} {pe.timeLabel}
                </span>
                <span className="text-[var(--text-muted)]">
                  · {pe.exam.location || "地点待定"}
                  {pe.exam.seat ? ` (座位 ${pe.exam.seat})` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Timetable Grid */}
      <div
        className="surface-card overflow-hidden"
        onTouchStart={(e) => {
          if (e.touches.length !== 1) return;
          const t = e.touches[0];
          swipeRef.current = {
            x: t.clientX,
            y: t.clientY,
            t: Date.now(),
            width: e.currentTarget.clientWidth,
          };
        }}
        onTouchEnd={(e) => {
          const s = swipeRef.current;
          swipeRef.current = null;
          if (!s || e.changedTouches.length !== 1) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - s.x;
          const dy = t.clientY - s.y;
          const dt = Date.now() - s.t;
          if (
            dt < 700 &&
            Math.abs(dx) >= Math.max(120, s.width * 0.35) &&
            Math.abs(dx) > 2 * Math.abs(dy)
          ) {
            if (dx < 0 && week < maxWeek) onChangeWeek(week + 1);
            else if (dx > 0 && week > 1) onChangeWeek(week - 1);
          }
        }}
      >
        <div className="overflow-x-auto">
          <div className="min-w-[780px] p-3 md:p-4">
            <div
              className="grid gap-1.5 relative"
              style={{
                gridTemplateColumns: "68px repeat(7, minmax(0, 1fr))",
                gridTemplateRows: `auto repeat(${maxPeriod}, 60px)`,
              }}
            >
              {/* Top Left Corner */}
              <div className="flex items-center justify-center text-[11px] font-medium text-[var(--text-muted)] pb-2">
                节次
              </div>

              {/* Day Headers */}
              {dayHeaders.map((d) => (
                <div
                  key={d.weekday}
                  className={cn(
                    "text-center py-2 px-1 rounded-xl mb-1 transition-colors",
                    d.isToday
                      ? "bg-[var(--accent-soft)] text-[var(--accent)] font-bold"
                      : "text-[var(--text-muted)] font-semibold",
                  )}
                >
                  <div className="text-xs">{d.label}</div>
                  {d.dateStr && (
                    <div className="text-[11px] opacity-80 tabular-nums mt-0.5">{d.dateStr}</div>
                  )}
                </div>
              ))}

              {/* Left Period Labels & Empty Grid Cells */}
              {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((p) => {
                const pt = periodsMap[String(p)];
                return (
                  <React.Fragment key={p}>
                    <div
                      className="flex flex-col items-center justify-center text-center pr-1 select-none border-r border-dashed"
                      style={{ gridRow: p + 1, gridColumn: 1 }}
                    >
                      <span className="text-xs font-bold tabular-nums">{p}</span>
                      {pt && (
                        <span className="text-[10px] text-[var(--text-muted)] tabular-nums leading-tight mt-0.5">
                          {pt[0]}
                          <br />
                          {pt[1]}
                        </span>
                      )}
                    </div>
                    {dayHeaders.map((d) => (
                      <div
                        key={`${d.weekday}-${p}`}
                        onDoubleClick={() => openAddModal({ weekday: d.weekday, period: p })}
                        title="双击空白格添加课程"
                        className={cn(
                          "rounded-lg border border-dashed border-transparent hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]/70 transition-colors cursor-cell",
                          d.isToday && "bg-[var(--accent-soft)]/25",
                        )}
                        style={{ gridRow: p + 1, gridColumn: d.weekday + 1 }}
                      />
                    ))}
                  </React.Fragment>
                );
              })}

              {/* Course Blocks */}
              {weekCourses.map((c, idx) => {
                const isCancelled = c.src === "cancelled";
                const pal = getCoursePalette(c.name);
                const tr = getCourseTimeRange(c, data.periods);
                const hasExamOverlap =
                  showExams &&
                  timedWeekExams.some(
                    (pe) =>
                      pe.weekday === c.weekday &&
                      c.start <= pe.end &&
                      c.end >= pe.start,
                  );
                const badge =
                  isCancelled
                    ? "停"
                    : c.src === "custom"
                      ? "自"
                      : c.src === "edited"
                        ? "改"
                        : c.adj
                          ? "调"
                          : null;

                return (
                  <button
                    key={`${c.name}-${c.weekday}-${c.start}-${idx}`}
                    type="button"
                    onClick={() => {
                      setConfirmDelete(false);
                      setSelectedCourse(c);
                    }}
                    style={{
                      gridRow: `${c.start + 1} / ${c.end + 2}`,
                      gridColumn: c.weekday + 1,
                    }}
                    className={cn(
                      "group relative text-left rounded-xl p-2 border overflow-hidden transition-all hover:shadow-md hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] flex flex-col justify-between z-10",
                      hasExamOverlap && "w-[calc(50%-2px)] justify-self-start",
                      isCancelled
                        ? "bg-slate-100/80 dark:bg-slate-800/60 border-slate-300 dark:border-slate-700 text-slate-500 opacity-75 line-through"
                        : "",
                    )}
                  >
                    {/* Adaptive Background Layer */}
                    {!isCancelled && (
                      <>
                        <div
                          className="absolute inset-0 dark:hidden"
                          style={{ backgroundColor: pal.bg, borderColor: pal.border }}
                        />
                        <div
                          className="absolute inset-0 hidden dark:block"
                          style={{ backgroundColor: pal.bgDark }}
                        />
                        <div
                          className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full"
                          style={{ backgroundColor: pal.stripe }}
                        />
                      </>
                    )}

                    <div className="relative z-10 pl-1.5 space-y-1">
                      <div className="flex items-start justify-between gap-1">
                        <span
                          className={cn(
                            "text-[12px] font-bold leading-snug line-clamp-2",
                            !isCancelled && "text-slate-900 dark:text-slate-100",
                          )}
                        >
                          {c.name}
                        </span>
                        {badge && (
                          <span
                            className={cn(
                              "px-1 py-0.2 rounded text-[10px] font-bold shrink-0",
                              isCancelled
                                ? "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                                : "bg-amber-500/20 text-amber-700 dark:text-amber-300",
                            )}
                          >
                            {badge}
                          </span>
                        )}
                      </div>

                      {c.location && (
                        <div className="text-[10.5px] font-medium opacity-80 leading-tight line-clamp-2 text-slate-700 dark:text-slate-300">
                          {c.location}
                        </div>
                      )}
                    </div>

                    <div className="relative z-10 pl-1.5 flex items-center justify-between gap-1 text-[10px] opacity-70 tabular-nums text-slate-600 dark:text-slate-300">
                      <span className="truncate">{c.teacher}</span>
                      {tr && <span className="hidden xl:inline shrink-0">{tr.split("–")[0]}</span>}
                    </div>
                  </button>
                );
              })}

              {/* Exam Blocks */}
              {showExams &&
                timedWeekExams.map((pe, idx) => {
                  const hasCourseOverlap = weekCourses.some(
                    (c) =>
                      c.weekday === pe.weekday &&
                      c.start <= pe.end &&
                      c.end >= pe.start,
                  );
                  return (
                    <button
                      key={`grid-ex-${pe.exam.name}-${pe.exam.start}-${idx}`}
                      type="button"
                      onClick={() => setSelectedExam(pe)}
                      style={{
                        gridRow: `${pe.start + 1} / ${pe.end + 2}`,
                        gridColumn: pe.weekday + 1,
                      }}
                      className={cn(
                        "group relative text-left rounded-xl p-2 border border-rose-300 dark:border-rose-700/80 bg-rose-50/95 dark:bg-rose-950/75 text-rose-950 dark:text-rose-100 overflow-hidden transition-all hover:shadow-md hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-rose-500 flex flex-col justify-between z-20",
                        hasCourseOverlap && "w-[calc(50%-2px)] justify-self-end",
                      )}
                    >
                      <div className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-rose-500" />
                      <div className="relative z-10 pl-1.5 space-y-1">
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-[12px] font-bold leading-snug line-clamp-2">
                            {pe.exam.name}
                          </span>
                          <span className="px-1 py-0.2 rounded text-[10px] font-bold shrink-0 bg-rose-500 text-white">
                            考
                          </span>
                        </div>
                        <div className="text-[10.5px] font-medium opacity-85 leading-tight line-clamp-2">
                          {pe.exam.location || "地点待定"}
                          {pe.exam.seat ? ` · 座位 ${pe.exam.seat}` : ""}
                        </div>
                      </div>
                      <div className="relative z-10 pl-1.5 text-[10px] font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                        {pe.timeLabel}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
        <div className="px-4 py-2.5 border-t bg-[var(--surface-2)] text-[11px] text-[var(--text-muted)] flex flex-wrap items-center justify-between gap-2">
          <span>单击课程或考试卡片查看详情；双击任意空白格快速加课。</span>
          <span>个人修改保存在本机，刷新教务课表不会被覆盖。</span>
        </div>
      </div>

      {/* Exam Detail Modal */}
      <Modal
        open={Boolean(selectedExam)}
        onClose={() => setSelectedExam(null)}
        title={selectedExam?.exam.name}
        subtitle={
          selectedExam
            ? `第 ${selectedExam.week} 周 · 周${WEEKDAYS[selectedExam.weekday - 1]} (${selectedExam.dateStr}) · ${selectedExam.timeLabel}`
            : ""
        }
        maxWidth="max-w-md"
      >
        {selectedExam && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-[var(--surface-2)] border text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">考试地点</div>
                  <div className="font-semibold">{selectedExam.exam.location || "待定"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Armchair className="w-3.5 h-3.5 text-rose-500" />
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">座位号</div>
                  <div className="font-semibold">{selectedExam.exam.seat || "待定 / 免排座"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <Clock className="w-3.5 h-3.5 text-rose-500" />
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">时间与倒计时</div>
                  <div className="font-semibold tabular-nums">
                    {selectedExam.exam.start ? selectedExam.exam.start.replace("T", " ") : ""}
                    {selectedExam.exam.end ? ` – ${selectedExam.exam.end.slice(11)}` : ""}{" "}
                    ·{" "}
                    {(() => {
                      const cur = now.getTime();
                      if (selectedExam.endAt < cur) return "已结束";
                      if (selectedExam.startAt <= cur) return "正在考试";
                      const diff = selectedExam.startAt - cur;
                      const d = Math.floor(diff / 86400000);
                      const h = Math.floor((diff % 86400000) / 3600000);
                      const m = Math.floor((diff % 3600000) / 60000);
                      return d >= 1 ? `还有 ${d} 天 ${h} 小时` : `还有 ${h} 小时 ${m} 分`;
                    })()}
                  </div>
                </div>
              </div>
              {selectedExam.exam.kind && (
                <div className="col-span-2 text-[11px] text-[var(--text-muted)]">
                  考试类型：{selectedExam.exam.kind}
                  {selectedExam.exam.src === "custom" ? "（个人手动添加）" : ""}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              {onOpenExams && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedExam(null);
                    onOpenExams();
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors"
                >
                  查看全部考试安排
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedExam(null)}
                className="px-3.5 py-2 rounded-xl border text-xs font-medium hover:bg-[var(--surface-2)]"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Course Detail Modal */}
      <Modal
        open={Boolean(selectedCourse)}
        onClose={() => setSelectedCourse(null)}
        title={selectedCourse?.name}
        subtitle={
          selectedCourse
            ? `${formatCourseSlot(selectedCourse)} · ${formatWeeksList(selectedCourse.weeks)}`
            : ""
        }
        maxWidth="max-w-md"
      >
        {selectedCourse && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-[var(--surface-2)] border text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">上课地点</div>
                  <div className="font-semibold">{selectedCourse.location || "待定"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">任课教师</div>
                  <div className="font-semibold">{selectedCourse.teacher || "未标注"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">上课时间与来源</div>
                  <div className="font-semibold">
                    {getCourseTimeRange(selectedCourse, data.periods) || "节次时间未配置"} ·{" "}
                    {selectedCourse.src === "custom"
                      ? "个人自定义添加"
                      : selectedCourse.src === "edited"
                        ? "已修改的教务课程"
                        : selectedCourse.src === "cancelled"
                          ? "教务停课"
                          : selectedCourse.adj
                            ? `教务${selectedCourse.adj}`
                            : "教务官方课表"}
                  </div>
                </div>
              </div>
            </div>

            {selectedCourse.hint && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-800 dark:text-amber-200">
                {selectedCourse.hint}
              </div>
            )}

            {selectedCourse.src === "cancelled" ? (
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                教务显示本课程在第 {selectedCourse.weeks.join("、")} 周停课，其他周次照常上课。
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => openEditModal(selectedCourse)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  修改课程
                </button>
                {selectedCourse.src !== "edited" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSkipWeek(selectedCourse)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-medium hover:bg-[var(--surface-2)] transition-colors"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    第 {week} 周不上
                  </button>
                )}
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 ml-auto transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {selectedCourse.src === "edited" ? "恢复教务原样" : "隐藏/删除"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDeleteOrRestore(selectedCourse)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold ml-auto"
                  >
                    确认{selectedCourse.src === "edited" ? "恢复" : "删除"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Add / Edit Course Modal */}
      <Modal
        open={Boolean(formState)}
        onClose={() => setFormState(null)}
        title={formState?.mode === "add" ? "添加课程" : `修改「${formState?.course?.name}」`}
        maxWidth="max-w-lg"
      >
        {formState && (
          <form onSubmit={handleSubmitForm} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold mb-1">课程名称</label>
              <input
                type="text"
                required
                maxLength={60}
                value={formState.name}
                onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">上课地点</label>
                <input
                  type="text"
                  maxLength={60}
                  value={formState.location}
                  onChange={(e) => setFormState({ ...formState, location: e.target.value })}
                  placeholder="如 逸夫楼 A101"
                  className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">任课教师</label>
                <input
                  type="text"
                  maxLength={40}
                  value={formState.teacher}
                  onChange={(e) => setFormState({ ...formState, teacher: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">星期</label>
                <select
                  value={formState.weekday}
                  onChange={(e) =>
                    setFormState({ ...formState, weekday: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-sm"
                >
                  {WEEKDAYS.map((w, i) => (
                    <option key={w} value={i + 1}>
                      周{w}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">开始节</label>
                <select
                  value={formState.start}
                  onChange={(e) =>
                    setFormState({ ...formState, start: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-sm"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      第 {n} 节
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">结束节</label>
                <select
                  value={formState.end}
                  onChange={(e) =>
                    setFormState({ ...formState, end: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-sm"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      第 {n} 节
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(formState.mode === "add" || formState.course?.src === "custom") && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold">上课周次</span>
                  <div className="flex gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        setFormState({
                          ...formState,
                          weeks: Array.from({ length: maxWeek }, (_, i) => i + 1),
                        })
                      }
                      className="px-2 py-0.5 rounded bg-[var(--surface-2)] border"
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormState({
                          ...formState,
                          weeks: Array.from({ length: maxWeek }, (_, i) => i + 1).filter(
                            (w) => w % 2 === 1,
                          ),
                        })
                      }
                      className="px-2 py-0.5 rounded bg-[var(--surface-2)] border"
                    >
                      单周
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormState({
                          ...formState,
                          weeks: Array.from({ length: maxWeek }, (_, i) => i + 1).filter(
                            (w) => w % 2 === 0,
                          ),
                        })
                      }
                      className="px-2 py-0.5 rounded bg-[var(--surface-2)] border"
                    >
                      双周
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormState({ ...formState, weeks: [] })}
                      className="px-2 py-0.5 rounded bg-[var(--surface-2)] border"
                    >
                      清空
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: maxWeek }, (_, i) => i + 1).map((w) => {
                    const active = formState.weeks.includes(w);
                    return (
                      <button
                        key={w}
                        type="button"
                        onClick={() => {
                          const next = active
                            ? formState.weeks.filter((x) => x !== w)
                            : [...formState.weeks, w].sort((a, b) => a - b);
                          setFormState({ ...formState, weeks: next });
                        }}
                        className={cn(
                          "py-1.5 rounded-lg text-xs font-semibold tabular-nums border transition-colors",
                          active
                            ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                            : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                        )}
                      >
                        {w}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {formState.mode === "edit" && formState.course?.src === "official" && (
              <div className="flex items-center gap-4 text-xs pt-1">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={formState.scope === "week"}
                    onChange={() => setFormState({ ...formState, scope: "week" })}
                  />
                  仅修改本周（第 {week} 周）
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={formState.scope === "all"}
                    onChange={() => setFormState({ ...formState, scope: "all" })}
                  />
                  修改所有周
                </label>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFormState(null)}
                className="px-4 py-2 rounded-xl border text-xs font-medium"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold"
              >
                保存修改
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* My Schedule Edits Modal */}
      <Modal
        open={editsOpen}
        onClose={() => setEditsOpen(false)}
        title="我的课表修改与备份"
        subtitle={`当前学期 ${data.schedule_term || "未知"} · 已保存 ${data.schedule_edits || 0} 处修改`}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          {(data.schedule_ops || []).length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {data.schedule_ops.map((op) => (
                <div
                  key={op.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl border bg-[var(--surface-2)] text-xs"
                >
                  <span className="leading-snug">{describeOp(op)}</span>
                  <button
                    type="button"
                    onClick={() => postOverlay({ action: "remove", id: op.id }, "已撤销修改")}
                    className="px-2.5 py-1 rounded-lg border text-[11px] font-medium hover:text-rose-600 shrink-0"
                  >
                    撤销
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center rounded-xl border border-dashed text-xs text-[var(--text-muted)]">
              本学期尚未对教务课表进行过增删改操作。
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/schedule/overlay"
              download="superjlu-schedule-edits.json"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium hover:bg-[var(--surface-2)]"
            >
              <Download className="w-3.5 h-3.5" />
              导出 JSON 备份
            </a>

            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium hover:bg-[var(--surface-2)] cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              导入备份文件
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleImportFile}
                className="hidden"
              />
            </label>

            {(data.schedule_edits || 0) > 0 && (
              <button
                type="button"
                onClick={() => postOverlay({ action: "reset" }, "已恢复教务原样（可撤销）")}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 ml-auto"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                恢复教务原样
              </button>
            )}

            {data.schedule_can_undo_reset && (
              <button
                type="button"
                onClick={() => postOverlay({ action: "undo_reset" }, "已恢复之前的修改")}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-semibold ml-auto"
              >
                <Check className="w-3.5 h-3.5" />
                撤销恢复
              </button>
            )}
          </div>

          <div className="pt-2 border-t space-y-2">
            <label className="block text-xs font-medium text-[var(--text-muted)]">
              或者直接粘贴备份 JSON 内容导入：
            </label>
            <div className="flex gap-2">
              <textarea
                rows={2}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder='{"version": 2, "terms": ...}'
                className="flex-1 px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-xs font-mono outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const doc = JSON.parse(pasteText.trim());
                    const ok = await postOverlay({ action: "import", doc }, "备份已导入");
                    if (ok) setPasteText("");
                  } catch {
                    toast("JSON 格式无效", "error");
                  }
                }}
                className="px-3.5 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold shrink-0"
              >
                导入
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
