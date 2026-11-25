"""考试安排：解析金智 wdksap 行、CSV 读写、倒计时。纯标准库。"""
from __future__ import annotations

import csv
import datetime as dt
import re
import uuid
from dataclasses import dataclass, asdict
from typing import Iterable, Optional

FIELDS = ["课程", "开始", "结束", "地点", "座位号", "考试名称", "学期"]


@dataclass
class Exam:
    name: str
    start: str  # ISO "YYYY-MM-DDTHH:MM"，未知时间则为 ""
    end: str
    location: str
    seat: str = ""
    kind: str = ""
    term: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


_KSSJ = re.compile(
    r"(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?\s*(\d{1,2}):(\d{2})\s*[-~至到]\s*(\d{1,2}):(\d{2})"
)


def parse_kssjms(text: str) -> tuple[str, str]:
    """'2023-04-27 10:10-12:10(星期四)' → ('2023-04-27T10:10','2023-04-27T12:10')。"""
    m = _KSSJ.search(text or "")
    if not m:
        return "", ""
    y, mo, d, h1, m1, h2, m2 = (int(x) for x in m.groups())
    day = f"{y:04d}-{mo:02d}-{d:02d}"
    return f"{day}T{h1:02d}:{m1:02d}", f"{day}T{h2:02d}:{m2:02d}"


def row_to_exam(row: dict, to_str) -> Optional[Exam]:
    name = to_str(row.get("KCM"))
    if not name:
        return None
    start, end = parse_kssjms(to_str(row.get("KSSJMS")))
    if not start:
        ksrq = to_str(row.get("KSRQ"))[:10]
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", ksrq):
            start = f"{ksrq}T00:00"
    return Exam(
        name=name,
        start=start,
        end=end,
        location=to_str(row.get("JASMC")) or "待定",
        seat=to_str(row.get("ZWH")),
        kind=to_str(row.get("KSMC")),
        term=to_str(row.get("XNXQDM")),
    )


def export_exams_csv(exams: Iterable[Exam], path: str) -> None:
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(FIELDS)
        for e in exams:
            w.writerow([e.name, e.start, e.end, e.location, e.seat, e.kind, e.term])


def load_exams(path: str) -> list[Exam]:
    with open(path, encoding="utf-8-sig") as f:
        return [
            Exam(r["课程"], r.get("开始", ""), r.get("结束", ""), r.get("地点", ""),
                 r.get("座位号", ""), r.get("考试名称", ""), r.get("学期", ""))
            for r in csv.DictReader(f)
        ]


def countdown(exam: Exam, now: Optional[dt.datetime] = None) -> Optional[dt.timedelta]:
    if not exam.start:
        return None
    now = now or dt.datetime.now()
    return dt.datetime.fromisoformat(exam.start) - now


def format_countdown(delta: Optional[dt.timedelta]) -> str:
    if delta is None:
        return "时间待定"
    secs = int(delta.total_seconds())
    if secs < 0:
        return "已结束"
    d, rem = divmod(secs, 86400)
    h = rem // 3600
    if d:
        return f"还有 {d} 天 {h} 小时"
    return f"还有 {h} 小时 {rem % 3600 // 60} 分"


def upcoming(exams: Iterable[Exam], now: Optional[dt.datetime] = None) -> list[Exam]:
    now = now or dt.datetime.now()
    future = [e for e in exams if e.start and dt.datetime.fromisoformat(e.end or e.start) >= now]
    undated = [e for e in exams if not e.start]
    return sorted(future, key=lambda e: e.start) + undated


def _ics_clean(s: str) -> str:
    return str(s or "").replace("\r", " ").replace("\n", " ").strip()


def exam_vevents(exams: Iterable[Exam], stamp: Optional[str] = None) -> list[str]:
    """将带日期的考试转为 iCalendar VEVENT 行列表（含考前 30 分钟提醒）。"""
    stamp = stamp or dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines: list[str] = []
    for e in exams:
        s_raw = (e.start or "").strip()
        if not s_raw:
            continue
        try:
            if len(s_raw) == 10:
                d = dt.date.fromisoformat(s_raw)
                s_dt = dt.datetime(d.year, d.month, d.day, 0, 0)
                date_only_hint = True
            else:
                s_dt = dt.datetime.fromisoformat(s_raw)
                date_only_hint = False
        except ValueError:
            continue

        e_raw = (e.end or "").strip()
        e_dt = None
        if e_raw:
            try:
                e_dt = dt.datetime.fromisoformat(e_raw)
            except ValueError:
                e_dt = None

        is_all_day = (date_only_hint or (s_dt.hour == 0 and s_dt.minute == 0)) and not e_raw
        if is_all_day:
            day0 = s_dt.date()
            day1 = day0 + dt.timedelta(days=1)
            dtstart_line = f"DTSTART;VALUE=DATE:{day0:%Y%m%d}"
            dtend_line = f"DTEND;VALUE=DATE:{day1:%Y%m%d}"
        else:
            if e_dt is None or e_dt <= s_dt:
                e_dt = s_dt + dt.timedelta(hours=2)
            dtstart_line = f"DTSTART;TZID=Asia/Shanghai:{s_dt:%Y%m%dT%H%M}00"
            dtend_line = f"DTEND;TZID=Asia/Shanghai:{e_dt:%Y%m%dT%H%M}00"

        name = _ics_clean(e.name) or "考试"
        loc_base = _ics_clean(e.location) or "地点待定"
        seat = _ics_clean(e.seat)
        kind = _ics_clean(e.kind)
        loc = f"{loc_base}（座位 {seat}）" if seat else loc_base
        desc = "｜".join(p for p in (kind, f"地点：{loc_base}", f"座位：{seat}" if seat else "") if p)
        lines += [
            "BEGIN:VEVENT",
            f"UID:{uuid.uuid4()}@jlu-toolkit-exam",
            f"DTSTAMP:{stamp}",
            dtstart_line,
            dtend_line,
            f"SUMMARY:[考试] {name}",
            f"LOCATION:{loc}",
            f"DESCRIPTION:{desc}",
            "BEGIN:VALARM",
            "TRIGGER:-PT30M",
            "ACTION:DISPLAY",
            "DESCRIPTION:考试提醒",
            "END:VALARM",
            "END:VEVENT",
        ]
    return lines


def exams_to_ics(exams: Iterable[Exam]) -> str:
    """仅导出考试安排为 iCalendar (.ics) 文本；无带日期考试时返回空字符串。"""
    events = exam_vevents(exams)
    if not events:
        return ""
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//SuperJLU//CN",
        "X-WR-CALNAME:吉大考试安排",
        "X-WR-TIMEZONE:Asia/Shanghai",
        *events,
        "END:VCALENDAR",
    ]
    return "\r\n".join(lines) + "\r\n"
