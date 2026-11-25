import { placeExamsOnSchedule } from "./schedule";
import type { AppSnapshot, ThemeMode } from "../types/api";

export interface AndroidBridge {
  appVersion?: () => string;
  setBars?: (theme: string) => void;
  setBarColors?: (bg: string, nav: string, dark: boolean) => void;
  saveWidgetData?: (json: string) => void;
  lockNotifyEnabled?: () => boolean;
  setLockNotify?: (on: boolean) => void;
  requestBatteryExemption?: () => void;
  openAutostartSettings?: () => void;
  backgroundHint?: () => string;
  canPinWidget?: () => boolean;
  pinWidget?: (kind: number) => void;
  brandLabel?: () => string;
  shareIcs?: (body: string) => void;
}

export interface IosBridgeHandler {
  postMessage: (payload: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    SuperJLU?: AndroidBridge;
    webkit?: {
      messageHandlers?: {
        SuperJLUiOS?: IosBridgeHandler;
      };
    };
  }
}

function getIosBridge(): IosBridgeHandler | undefined {
  return typeof window !== "undefined"
    ? window.webkit?.messageHandlers?.SuperJLUiOS
    : undefined;
}

export function isAndroidApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.SuperJLU);
}

export function isIosApp(): boolean {
  return Boolean(getIosBridge());
}

export function isNativeMobileApp(): boolean {
  return isAndroidApp() || isIosApp();
}

export function syncAndroidBars(theme: ThemeMode, isDark: boolean): void {
  const bg = isDark ? "#0b1120" : "#f6f8fc";
  const nav = isDark ? "#111827" : "#ffffff";
  const bridge = typeof window !== "undefined" ? window.SuperJLU : undefined;
  if (bridge) {
    try {
      bridge.setBarColors?.(bg, nav, isDark);
      bridge.setBars?.(theme);
    } catch {}
  }
  const ios = getIosBridge();
  if (ios) {
    try {
      ios.postMessage({ action: "setBarColors", bg, nav, dark: isDark, theme });
    } catch {}
  }
}

export function buildWidgetPayload(data: AppSnapshot) {
  const rawFm = (data.first_monday || "").trim();
  const fm = rawFm.length >= 10 ? rawFm.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fm)) return null;

  const validPeriods: Record<string, [string, string]> = {};
  for (const [k, v] of Object.entries(data.periods || {})) {
    if (
      /^\d+$/.test(k) &&
      Array.isArray(v) &&
      v.length >= 2 &&
      /^\d{1,2}:\d{2}/.test(v[0]) &&
      /^\d{1,2}:\d{2}/.test(v[1])
    ) {
      validPeriods[k] = [v[0], v[1]];
    }
  }

  const activeCourses = (data.courses || [])
    .filter((c) => {
      if (!c || c.src === "cancelled") return false;
      const wd = Number(c.weekday);
      const st = Number(c.start);
      return Number.isInteger(wd) && wd >= 1 && wd <= 7 && Number.isInteger(st) && st >= 1;
    })
    .map((c) => ({
      name: c.name,
      location: c.location || "",
      teacher: c.teacher || "",
      weekday: Number(c.weekday),
      start: Number(c.start),
      end: Math.max(Number(c.start), Number(c.end || c.start)),
      weeks: (c.weeks || [])
        .map(Number)
        .filter((w) => Number.isInteger(w) && w >= 1),
    }));

  const mappedExamEntries = placeExamsOnSchedule(
    data.exams || [],
    fm,
    data.periods,
  )
    .filter((pe) => !pe.allDay)
    .map((pe) => ({
      name: `[考试] ${pe.exam.name}`,
      location:
        (pe.exam.location || "地点待定") +
        (pe.exam.seat ? ` 座位${pe.exam.seat}` : ""),
      teacher: pe.timeLabel,
      weekday: pe.weekday,
      start: pe.start,
      end: pe.end,
      weeks: [pe.week],
    }));

  return {
    v: 1,
    first_monday: fm,
    periods: validPeriods,
    courses: [...activeCourses, ...mappedExamEntries],
    updated: data.updated || "",
  };
}

export function syncAndroidWidgetData(data: AppSnapshot): void {
  const bridge = typeof window !== "undefined" ? window.SuperJLU : undefined;
  if (!bridge?.saveWidgetData) return;
  try {
    const payload = buildWidgetPayload(data);
    bridge.saveWidgetData(payload ? JSON.stringify(payload) : "");
  } catch {}
}

export async function exportIcsOnDevice(
  url: string,
  filename: string,
): Promise<void> {
  const bridge = typeof window !== "undefined" ? window.SuperJLU : undefined;
  const ios = getIosBridge();
  if (bridge?.shareIcs || ios) {
    const res = await fetch(url, { credentials: "same-origin" });
    const text = await res.text();
    if (!res.ok || !text.startsWith("BEGIN:VCALENDAR")) {
      let msg = "导出日历失败";
      try {
        const parsed = JSON.parse(text) as { error?: string };
        if (parsed?.error) msg = parsed.error;
      } catch {}
      throw new Error(msg);
    }
    if (bridge?.shareIcs) {
      bridge.shareIcs(text);
    } else if (ios) {
      ios.postMessage({ action: "shareIcs", body: text, filename });
    }
    return;
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
