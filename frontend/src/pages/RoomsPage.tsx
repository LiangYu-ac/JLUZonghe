import React, { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Calendar,
  Clock,
  DoorOpen,
  Filter,
  Loader2,
  Search,
  Star,
  Users,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { apiPost } from "../lib/api";
import { getPeriodMap, WEEKDAYS, weekOfDate } from "../lib/schedule";
import type { AppSnapshot, RoomDayRecord, RoomItem, RoomQueryResult } from "../types/api";
import { EmptyState, Modal, StatusChip } from "../components/ui/Primitives";
import { cn } from "../lib/utils";

const DEFAULT_CAMPUSES = [
  { code: "01", name: "前卫校区" },
  { code: "02", name: "南岭校区" },
  { code: "03", name: "新民校区" },
  { code: "04", name: "朝阳校区" },
  { code: "05", name: "南湖校区" },
  { code: "06", name: "和平校区" },
];

const FAV_KEY = "jlu-room-favorites";

function loadFavorites(): Set<string> {
  try {
    const arr = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function RoomsPage({
  data,
  toast,
}: {
  data: AppSnapshot;
  toast: (msg: string, tone?: "info" | "success" | "error") => void;
}) {
  const periodMap = useMemo(() => getPeriodMap(data.periods), [data.periods]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [mode, setMode] = useState<"date" | "week">("date");
  const [campuses, setCampuses] = useState(DEFAULT_CAMPUSES);
  const [campus, setCampus] = useState("01");
  const [date, setDate] = useState(todayIso);
  const [weeks, setWeeks] = useState(() =>
    String(Math.max(1, weekOfDate(data.first_monday, new Date()))),
  );
  const [weekday, setWeekday] = useState(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  });
  const [pStart, setPStart] = useState(1);
  const [pEnd, setPEnd] = useState(2);
  const [building, setBuilding] = useState("");
  const [kind, setKind] = useState("");
  const [hideSpecial, setHideSpecial] = useState(true);
  const [seatMin, setSeatMin] = useState("");
  const [seatMax, setSeatMax] = useState("");
  const [examMin, setExamMin] = useState("");
  const [examMax, setExamMax] = useState("");
  const [showMore, setShowMore] = useState(false);

  const [buildings, setBuildings] = useState<{ code: string; name: string }[]>([]);
  const [roomTypes, setRoomTypes] = useState<{ code: string; name: string }[]>([]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RoomQueryResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [localSearch, setLocalSearch] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites());

  // Room Detail & 12-Period Availability
  const [detailRoom, setDetailRoom] = useState<RoomItem | null>(null);
  const [dayBusy, setDayBusy] = useState(false);
  const [dayFreeMap, setDayFreeMap] = useState<Record<number, boolean | undefined>>({});

  useEffect(() => {
    apiPost<{ campuses?: { code: string; name: string }[] }>("/api/rooms/campuses", {})
      .then((res) => {
        if (res.campuses?.length) setCampuses(res.campuses);
      })
      .catch(() => {});
    apiPost<{ types?: { code: string; name: string }[] }>("/api/rooms/types", {})
      .then((res) => {
        if (res.types?.length) setRoomTypes(res.types);
      })
      .catch(() => {});
  }, [data.updated]);

  useEffect(() => {
    setBuilding("");
    apiPost<{ buildings?: { code: string; name: string }[] }>("/api/rooms/buildings", { campus })
      .then((res) => setBuildings(res.buildings || []))
      .catch(() => setBuildings([]));
  }, [campus, data.updated]);

  function handleDateChange(nextDate: string) {
    setDate(nextDate);
    if (nextDate) {
      const d = new Date(`${nextDate}T00:00:00`);
      if (!Number.isNaN(d.getTime())) {
        const wd = d.getDay() === 0 ? 7 : d.getDay();
        setWeekday(wd);
        if (data.first_monday) {
          const w = weekOfDate(data.first_monday, d);
          if (w >= 1 && w <= 30) setWeeks(String(w));
        }
      }
    }
  }

  function applyStudyPreset(a: number, b: number) {
    setPStart(a);
    setPEnd(b);
  }

  async function runQuery(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (pEnd < pStart) {
      toast("结束节次不能早于起始节次", "error");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await apiPost<RoomQueryResult>("/api/rooms", {
        mode,
        campus,
        date,
        weeks,
        weekday,
        periods: `${pStart}-${pEnd}`,
        building,
        kind,
        hide_special: hideSpecial,
        seat_min: seatMin,
        seat_max: seatMax,
        exam_min: examMin,
        exam_max: examMax,
      });
      setResult(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "查询空教室失败";
      setErrorMsg(msg);
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  function toggleFav(room: RoomItem) {
    const key = `${room.campus}|${room.name}`;
    const next = new Set(favorites);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setFavorites(next);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify([...next].slice(-500)));
    } catch {}
  }

  async function openRoomDetail(room: RoomItem) {
    setDetailRoom(room);
    setDayFreeMap({});
    if (mode !== "date") return;
    setDayBusy(true);
    const map: Record<number, boolean | undefined> = {};
    try {
      const batches = [
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10, 11, 12],
      ];
      for (const batch of batches) {
        const res = await apiPost<{ records?: RoomDayRecord[] }>("/api/rooms/day", {
          mode: "date",
          campus,
          date,
          building,
          kind,
          day_periods: batch,
        });
        for (const rec of res.records || []) {
          if (rec.period != null) {
            const isFree = rec.rooms.some((r) => r.name === room.name);
            map[rec.period] = isFree;
          }
        }
        setDayFreeMap({ ...map });
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "获取全天节次失败", "error");
    } finally {
      setDayBusy(false);
    }
  }

  const groupedRooms = useMemo(() => {
    if (!result) return [];
    const q = localSearch.trim().toLowerCase();
    const list = (result.rooms || []).filter((r) => {
      if (onlyFav && !favorites.has(`${r.campus}|${r.name}`)) return false;
      if (q && !`${r.name} ${r.building} ${r.kind}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const byBldg = new Map<string, RoomItem[]>();
    for (const r of list) {
      const b = r.building || "其他教学楼";
      if (!byBldg.has(b)) byBldg.set(b, []);
      byBldg.get(b)!.push(r);
    }
    return [...byBldg.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-CN"));
  }, [result, localSearch, onlyFav, favorites]);

  const timeRangeDisplay =
    periodMap[String(pStart)]?.[0] && periodMap[String(pEnd)]?.[1]
      ? `${periodMap[String(pStart)][0]} – ${periodMap[String(pEnd)][1]}`
      : "";

  return (
    <div className="space-y-5 animate-in">
      {/* Query Console */}
      <form onSubmit={runQuery} className="surface-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold">空教室查询</h2>
            <p className="text-xs text-[var(--text-muted)]">
              实时同步教务空闲教室，点击任意教室可透视全天 1–12 节空闲矩阵
            </p>
          </div>
          <div className="inline-flex p-0.5 rounded-xl border bg-[var(--surface-2)] text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode("date")}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-colors",
                mode === "date"
                  ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm"
                  : "text-[var(--text-muted)]",
              )}
            >
              按日期查询
            </button>
            <button
              type="button"
              onClick={() => setMode("week")}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-colors",
                mode === "week"
                  ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm"
                  : "text-[var(--text-muted)]",
              )}
            >
              按周次查询
            </button>
          </div>
        </div>

        {/* Campus Pills */}
        <div>
          <div className="text-xs font-semibold text-[var(--text-muted)] mb-2">选择校区</div>
          <div className="flex flex-wrap gap-2">
            {campuses.map((c) => {
              const active = campus === c.code;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setCampus(c.code)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all",
                    active
                      ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm"
                      : "bg-[var(--surface-2)] hover:border-[var(--border-strong)]",
                  )}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time & Location Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {mode === "date" ? (
            <label className="space-y-1">
              <span className="font-semibold text-[var(--text-muted)] flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> 日期
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)]"
              />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="font-semibold text-[var(--text-muted)]">周次</span>
                <input
                  type="text"
                  value={weeks}
                  onChange={(e) => setWeeks(e.target.value)}
                  placeholder="如 9 或 9-12"
                  className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)]"
                />
              </label>
              <label className="space-y-1">
                <span className="font-semibold text-[var(--text-muted)]">星期</span>
                <select
                  value={weekday}
                  onChange={(e) => setWeekday(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)]"
                >
                  {WEEKDAYS.map((w, i) => (
                    <option key={w} value={i + 1}>
                      周{w}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--text-muted)] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> 节次 ({timeRangeDisplay || "自定义"})
              </span>
              <div className="flex gap-1 text-[10.5px]">
                <button
                  type="button"
                  onClick={() => applyStudyPreset(1, 4)}
                  className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border hover:border-[var(--accent)]"
                >
                  上午
                </button>
                <button
                  type="button"
                  onClick={() => applyStudyPreset(5, 8)}
                  className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border hover:border-[var(--accent)]"
                >
                  下午
                </button>
                <button
                  type="button"
                  onClick={() => applyStudyPreset(9, 12)}
                  className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border hover:border-[var(--accent)]"
                >
                  晚上
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={pStart}
                onChange={(e) => setPStart(Number(e.target.value))}
                className="flex-1 px-2.5 py-2 rounded-xl border bg-[var(--surface-2)]"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    第 {n} 节
                  </option>
                ))}
              </select>
              <span className="text-[var(--text-muted)]">–</span>
              <select
                value={pEnd}
                onChange={(e) => setPEnd(Number(e.target.value))}
                className="flex-1 px-2.5 py-2 rounded-xl border bg-[var(--surface-2)]"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    第 {n} 节
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="space-y-1">
            <span className="font-semibold text-[var(--text-muted)] flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" /> 教学楼
            </span>
            <select
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)]"
            >
              <option value="">全部教学楼</option>
              {buildings.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="font-semibold text-[var(--text-muted)]">教室类型</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border bg-[var(--surface-2)]"
            >
              <option value="">全部类型</option>
              {roomTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideSpecial}
                onChange={(e) => setHideSpecial(e.target.checked)}
                className="rounded text-[var(--accent)]"
              />
              屏蔽特殊教室（实验室、机房、语音室）
            </label>

            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <Filter className="w-3.5 h-3.5" />
              {showMore ? "收起座位条件" : "座位数筛选"}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-60"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {loading ? "正在检索..." : "查询空教室"}
          </button>
        </div>

        {showMore && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)] w-24 shrink-0">上课座位数</span>
              <input
                type="number"
                placeholder="最少"
                value={seatMin}
                onChange={(e) => setSeatMin(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-lg border bg-[var(--surface-2)]"
              />
              <span>–</span>
              <input
                type="number"
                placeholder="最多"
                value={seatMax}
                onChange={(e) => setSeatMax(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-lg border bg-[var(--surface-2)]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)] w-24 shrink-0">考试座位数</span>
              <input
                type="number"
                placeholder="最少"
                value={examMin}
                onChange={(e) => setExamMin(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-lg border bg-[var(--surface-2)]"
              />
              <span>–</span>
              <input
                type="number"
                placeholder="最多"
                value={examMax}
                onChange={(e) => setExamMax(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-lg border bg-[var(--surface-2)]"
              />
            </div>
          </div>
        )}
      </form>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50/70 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Results */}
      {result ? (
        <div className="space-y-4">
          <div className="surface-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-sm font-bold">
                找到 {result.rooms.length} 间空闲教室
              </span>
              <StatusChip tone="accent">
                第 {result.periods[0]}–{result.periods[1]} 节
              </StatusChip>
              {result.hidden_special > 0 && (
                <span className="text-[var(--text-muted)]">
                  已屏蔽 {result.hidden_special} 间特殊教室
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  placeholder="快速筛教室号..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl border bg-[var(--surface-2)] text-xs w-44 outline-none focus:border-[var(--accent)]"
                />
              </div>
              <button
                type="button"
                onClick={() => setOnlyFav((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors",
                  onlyFav
                    ? "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300"
                    : "bg-[var(--surface-2)]",
                )}
              >
                <Star className={cn("w-3.5 h-3.5", onlyFav && "fill-current")} />
                只看收藏
              </button>
            </div>
          </div>

          {groupedRooms.length > 0 ? (
            groupedRooms.map(([bldg, list]) => (
              <div key={bldg} className="surface-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[var(--accent)]" />
                    <h3 className="text-sm font-bold">{bldg}</h3>
                    <StatusChip tone="neutral">{list.length} 间</StatusChip>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {list.map((room) => {
                    const fav = favorites.has(`${room.campus}|${room.name}`);
                    return (
                      <div
                        key={room.name}
                        onClick={() => openRoomDetail(room)}
                        className="p-3.5 rounded-xl border bg-[var(--surface-2)] hover:border-[var(--accent)] hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-bold truncate">{room.name}</div>
                            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                              {room.kind || "普通教室"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFav(room);
                            }}
                            className={cn(
                              "p-1 rounded-lg transition-colors",
                              fav
                                ? "text-amber-500"
                                : "text-[var(--text-muted)] hover:text-amber-500",
                            )}
                            aria-label="收藏教室"
                          >
                            <Star className={cn("w-4 h-4", fav && "fill-current")} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Users className="w-3 h-3" />
                            {room.seats ? `${room.seats} 座` : "座位数未提供"}
                          </span>
                          <span className="text-[var(--accent)] font-semibold">
                            查看全天 ›
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="surface-card">
              <EmptyState
                icon={<DoorOpen className="w-6 h-6" />}
                title="没有符合筛选条件的教室"
                description="可以放宽楼栋、类型或座位筛选条件后再查。"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="surface-card">
          <EmptyState
            icon={<DoorOpen className="w-6 h-6" />}
            title="选择校区和节次，开始查找自习室"
            description="点击上方「查询空教室」按钮，获取实时空闲教室列表。"
          />
        </div>
      )}

      {/* Room Detail & Full Day 12-Period Matrix Modal */}
      <Modal
        open={Boolean(detailRoom)}
        onClose={() => setDetailRoom(null)}
        title={detailRoom?.name}
        subtitle={`${detailRoom?.campus || ""} · ${detailRoom?.building || ""} · ${detailRoom?.kind || "教室"}`}
        maxWidth="max-w-xl"
      >
        {detailRoom && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-[var(--surface-2)] border text-xs">
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">上课座位数</div>
                <div className="font-bold tabular-nums mt-0.5">
                  {detailRoom.seats || "未提供"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">考试座位数</div>
                <div className="font-bold tabular-nums mt-0.5">
                  {detailRoom.exam_seats || "未提供"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">本次所选时段</div>
                <div className="font-bold tabular-nums mt-0.5">
                  第 {pStart}–{pEnd} 节空闲
                </div>
              </div>
            </div>

            {mode === "date" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold">当日第 1–12 节全天空闲透视（{date}）</span>
                  {dayBusy && (
                    <span className="inline-flex items-center gap-1 text-[var(--accent)]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      正在拉取各节次...
                    </span>
                  )}
                </div>

                {(
                  [
                    { label: "上午", periods: [1, 2, 3, 4] },
                    { label: "下午", periods: [5, 6, 7, 8] },
                    { label: "晚上", periods: [9, 10, 11, 12] },
                  ] as const
                ).map((blk) => (
                  <div key={blk.label} className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)]">
                      {blk.label}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {blk.periods.map((p) => {
                        const state = dayFreeMap[p];
                        const tm = periodMap[String(p)];
                        return (
                          <div
                            key={p}
                            className={cn(
                              "p-2.5 rounded-xl border text-center transition-colors",
                              state === true
                                ? "bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-200"
                                : state === false
                                  ? "bg-slate-100 dark:bg-slate-800/70 text-[var(--text-muted)]"
                                  : "bg-[var(--surface-2)] border-dashed text-[var(--text-muted)]",
                            )}
                          >
                            <div className="text-xs font-bold tabular-nums">第 {p} 节</div>
                            <div className="text-[10px] opacity-75 tabular-nums mt-0.5">
                              {tm ? `${tm[0]}–${tm[1]}` : ""}
                            </div>
                            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold">
                              {state === true ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3" /> 空闲
                                </>
                              ) : state === false ? (
                                <>
                                  <XCircle className="w-3 h-3" /> 占用
                                </>
                              ) : (
                                <>
                                  <HelpCircle className="w-3 h-3" /> {dayBusy ? "查询中" : "未查"}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
