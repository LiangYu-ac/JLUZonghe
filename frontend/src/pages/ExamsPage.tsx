import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  Armchair,
  CheckCircle2,
  Sparkles,
  Plus,
  Download,
  CalendarDays,
  Edit3,
  Trash2,
} from "lucide-react";
import { apiPost } from "../lib/api";
import { exportIcsOnDevice, isNativeMobileApp } from "../lib/android";
import {
  isAllDayExam,
  mapExamToSchedule,
  parseExamDateTime,
  WEEKDAYS,
} from "../lib/schedule";
import type { AppSnapshot, ExamItem } from "../types/api";
import { EmptyState, Modal, StatusChip } from "../components/ui/Primitives";
import { cn } from "../lib/utils";

interface ExamFormState {
  mode: "add" | "edit";
  id?: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  seat: string;
  kind: string;
}

function examDelta(exam: ExamItem, now: Date) {
  const st = parseExamDateTime(exam.start);
  if (!st) return { state: "tbd" as const, label: "待定", days: 999, hours: 0, mins: 0 };
  const allDay = isAllDayExam(exam);
  const en = allDay
    ? new Date(st.getFullYear(), st.getMonth(), st.getDate(), 23, 59, 59)
    : parseExamDateTime(exam.end) || new Date(st.getTime() + 120 * 60000);
  const target = st.getTime();
  const endTs = en.getTime();
  const cur = now.getTime();
  if (endTs < cur) return { state: "past" as const, label: "已结束", days: -1, hours: 0, mins: 0 };
  const diff = Math.max(0, target - cur);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return {
    state: days <= 3 ? ("urgent" as const) : ("upcoming" as const),
    label: days >= 1 ? `${days} 天 ${hours} 小时` : `${hours} 小时 ${mins} 分`,
    days,
    hours,
    mins,
  };
}

function formatExamTime(e: ExamItem): string {
  if (!e.start) return "时间待定";
  if (isAllDayExam(e)) return `${e.start.slice(0, 10)}（时间待定）`;
  const s = e.start.replace("T", " ");
  return e.end ? `${s} – ${e.end.slice(11)}` : s;
}

export function ExamsPage({
  data,
  onSnapshotUpdate,
  onOpenScheduleWeek,
  toast,
}: {
  data: AppSnapshot;
  onSnapshotUpdate: (next: AppSnapshot) => void;
  onOpenScheduleWeek?: (week: number) => void;
  toast: (msg: string, tone?: "info" | "success" | "error") => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [showPast, setShowPast] = useState(false);
  const [formState, setFormState] = useState<ExamFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const { upcoming, past } = useMemo(() => {
    const u: ExamItem[] = [];
    const p: ExamItem[] = [];
    for (const e of data.exams || []) {
      const d = examDelta(e, now);
      if (d.state === "past") p.push(e);
      else u.push(e);
    }
    return { upcoming: u, past: p };
  }, [data.exams, now]);

  const datedCount = useMemo(
    () => (data.exams || []).filter((e) => Boolean(e.start)).length,
    [data.exams],
  );

  const nextExam = upcoming[0];
  const nextInfo = nextExam ? examDelta(nextExam, now) : null;
  const nextPlaced = nextExam
    ? mapExamToSchedule(nextExam, data.first_monday, data.periods)
    : null;

  function openAddModal() {
    setFormState({
      mode: "add",
      name: "",
      date: "",
      startTime: "09:00",
      endTime: "11:00",
      location: "",
      seat: "",
      kind: "期末考试",
    });
  }

  function openEditModal(e: ExamItem) {
    const allDay = isAllDayExam(e);
    const date = e.start ? e.start.slice(0, 10) : "";
    const startTime = e.start && e.start.length >= 16 && !allDay ? e.start.slice(11, 16) : "";
    const endTime = e.end && e.end.length >= 16 ? e.end.slice(11, 16) : "";
    setFormState({
      mode: "edit",
      id: e.id,
      name: e.name,
      date,
      startTime,
      endTime,
      location: e.location === "待定" ? "" : e.location || "",
      seat: e.seat || "",
      kind: e.kind || "",
    });
  }

  async function handleSaveForm(ev: React.FormEvent) {
    ev.preventDefault();
    if (!formState) return;
    const name = formState.name.trim();
    if (!name) return toast("请填写考试课程名称", "error");
    if (formState.endTime && !formState.startTime) {
      return toast("填写结束时间时请先填写开始时间", "error");
    }
    if (formState.date && !formState.startTime && formState.endTime) {
      return toast("请填写开始时间", "error");
    }
    if (formState.startTime && formState.endTime && formState.endTime < formState.startTime) {
      return toast("结束时间不能早于开始时间", "error");
    }

    const start = formState.date
      ? `${formState.date}T${formState.startTime || "00:00"}`
      : "";
    const end =
      formState.date && formState.endTime ? `${formState.date}T${formState.endTime}` : "";

    setBusy(true);
    try {
      const next = await apiPost<AppSnapshot>("/api/exams/custom", {
        action: formState.mode === "add" ? "add" : "update",
        id: formState.id,
        name,
        start,
        end,
        location: formState.location.trim(),
        seat: formState.seat.trim(),
        kind: formState.kind.trim(),
      });
      onSnapshotUpdate(next);
      setFormState(null);
      toast(formState.mode === "add" ? "已添加考试安排" : "已更新考试安排", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCustom(id: string) {
    if (armedDeleteId !== id) {
      setArmedDeleteId(id);
      setTimeout(() => setArmedDeleteId((cur) => (cur === id ? null : cur)), 3000);
      return;
    }
    setBusy(true);
    try {
      const next = await apiPost<AppSnapshot>("/api/exams/custom", {
        action: "delete",
        id,
      });
      onSnapshotUpdate(next);
      setArmedDeleteId(null);
      toast("已删除自定义考试安排");
    } catch (err) {
      toast(err instanceof Error ? err.message : "删除失败", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 animate-in">
      {nextExam && nextInfo && (
        <div
          className={cn(
            "surface-card p-6 border overflow-hidden relative",
            nextInfo.state === "urgent"
              ? "bg-gradient-to-br from-rose-500/10 via-amber-500/5 to-transparent border-rose-300/70 dark:border-rose-700/60"
              : "bg-gradient-to-br from-[var(--accent-soft)]/70 to-transparent",
          )}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={nextInfo.state === "urgent" ? "bad" : "accent"}>
                  {nextInfo.state === "urgent" ? "临近考试" : "下一场考试"}
                </StatusChip>
                {nextExam.kind && <StatusChip tone="neutral">{nextExam.kind}</StatusChip>}
                {nextPlaced && (
                  <StatusChip tone="neutral">
                    第 {nextPlaced.week} 周 · 周{WEEKDAYS[nextPlaced.weekday - 1]}
                  </StatusChip>
                )}
              </div>
              <h2 className="text-xl font-bold tracking-tight">{nextExam.name}</h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatExamTime(nextExam)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {nextExam.location || "地点待定"}
                </span>
                {nextExam.seat && (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Armchair className="w-3.5 h-3.5" />
                    座位 {nextExam.seat}
                  </span>
                )}
                {nextPlaced && onOpenScheduleWeek && (
                  <button
                    type="button"
                    onClick={() => onOpenScheduleWeek(nextPlaced.week)}
                    className="inline-flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    在课表中查看
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 tabular-nums shrink-0">
              <div className="px-4 py-2.5 rounded-2xl bg-[var(--surface)] border text-center min-w-[74px] shadow-sm">
                <div className="text-2xl font-extrabold text-[var(--accent)]">
                  {nextInfo.days}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">天</div>
              </div>
              <div className="px-4 py-2.5 rounded-2xl bg-[var(--surface)] border text-center min-w-[74px] shadow-sm">
                <div className="text-2xl font-extrabold">{nextInfo.hours}</div>
                <div className="text-[10px] text-[var(--text-muted)]">小时</div>
              </div>
              <div className="px-4 py-2.5 rounded-2xl bg-[var(--surface)] border text-center min-w-[74px] shadow-sm">
                <div className="text-2xl font-extrabold">{nextInfo.mins}</div>
                <div className="text-[10px] text-[var(--text-muted)]">分钟</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming List */}
      <div className="surface-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-bold">待考科目安排</h3>
            <StatusChip tone="accent">{upcoming.length} 场</StatusChip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {past.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPast((v) => !v)}
                className="px-3 py-1.5 rounded-xl border bg-[var(--surface-2)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                {showPast ? "隐藏已结束考试" : `查看已结束考试 (${past.length})`}
              </button>
            )}
            {datedCount > 0 ? (
              <a
                href="/api/ics?scope=exams"
                download="jlu-exams.ics"
                onClick={(e) => {
                  if (isNativeMobileApp()) {
                    e.preventDefault();
                    void exportIcsOnDevice("/api/ics?scope=exams", "jlu-exams.ics").catch(
                      (err) =>
                        toast(err instanceof Error ? err.message : "导出失败", "error"),
                    );
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-xs font-medium transition-colors"
                title="导出考试日历文件（含考前 30 分钟提醒）"
              >
                <Download className="w-3.5 h-3.5" />
                导出考试日历 (.ics)
              </a>
            ) : (
              <button
                type="button"
                onClick={() => toast("暂无带具体日期的考试可导出", "info")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-[var(--surface-2)] text-xs font-medium text-[var(--text-muted)] opacity-70"
              >
                <Download className="w-3.5 h-3.5" />
                导出考试日历 (.ics)
              </button>
            )}
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              添加考试
            </button>
          </div>
        </div>

        {upcoming.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {upcoming.map((e, idx) => {
              const info = examDelta(e, now);
              const placed = mapExamToSchedule(e, data.first_monday, data.periods);
              return (
                <div
                  key={`${e.id || e.name}-${e.start}-${idx}`}
                  className="p-4 rounded-xl border bg-[var(--surface-2)] flex items-center gap-4"
                >
                  <div
                    className={cn(
                      "w-16 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0 tabular-nums",
                      info.state === "urgent"
                        ? "bg-rose-500 text-white"
                        : "bg-[var(--accent-soft)] text-[var(--accent)]",
                    )}
                  >
                    <span className="text-xl font-extrabold leading-none">
                      {info.state === "tbd"
                        ? "?"
                        : info.days >= 1
                          ? info.days
                          : Math.max(1, info.hours)}
                    </span>
                    <span className="text-[10.5px] font-semibold mt-1">
                      {info.state === "tbd" ? "待定" : info.days >= 1 ? "天" : "小时"}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-bold truncate">{e.name}</span>
                      {e.src === "custom" && <StatusChip tone="warn">自定义</StatusChip>}
                      {placed && (
                        <StatusChip tone="neutral">
                          第 {placed.week} 周 · 周{WEEKDAYS[placed.weekday - 1]}
                        </StatusChip>
                      )}
                      {e.kind && <StatusChip tone="neutral">{e.kind}</StatusChip>}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] tabular-nums">
                      {formatExamTime(e)}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="truncate">{e.location || "地点待定"}</span>
                        {e.seat && <span className="shrink-0 font-semibold">座位 {e.seat}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {placed && onOpenScheduleWeek && (
                          <button
                            type="button"
                            onClick={() => onOpenScheduleWeek(placed.week)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border bg-[var(--surface)] text-[11px] font-semibold text-[var(--accent)] hover:border-[var(--accent)]"
                          >
                            <CalendarDays className="w-3 h-3" />
                            在课表中查看
                          </button>
                        )}
                        {e.src === "custom" && e.id && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(e)}
                              className="p-1 rounded-lg border bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
                              title="编辑自定义考试"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDeleteCustom(e.id!)}
                              className={cn(
                                "px-1.5 py-1 rounded-lg border text-[11px] font-medium transition-colors",
                                armedDeleteId === e.id
                                  ? "bg-rose-600 text-white border-rose-600"
                                  : "bg-[var(--surface)] text-rose-500 hover:border-rose-300",
                              )}
                              title="删除自定义考试"
                            >
                              {armedDeleteId === e.id ? "确认删" : <Trash2 className="w-3 h-3" />}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Sparkles className="w-6 h-6" />}
            title="暂无待考科目"
            description="教务公布考表后点右上角「刷新同步」会自动载入，也可以点右上角「添加考试」手动记录期中/随堂考试。"
          />
        )}
      </div>

      {/* Past Exams */}
      {showPast && past.length > 0 && (
        <div className="surface-card p-5 space-y-3 opacity-85">
          <h3 className="text-sm font-bold text-[var(--text-muted)]">已结束考试</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {past.map((e, idx) => {
              const placed = mapExamToSchedule(e, data.first_monday, data.periods);
              return (
                <div
                  key={`past-${e.id || e.name}-${idx}`}
                  className="p-3.5 rounded-xl border bg-[var(--surface-2)] flex items-center gap-3"
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold truncate">{e.name}</span>
                      {e.src === "custom" && <StatusChip tone="warn">自定义</StatusChip>}
                      {placed && (
                        <StatusChip tone="neutral">
                          第 {placed.week} 周 · 周{WEEKDAYS[placed.weekday - 1]}
                        </StatusChip>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] tabular-nums mt-0.5">
                      {formatExamTime(e)} · {e.location || "地点待定"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {placed && onOpenScheduleWeek && (
                      <button
                        type="button"
                        onClick={() => onOpenScheduleWeek(placed.week)}
                        className="px-2 py-1 rounded-lg border bg-[var(--surface)] text-[11px] font-medium text-[var(--accent)]"
                      >
                        课表
                      </button>
                    )}
                    {e.src === "custom" && e.id && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDeleteCustom(e.id!)}
                        className={cn(
                          "px-2 py-1 rounded-lg border text-[11px] font-medium",
                          armedDeleteId === e.id
                            ? "bg-rose-600 text-white border-rose-600"
                            : "bg-[var(--surface)] text-rose-500",
                        )}
                      >
                        {armedDeleteId === e.id ? "确认删" : <Trash2 className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add / Edit Custom Exam Modal */}
      <Modal
        open={Boolean(formState)}
        onClose={() => setFormState(null)}
        title={formState?.mode === "add" ? "添加自定义考试" : "编辑自定义考试"}
        subtitle="手动记录期中、随堂或补充考试（刷新教务考表不会被覆盖，并同步显示在课表与 .ics 日历中）"
        maxWidth="max-w-lg"
      >
        {formState && (
          <form onSubmit={handleSaveForm} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold mb-1">课程 / 考试名称</label>
              <input
                type="text"
                required
                maxLength={80}
                placeholder="例如 算法设计与分析（期中）"
                value={formState.name}
                onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">考试日期</label>
                <input
                  type="date"
                  value={formState.date}
                  onChange={(e) => setFormState({ ...formState, date: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">开始时间</label>
                <input
                  type="time"
                  value={formState.startTime}
                  onChange={(e) => setFormState({ ...formState, startTime: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">结束时间</label>
                <input
                  type="time"
                  value={formState.endTime}
                  onChange={(e) => setFormState({ ...formState, endTime: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">考场地点</label>
                <input
                  type="text"
                  maxLength={80}
                  placeholder="如 敬信楼 F301"
                  value={formState.location}
                  onChange={(e) => setFormState({ ...formState, location: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">座位号</label>
                <input
                  type="text"
                  maxLength={30}
                  placeholder="可选，如 28"
                  value={formState.seat}
                  onChange={(e) => setFormState({ ...formState, seat: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">考试类型</label>
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {["期末考试", "期中考试", "随堂测验", "补考/重修"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setFormState({ ...formState, kind: preset })}
                    className={cn(
                      "px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors",
                      formState.kind === preset
                        ? "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]"
                        : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                type="text"
                maxLength={40}
                placeholder="或自定义类型名称"
                value={formState.kind}
                onChange={(e) => setFormState({ ...formState, kind: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)] text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>

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
                className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-60"
              >
                {busy ? "保存中..." : "保存考试"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
