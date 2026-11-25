import type { CourseItem, ExamItem, ScheduleOp } from "../types/api";

export const DEFAULT_PERIODS: Record<string, [string, string]> = {
  "1": ["08:00", "08:45"],
  "2": ["08:55", "09:40"],
  "3": ["10:00", "10:45"],
  "4": ["10:55", "11:40"],
  "5": ["13:30", "14:15"],
  "6": ["14:25", "15:10"],
  "7": ["15:30", "16:15"],
  "8": ["16:25", "17:10"],
  "9": ["18:30", "19:15"],
  "10": ["19:25", "20:10"],
  "11": ["20:20", "21:05"],
  "12": ["21:15", "22:00"],
};

export const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export interface CourseColorPalette {
  bg: string;
  bgDark: string;
  border: string;
  text: string;
  textDark: string;
  stripe: string;
}

export const COURSE_PALETTES: CourseColorPalette[] = [
  { bg: "#EEF3FF", bgDark: "rgba(59, 130, 246, 0.16)", border: "#BBD0FF", text: "#1E40AF", textDark: "#93C5FD", stripe: "#2557D6" },
  { bg: "#ECFDF5", bgDark: "rgba(16, 185, 129, 0.16)", border: "#A7F3D0", text: "#065F46", textDark: "#6EE7B7", stripe: "#0D9488" },
  { bg: "#F5F3FF", bgDark: "rgba(139, 92, 246, 0.17)", border: "#DDD6FE", text: "#5B21B6", textDark: "#C4B5FD", stripe: "#7C3AED" },
  { bg: "#FFF7ED", bgDark: "rgba(249, 115, 22, 0.16)", border: "#FED7AA", text: "#9A3412", textDark: "#FDBA74", stripe: "#EA580C" },
  { bg: "#FFF1F2", bgDark: "rgba(244, 63, 94, 0.16)", border: "#FECDD3", text: "#9F1239", textDark: "#FDA4AF", stripe: "#E11D48" },
  { bg: "#ECFEFF", bgDark: "rgba(6, 182, 212, 0.16)", border: "#A5F3FC", text: "#155E75", textDark: "#67E8F9", stripe: "#0891B2" },
  { bg: "#FEFCE8", bgDark: "rgba(234, 179, 8, 0.15)", border: "#FEF08A", text: "#854D0E", textDark: "#FDE047", stripe: "#CA8A04" },
  { bg: "#FDF4FF", bgDark: "rgba(217, 70, 239, 0.15)", border: "#F5D0FE", text: "#86198F", textDark: "#F0ABFC", stripe: "#C026D3" },
  { bg: "#F0FDFA", bgDark: "rgba(20, 184, 166, 0.16)", border: "#99F6E4", text: "#115E59", textDark: "#5EEAD4", stripe: "#0F766E" },
  { bg: "#EEF2FF", bgDark: "rgba(99, 102, 241, 0.16)", border: "#C7D2FE", text: "#3730A3", textDark: "#A5B4FC", stripe: "#4F46E5" },
];

export function getCoursePalette(name: string): CourseColorPalette {
  let h = 0;
  for (const ch of name) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return COURSE_PALETTES[h % COURSE_PALETTES.length];
}

export function getPeriodMap(periods?: Record<string, [string, string]>): Record<string, [string, string]> {
  return { ...DEFAULT_PERIODS, ...(periods || {}) };
}

export function getCourseTimeRange(
  c: Pick<CourseItem, "start" | "end">,
  periods?: Record<string, [string, string]>,
): string {
  const pm = getPeriodMap(periods);
  const a = pm[String(c.start)];
  const b = pm[String(c.end)];
  if (a?.[0] && b?.[1]) return `${a[0]}–${b[1]}`;
  return "";
}

export function formatCourseSlot(c: Pick<CourseItem, "weekday" | "start" | "end">): string {
  const w = WEEKDAYS[(c.weekday || 1) - 1] || "?";
  return `周${w} 第${c.start}${c.end !== c.start ? `-${c.end}` : ""}节`;
}

export function formatWeeksList(ws: number[]): string {
  const list = [...new Set(ws || [])].filter((n) => n > 0).sort((a, b) => a - b);
  if (!list.length) return "";
  if (list.length >= 3 && list.every((w, i) => i === 0 || w - list[i - 1] === 2)) {
    return `第${list[0]}-${list[list.length - 1]}周（${list[0] % 2 ? "单" : "双"}周）`;
  }
  const parts: string[] = [];
  let start = list[0];
  let prev = list[0];
  for (const w of [...list.slice(1), null]) {
    if (w === prev + 1) {
      prev = w;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`);
    if (w !== null) {
      start = w;
      prev = w;
    }
  }
  return `第${parts.join("、")}周`;
}

export function weekOfDate(firstMonday: string | null | undefined, date = new Date()): number {
  if (!firstMonday) return 1;
  const d0 = new Date(`${firstMonday.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d0.getTime())) return 1;
  return Math.floor((date.getTime() - d0.getTime()) / 86400000 / 7) + 1;
}

export function getMaxWeek(
  courses: CourseItem[],
  calendarTotalWeeks?: number,
  exams?: ExamItem[],
  firstMonday?: string | null,
): number {
  const fromCourses = courses.flatMap((c) => c.weeks || []);
  const fromExams = (exams || [])
    .map((e) => mapExamToSchedule(e, firstMonday)?.week || 0)
    .filter((w) => w >= 1 && w <= 30);
  return Math.max(calendarTotalWeeks || 16, ...fromCourses, ...fromExams, 16);
}

export interface NextClassHit {
  kind: "now" | "next";
  course: CourseItem;
  week: number;
  hm: string;
  endHm: string;
  ymd: string;
  mins: number;
  progress: number;
  thisWeek: boolean;
  startAt: number;
  endAt: number;
}

function toMins(t?: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

export function findNextClass(
  courses: CourseItem[],
  periods: Record<string, [string, string]> | undefined,
  firstMonday: string | null | undefined,
  now = new Date(),
  maxW = 30,
): NextClassHit | null {
  if (!firstMonday) return null;
  const fm = new Date(`${firstMonday.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(fm.getTime())) return null;
  const pm = getPeriodMap(periods);
  const cur = now.getTime();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekNow = Math.floor((todayMidnight.getTime() - fm.getTime()) / 86400000 / 7) + 1;
  const pad = (n: number) => String(n).padStart(2, "0");

  let best: NextClassHit | null = null;

  for (const c of courses) {
    if (!c || c.src === "cancelled") continue;
    const wd = Number(c.weekday);
    const a = Number(c.start);
    const b = Number(c.end || a);
    if (!(wd >= 1 && wd <= 7 && a >= 1 && b >= a)) continue;
    const sm = toMins(pm[String(a)]?.[0]);
    const em = toMins(pm[String(b)]?.[1]);
    if (!(sm >= 0) || !(em > sm)) continue;

    for (const w of c.weeks || []) {
      if (!(w >= 1 && w <= maxW)) continue;
      const day = new Date(fm.getFullYear(), fm.getMonth(), fm.getDate() + (w - 1) * 7 + wd - 1);
      const st = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(sm / 60), sm % 60).getTime();
      const en = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(em / 60), em % 60).getTime();
      if (en <= cur) continue;

      const isNow = st <= cur;
      const mins = isNow
        ? Math.ceil((en - cur) / 60000)
        : Math.max(0, Math.round((st - cur) / 60000));
      const progress = isNow ? Math.min(100, Math.max(2, ((cur - st) / (en - st)) * 100)) : 0;
      const ymd = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
      const hm = `${pad(Math.floor(sm / 60))}:${pad(sm % 60)}`;
      const endHm = `${pad(Math.floor(em / 60))}:${pad(em % 60)}`;

      const candidate: NextClassHit = {
        kind: isNow ? "now" : "next",
        course: c,
        week: w,
        hm,
        endHm,
        ymd,
        mins,
        progress,
        thisWeek: w === weekNow,
        startAt: st,
        endAt: en,
      };

      if (!best) {
        best = candidate;
        continue;
      }
      if (candidate.kind === "now" && best.kind !== "now") {
        best = candidate;
      } else if (candidate.kind === best.kind) {
        if (candidate.kind === "now") {
          if (candidate.endAt < best.endAt) best = candidate;
        } else if (candidate.startAt < best.startAt) {
          best = candidate;
        }
      }
    }
  }
  return best;
}

export interface PlacedExam {
  exam: ExamItem;
  week: number;
  weekday: number;
  start: number;
  end: number;
  allDay: boolean;
  timeLabel: string;
  dateStr: string;
  startAt: number;
  endAt: number;
}

const EXAM_DT_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

export function parseExamDateTime(iso?: string): Date | null {
  const s = (iso || "").trim();
  const m = EXAM_DT_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = m[4] !== undefined ? Number(m[4]) : 0;
  const mi = m[5] !== undefined ? Number(m[5]) : 0;
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

export function isAllDayExam(exam: ExamItem): boolean {
  const rawStart = (exam.start || "").trim();
  const rawEnd = (exam.end || "").trim();
  const m = EXAM_DT_RE.exec(rawStart);
  if (!m) return false;
  const hasClock = m[4] !== undefined && m[5] !== undefined;
  const midnightZero = hasClock && Number(m[4]) === 0 && Number(m[5]) === 0;
  return (!hasClock || midnightZero) && !rawEnd;
}

export function mapExamToSchedule(
  exam: ExamItem,
  firstMonday: string | null | undefined,
  periods?: Record<string, [string, string]>,
): PlacedExam | null {
  if (!firstMonday) return null;
  const fm = parseExamDateTime(firstMonday.slice(0, 10));
  const st = parseExamDateTime(exam.start);
  if (!fm || !st) return null;

  const fmMid = new Date(fm.getFullYear(), fm.getMonth(), fm.getDate()).getTime();
  const stMid = new Date(st.getFullYear(), st.getMonth(), st.getDate()).getTime();
  const diffDays = Math.round((stMid - fmMid) / 86400000);
  if (diffDays < 0) return null;

  const week = Math.floor(diffDays / 7) + 1;
  const weekday = (diffDays % 7) + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${st.getMonth() + 1}/${st.getDate()}`;

  const allDay = isAllDayExam(exam);
  if (allDay) {
    const dayEnd = new Date(st.getFullYear(), st.getMonth(), st.getDate(), 23, 59, 59, 999);
    return {
      exam,
      week,
      weekday,
      start: 1,
      end: 1,
      allDay: true,
      timeLabel: "全天/时间待定",
      dateStr,
      startAt: stMid,
      endAt: dayEnd.getTime(),
    };
  }

  let en = parseExamDateTime(exam.end);
  if (!en || en.getTime() <= st.getTime()) {
    en = new Date(st.getTime() + 120 * 60000);
  }
  const startMins = st.getHours() * 60 + st.getMinutes();
  const sameDayEndMins =
    en.getFullYear() === st.getFullYear() &&
    en.getMonth() === st.getMonth() &&
    en.getDate() === st.getDate()
      ? en.getHours() * 60 + en.getMinutes()
      : Math.min(24 * 60, startMins + 120);
  const endMins = Math.max(startMins + 30, sameDayEndMins);

  const pm = getPeriodMap(periods);
  const periodNums = Object.keys(pm)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 1)
    .sort((a, b) => a - b);

  const spans = periodNums
    .map((p) => ({
      p,
      ps: toMins(pm[String(p)]?.[0]),
      pe: toMins(pm[String(p)]?.[1]),
    }))
    .filter((x) => x.ps >= 0 && x.pe > x.ps);

  let matched = spans
    .filter((x) => Math.min(endMins, x.pe) - Math.max(startMins, x.ps) >= 15)
    .map((x) => x.p);

  if (!matched.length) {
    matched = spans
      .filter((x) => Math.min(endMins, x.pe) - Math.max(startMins, x.ps) > 0)
      .map((x) => x.p);
  }

  let startPeriod = 1;
  let endPeriod = 2;
  if (matched.length) {
    startPeriod = Math.min(...matched);
    endPeriod = Math.max(...matched);
  } else if (spans.length) {
    const examMid = (startMins + endMins) / 2;
    let nearest = spans[0].p;
    let bestDist = Infinity;
    for (const sp of spans) {
      const dist = Math.abs((sp.ps + sp.pe) / 2 - examMid);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = sp.p;
      }
    }
    startPeriod = nearest;
    const maxDefined = spans[spans.length - 1].p;
    endPeriod = endMins - startMins >= 90 ? Math.min(maxDefined, nearest + 1) : nearest;
  }

  const timeLabel = `${pad(st.getHours())}:${pad(st.getMinutes())}–${pad(en.getHours())}:${pad(en.getMinutes())}`;
  return {
    exam,
    week,
    weekday,
    start: startPeriod,
    end: endPeriod,
    allDay: false,
    timeLabel,
    dateStr,
    startAt: st.getTime(),
    endAt: en.getTime(),
  };
}

export function placeExamsOnSchedule(
  exams: ExamItem[],
  firstMonday: string | null | undefined,
  periods?: Record<string, [string, string]>,
): PlacedExam[] {
  const out: PlacedExam[] = [];
  for (const exam of exams || []) {
    const placed = mapExamToSchedule(exam, firstMonday, periods);
    if (placed) out.push(placed);
  }
  return out;
}

export type NextAgendaHit =
  | ({ itemType: "course" } & NextClassHit)
  | {
      itemType: "exam";
      kind: "now" | "next";
      exam: ExamItem;
      week: number;
      hm: string;
      endHm: string;
      ymd: string;
      dateStr: string;
      mins: number;
      progress: number;
      thisWeek: boolean;
      startAt: number;
      endAt: number;
    };

export function findNextAgendaItem(
  courses: CourseItem[],
  exams: ExamItem[],
  periods: Record<string, [string, string]> | undefined,
  firstMonday: string | null | undefined,
  now = new Date(),
  maxW = 30,
): NextAgendaHit | null {
  const classHit = findNextClass(courses, periods, firstMonday, now, maxW);
  let best: NextAgendaHit | null = classHit ? { itemType: "course", ...classHit } : null;

  const cur = now.getTime();
  const pad = (n: number) => String(n).padStart(2, "0");
  const weekNow = firstMonday ? weekOfDate(firstMonday, now) : 1;

  for (const exam of exams || []) {
    if (!exam.start || isAllDayExam(exam)) continue;
    const stDt = parseExamDateTime(exam.start);
    if (!stDt) continue;
    let enDt = parseExamDateTime(exam.end);
    if (!enDt || enDt.getTime() <= stDt.getTime()) {
      enDt = new Date(stDt.getTime() + 120 * 60000);
    }
    const st = stDt.getTime();
    const en = enDt.getTime();
    if (en <= cur) continue;

    const isNow = st <= cur;
    const mins = isNow
      ? Math.ceil((en - cur) / 60000)
      : Math.max(0, Math.round((st - cur) / 60000));
    const progress = isNow ? Math.min(100, Math.max(2, ((cur - st) / (en - st)) * 100)) : 0;
    const placed = mapExamToSchedule(exam, firstMonday, periods);
    const week = placed?.week ?? 1;
    const ymd = `${stDt.getFullYear()}-${pad(stDt.getMonth() + 1)}-${pad(stDt.getDate())}`;
    const hm = `${pad(stDt.getHours())}:${pad(stDt.getMinutes())}`;
    const endHm = `${pad(enDt.getHours())}:${pad(enDt.getMinutes())}`;
    const dateStr = `${stDt.getMonth() + 1}/${stDt.getDate()}`;

    const candidate: NextAgendaHit = {
      itemType: "exam",
      kind: isNow ? "now" : "next",
      exam,
      week,
      hm,
      endHm,
      ymd,
      dateStr,
      mins,
      progress,
      thisWeek: Boolean(firstMonday) && week === weekNow,
      startAt: st,
      endAt: en,
    };

    if (!best) {
      best = candidate;
      continue;
    }
    if (candidate.kind === "now" && best.kind !== "now") {
      best = candidate;
    } else if (candidate.kind === best.kind) {
      if (candidate.kind === "now") {
        if (candidate.endAt <= best.endAt) best = candidate;
      } else if (candidate.startAt <= best.startAt) {
        best = candidate;
      }
    }
  }

  return best;
}

export function describeOp(o: ScheduleOp): string {
  const fields: Record<string, string> = {
    name: "课程名",
    location: "地点",
    teacher: "教师",
    weekday: "星期",
    start: "开始节",
    end: "结束节",
  };
  if (o.op === "add") {
    const c = o.course || {};
    return `添加「${c.name || "课程"}」 · ${formatCourseSlot({ weekday: c.weekday || 1, start: c.start || 1, end: c.end || 1 })} · ${formatWeeksList(c.weeks || [])}`;
  }
  const m = /^(.*)\|(\d+)\|(\d+)-(\d+)$/.exec(o.target || "");
  const name = m ? m[1] : o.target || "";
  const slot = m ? formatCourseSlot({ weekday: Number(m[2]), start: Number(m[3]), end: Number(m[4]) }) : "";
  const when = o.weeks?.length ? formatWeeksList(o.weeks) : "所有周";
  if (o.op === "hide") return `隐藏「${name}」${slot ? ` (${slot})` : ""} · ${when}`;
  const set = o.set || {};
  const changes = Object.keys(set)
    .map((k) => {
      const v = set[k];
      if (k === "weekday") return `星期改为周${WEEKDAYS[Number(v) - 1] || v}`;
      if (k === "start" || k === "end") return `${fields[k]}改为第${v}节`;
      return `${fields[k] || k}改为 ${v}`;
    })
    .join("，");
  return `修改「${name}」${when}：${changes}`;
}
