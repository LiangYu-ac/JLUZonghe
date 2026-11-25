import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Calendar,
  Clock,
  ExternalLink,
  GraduationCap,
  MapPin,
  Sparkles,
  TrendingUp,
  User,
  Armchair,
} from "lucide-react";
import { apiGet } from "../lib/api";
import { computeGradeTotals, computeSchemeSelection } from "../lib/grades";
import {
  findNextAgendaItem,
  formatCourseSlot,
  getCoursePalette,
  getCourseTimeRange,
  getMaxWeek,
  getPeriodMap,
  isAllDayExam,
  parseExamDateTime,
  WEEKDAYS,
  weekOfDate,
} from "../lib/schedule";
import type {
  AppSnapshot,
  CampusLink,
  ExamItem,
  OANoticeItem,
  OANoticesResponse,
  TabId,
} from "../types/api";
import { StatusChip } from "../components/ui/Primitives";
import { cn, roundNum } from "../lib/utils";

function greetingText(hour: number): string {
  if (hour < 6) return "夜深了，注意休息";
  if (hour < 11) return "早安，新的一天";
  if (hour < 14) return "午安，充实的一天";
  if (hour < 18) return "下午好，保持专注";
  return "晚上好，梳理今日收获";
}

export function DashboardPage({
  data,
  onNavigate,
  onOpenNotice,
  onOpenScheduleWeek,
}: {
  data: AppSnapshot;
  onNavigate: (tab: TabId) => void;
  onOpenNotice: (id: string) => void;
  onOpenScheduleWeek: (week: number) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [notices, setNotices] = useState<OANoticeItem[]>([]);
  const [links, setLinks] = useState<CampusLink[]>([]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    apiGet<OANoticesResponse>("/api/oa/notices?category=179577&limit=6")
      .then((res) => setNotices(res.items || []))
      .catch(() => setNotices([]));
    apiGet<{ links?: CampusLink[] }>("/api/links")
      .then((res) => setLinks((res.links || []).slice(0, 6)))
      .catch(() => setLinks([]));
  }, [data.updated]);

  const maxWeek = getMaxWeek(
    data.courses || [],
    data.calendar?.total_weeks,
    data.exams,
    data.first_monday,
  );
  const currentWeek = Math.min(Math.max(1, weekOfDate(data.first_monday, now)), maxWeek);
  const todayWeekday = now.getDay() === 0 ? 7 : now.getDay();
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayYmd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

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

  const todayCourses = useMemo(() => {
    return (data.courses || [])
      .filter(
        (c) =>
          c.src !== "cancelled" &&
          c.weekday === todayWeekday &&
          (c.weeks || []).includes(currentWeek),
      )
      .sort((a, b) => a.start - b.start);
  }, [data.courses, todayWeekday, currentWeek]);

  const todayExams = useMemo(() => {
    return (data.exams || []).filter((e) => (e.start || "").slice(0, 10) === todayYmd);
  }, [data.exams, todayYmd]);

  const todayAgenda = useMemo(() => {
    const pm = getPeriodMap(data.periods);
    const items: (
      | { kind: "course"; sortMins: number; course: (typeof todayCourses)[number] }
      | {
          kind: "exam";
          sortMins: number;
          exam: ExamItem;
          timeLabel: string;
          isNow: boolean;
        }
    )[] = [];

    for (const c of todayCourses) {
      const hm = pm[String(c.start)]?.[0] || "";
      const m = /^(\d{1,2}):(\d{2})/.exec(hm);
      const sortMins = m ? Number(m[1]) * 60 + Number(m[2]) : c.start * 60;
      items.push({ kind: "course", sortMins, course: c });
    }

    const cur = now.getTime();
    for (const e of todayExams) {
      const st = parseExamDateTime(e.start);
      if (!st) continue;
      const allDay = isAllDayExam(e);
      let en = parseExamDateTime(e.end);
      if (!allDay && (!en || en.getTime() <= st.getTime())) {
        en = new Date(st.getTime() + 120 * 60000);
      }
      const sortMins = allDay ? 0 : st.getHours() * 60 + st.getMinutes();
      const timeLabel = allDay
        ? "全天 / 待定"
        : `${pad(st.getHours())}:${pad(st.getMinutes())}–${pad(en!.getHours())}:${pad(en!.getMinutes())}`;
      const isNow =
        !allDay && en !== null && st.getTime() <= cur && cur <= en.getTime();
      items.push({ kind: "exam", sortMins, exam: e, timeLabel, isNow });
    }

    items.sort((a, b) => a.sortMins - b.sortMins);
    return items;
  }, [todayCourses, todayExams, data.periods, now]);

  const gradeSummary = useMemo(() => {
    const sel = computeSchemeSelection(
      data.grades || [],
      "__all__",
      data.schemes,
      data.scheme_rules,
    );
    return computeGradeTotals(data.grades || [], sel);
  }, [data.grades, data.schemes, data.scheme_rules]);

  const nextExam = useMemo(() => {
    const ts = now.getTime();
    return (data.exams || [])
      .filter((e) => {
        if (!e.start) return false;
        const en = parseExamDateTime(e.end || e.start);
        return en ? en.getTime() >= ts : false;
      })
      .sort((a, b) => a.start.localeCompare(b.start))[0];
  }, [data.exams, now]);

  const examCountdown = useMemo(() => {
    if (!nextExam?.start) return null;
    const st = parseExamDateTime(nextExam.start);
    if (!st) return null;
    const ms = Math.max(0, st.getTime() - now.getTime());
    const days = Math.floor(ms / 86400000);
    if (days >= 1) return `${days} 天`;
    const hours = Math.max(1, Math.ceil(ms / 3600000));
    return `${hours} 小时`;
  }, [nextExam, now]);

  const comp = data.completion;
  const compPct =
    comp?.required && comp.required > 0
      ? Math.min(100, Math.round(((comp.earned || 0) / comp.required) * 100))
      : 0;

  const dateLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 周${WEEKDAYS[todayWeekday - 1]}`;

  return (
    <div className="space-y-4 animate-in">
      {/* Greeting & Hero Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Hero Current/Next Class Banner */}
        <div className="lg:col-span-7 relative overflow-hidden rounded-2xl border bg-gradient-to-br from-[#2557D6] via-[#2D62E8] to-[#4338CA] text-white p-5 shadow-lg">
          <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute -left-8 -bottom-12 w-36 h-36 rounded-full bg-sky-300/15 blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col justify-between h-full gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-blue-100/90 flex items-center gap-2">
                  <span>{dateLabel}</span>
                  <span>·</span>
                  <span>第 {currentWeek} 周</span>
                  {data.calendar?.term && (
                    <>
                      <span>·</span>
                      <span>{data.calendar.term}</span>
                    </>
                  )}
                </div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight mt-1">
                  {greetingText(now.getHours())}
                </h2>
              </div>
              <div className="text-right tabular-nums">
                <div className="text-2xl font-bold tracking-tight">
                  {pad(now.getHours())}:{pad(now.getMinutes())}
                </div>
                <div className="text-[11px] text-blue-100/80">
                  今日共 {todayCourses.length} 节课程
                  {todayExams.length > 0 ? ` + ${todayExams.length} 场考试` : ""}
                </div>
              </div>
            </div>

            {nextHit ? (
              nextHit.itemType === "exam" ? (
                <div className="rounded-xl bg-white/12 backdrop-blur-md border border-white/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide",
                            nextHit.kind === "now"
                              ? "bg-emerald-400 text-emerald-950"
                              : "bg-rose-400 text-rose-950",
                          )}
                        >
                          {nextHit.kind === "now" ? "正在考试" : "下一场考试"}
                        </span>
                        <span className="text-xs text-blue-100 tabular-nums">
                          {nextHit.kind === "now"
                            ? `距离交卷还有 ${nextHit.mins} 分钟`
                            : nextHit.thisWeek
                              ? `本周 · ${nextHit.dateStr} ${nextHit.hm}`
                              : `第 ${nextHit.week} 周 · ${nextHit.dateStr} ${nextHit.hm}`}
                        </span>
                      </div>
                      <div className="text-lg font-bold truncate">
                        {nextHit.exam.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-blue-100/90">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {nextHit.exam.location || "地点待定"}
                        </span>
                        {nextHit.exam.seat && (
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Armchair className="w-3.5 h-3.5" />
                            座位 {nextHit.exam.seat}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock className="w-3.5 h-3.5" />
                          {nextHit.dateStr} {nextHit.hm}–{nextHit.endHm}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        data.first_monday
                          ? onOpenScheduleWeek(nextHit.week)
                          : onNavigate("exams")
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-[#1E40AF] text-xs font-bold shadow-sm hover:bg-blue-50 transition-colors shrink-0"
                    >
                      定位考表
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {nextHit.kind === "now" && (
                    <div className="mt-3 h-1.5 rounded-full bg-white/20 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-300 transition-all duration-500"
                        style={{ width: `${nextHit.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-white/12 backdrop-blur-md border border-white/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide",
                            nextHit.kind === "now"
                              ? "bg-emerald-400 text-emerald-950"
                              : "bg-white/20 text-white",
                          )}
                        >
                          {nextHit.kind === "now" ? "正在上课" : "下一节课"}
                        </span>
                        <span className="text-xs text-blue-100 tabular-nums">
                          {nextHit.kind === "now"
                            ? `距离下课还有 ${nextHit.mins} 分钟`
                            : nextHit.thisWeek
                              ? `${formatCourseSlot(nextHit.course)} · ${nextHit.hm}`
                              : `第 ${nextHit.week} 周 · ${formatCourseSlot(nextHit.course)}`}
                        </span>
                      </div>
                      <div className="text-lg font-bold truncate">
                        {nextHit.course.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-blue-100/90">
                        {nextHit.course.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {nextHit.course.location}
                          </span>
                        )}
                        {nextHit.course.teacher && (
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3.5 h-3.5" />
                            {nextHit.course.teacher}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock className="w-3.5 h-3.5" />
                          {nextHit.hm}–{nextHit.endHm}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenScheduleWeek(nextHit.week)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-[#1E40AF] text-xs font-bold shadow-sm hover:bg-blue-50 transition-colors shrink-0"
                    >
                      定位课表
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {nextHit.kind === "now" && (
                    <div className="mt-3 h-1.5 rounded-full bg-white/20 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-300 transition-all duration-500"
                        style={{ width: `${nextHit.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="rounded-xl bg-white/12 backdrop-blur-md border border-white/20 p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">当前暂无即将开始的课程</div>
                  <div className="text-xs text-blue-100/80 mt-0.5">
                    {(data.courses || []).length
                      ? "本学期剩余课程已全部完成，可以去看看考试安排或自习教室。"
                      : "登录后点击右上角「刷新同步」，即可加载个人课表。"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate("schedule")}
                  className="px-3.5 py-2 rounded-xl bg-white text-[#1E40AF] text-xs font-bold shrink-0"
                >
                  查看课表
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: 4 Bento KPI Cards */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-3.5">
          {/* GPA Card */}
          <button
            type="button"
            onClick={() => onNavigate("grades")}
            className="surface-card p-4 text-left hover:border-[var(--border-strong)] hover:-translate-y-0.5 transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-muted)]">全科加权绩点</span>
              <span className="w-7 h-7 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight tabular-nums">
                {gradeSummary.point != null ? gradeSummary.point.toFixed(3) : "—"}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-1 tabular-nums">
                加权均分 {gradeSummary.score != null ? gradeSummary.score.toFixed(2) : "—"} ·{" "}
                {roundNum(gradeSummary.credits, 1)} 学分
              </div>
            </div>
          </button>

          {/* Academic Ring Card */}
          <button
            type="button"
            onClick={() => onNavigate("academic")}
            className="surface-card p-4 text-left hover:border-[var(--border-strong)] hover:-translate-y-0.5 transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-muted)]">培养方案进度</span>
              <span className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <GraduationCap className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <div>
                <div className="text-2xl font-bold tracking-tight tabular-nums">
                  {comp ? `${compPct}%` : "—"}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-1 tabular-nums">
                  {comp
                    ? `${roundNum(comp.earned, 1)} / ${roundNum(comp.required, 1)} 学分`
                    : "尚未同步"}
                </div>
              </div>
              <svg className="w-10 h-10 -rotate-90 shrink-0" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  className="text-slate-200 dark:text-slate-800"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeDasharray={`${compPct * 0.88} 100`}
                  strokeLinecap="round"
                  className="text-emerald-500"
                />
              </svg>
            </div>
          </button>

          {/* Nearest Exam Card */}
          <button
            type="button"
            onClick={() => onNavigate("exams")}
            className="surface-card p-4 text-left hover:border-[var(--border-strong)] hover:-translate-y-0.5 transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-muted)]">最近考试</span>
              <span className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight tabular-nums">
                {examCountdown || "暂无"}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-1 truncate">
                {nextExam
                  ? `${nextExam.name} · ${nextExam.location}`
                  : "当前没有待考科目"}
              </div>
            </div>
          </button>

          {/* Quick Empty Rooms Shortcut */}
          <button
            type="button"
            onClick={() => onNavigate("rooms")}
            className="surface-card p-4 text-left hover:border-[var(--border-strong)] hover:-translate-y-0.5 transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-muted)]">自习空教室</span>
              <span className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="mt-3">
              <div className="text-sm font-bold text-[var(--text)]">一键查找空闲教室</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-1 flex items-center gap-1">
                支持全天 12 节空闲透视
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Lower Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Today's Timeline */}
        <div className="lg:col-span-6 surface-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-sm font-bold">今日日程安排</h3>
              <StatusChip tone="accent">第 {currentWeek} 周 · 周{WEEKDAYS[todayWeekday - 1]}</StatusChip>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("schedule")}
              className="text-xs font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1"
            >
              完整周课表 <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {todayAgenda.length > 0 ? (
            <div className="space-y-2.5">
              {todayAgenda.map((item, idx) => {
                if (item.kind === "exam") {
                  const ex = item.exam;
                  return (
                    <div
                      key={`today-ex-${ex.name}-${ex.start}-${idx}`}
                      className={cn(
                        "flex items-center gap-3.5 p-3 rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50/70 dark:bg-rose-950/25 transition-colors",
                        item.isNow && "ring-1 ring-rose-400",
                      )}
                    >
                      <div className="w-1 self-stretch rounded-full shrink-0 bg-rose-500" />
                      <div className="w-20 shrink-0 tabular-nums">
                        <div className="text-xs font-bold text-rose-700 dark:text-rose-300">
                          {isAllDayExam(ex) ? "全天考试" : "考试时间"}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">{item.timeLabel}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                          {ex.name}
                          <StatusChip tone="bad">考试</StatusChip>
                          {item.isNow && <StatusChip tone="ok">正在考试</StatusChip>}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-3 truncate">
                          <span>{ex.location || "地点待定"}</span>
                          {ex.seat && <span>座位 {ex.seat}</span>}
                        </div>
                      </div>
                    </div>
                  );
                }

                const c = item.course;
                const pal = getCoursePalette(c.name);
                const tr = getCourseTimeRange(c, data.periods);
                const isNow =
                  nextHit?.itemType === "course" &&
                  nextHit.kind === "now" &&
                  nextHit.course.name === c.name &&
                  nextHit.course.start === c.start;
                return (
                  <div
                    key={`${c.name}-${c.start}-${idx}`}
                    className={cn(
                      "flex items-center gap-3.5 p-3 rounded-xl border bg-[var(--surface-2)] transition-colors",
                      isNow && "border-[var(--accent)] ring-1 ring-[var(--accent-soft)]",
                    )}
                  >
                    <div
                      className="w-1 self-stretch rounded-full shrink-0"
                      style={{ backgroundColor: pal.stripe }}
                    />
                    <div className="w-20 shrink-0 tabular-nums">
                      <div className="text-xs font-bold">
                        第 {c.start}–{c.end} 节
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">{tr || "时间待定"}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                        {c.name}
                        {c.adj && <StatusChip tone="warn">{c.adj}</StatusChip>}
                        {isNow && <StatusChip tone="ok">正在上课</StatusChip>}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-3 truncate">
                        <span>{c.location || "地点待定"}</span>
                        {c.teacher && <span>{c.teacher}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-10 text-center">
              <BookOpen className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-50" />
              <div className="text-sm font-medium text-[var(--text)]">今天没有安排课程或考试</div>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                适合在图书馆或空教室自主学习，也可以复盘近期成绩。
              </p>
            </div>
          )}
        </div>

        {/* Right: Latest Notices + Quick Links */}
        <div className="lg:col-span-6 space-y-4">
          <div className="surface-card p-4">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-sm font-bold">最新校内通知</h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("notices")}
                className="text-xs font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1"
              >
                全部通知 <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {notices.length > 0 ? (
              <div className="divide-y">
                {notices.slice(0, 5).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onOpenNotice(n.id)}
                    className="w-full py-2.5 text-left hover:bg-[var(--surface-2)] px-2 -mx-2 rounded-lg transition-colors flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium line-clamp-1 flex items-center gap-1.5">
                        {n.top && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-bold shrink-0">
                            置顶
                          </span>
                        )}
                        <span className="truncate">{n.title}</span>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                        {n.dept || "校内通知"} {n.time ? `· ${n.time.slice(0, 10)}` : ""}
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 mt-1" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                暂无本地缓存通知，前往「校园通知」更新校内最新公告。
              </div>
            )}
          </div>

          <div className="surface-card p-4">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-bold">常用校园服务</h3>
              <button
                type="button"
                onClick={() => onNavigate("services")}
                className="text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                管理与网络检测
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {links.map((lk) => (
                <a
                  key={lk.id}
                  href={lk.sso_url || lk.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/50 transition-all group"
                >
                  <span className="text-xs font-semibold truncate">{lk.name}</span>
                  <ExternalLink className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--accent)] shrink-0" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
