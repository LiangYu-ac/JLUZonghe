export type TabId =
  | "dashboard"
  | "schedule"
  | "grades"
  | "academic"
  | "rooms"
  | "exams"
  | "notices"
  | "services";

export type ThemeMode = "system" | "light" | "dark";

export type LoginMode = "direct" | "webvpn";

export interface CourseItem {
  name: string;
  teacher: string;
  location: string;
  weekday: number;
  start: number;
  end: number;
  weeks: number[];
  jxbid?: string;
  kch?: string;
  adj?: string;
  istk?: boolean;
  key?: string;
  src?: "official" | "edited" | "custom" | "cancelled";
  oid?: string;
  from?: string;
  hint?: string;
}

export interface ScheduleIssue {
  oid: string;
  kind: "changed" | "missing" | "invalid";
  op?: string;
  name?: string;
  weekday?: number;
  start?: number;
  end?: number;
  message: string;
}

export interface ScheduleOp {
  id: string;
  op: "add" | "hide" | "edit";
  target?: string;
  weeks?: number[] | null;
  course?: Partial<CourseItem>;
  set?: Record<string, string | number>;
}

export interface ScheduleAdjustInfo {
  enabled: boolean;
  count: number;
  applied: number;
  cancelled: number;
  fetched_at?: string | null;
}

export interface GradeRecord {
  key: string;
  legacy_key: string;
  name: string;
  credit: number;
  score: string;
  term: string;
  jw_point: number | null;
  nature: string;
  numeric_score: number | null;
  score_valid: boolean;
  ungraded: boolean;
  point: number | null;
  point_source: "reported" | "estimated" | "missing";
  required: boolean;
  builtin: {
    postgraduate: boolean;
    scholarship: boolean;
    comprehensive: boolean;
  };
}

export interface SchemeRule {
  base: "postgraduate" | "scholarship" | "comprehensive";
  overrides: Record<string, boolean>;
}

export interface OfficialGpaItem {
  key: string;
  label: string;
  value: string;
}

export interface OfficialGpa {
  plan?: string;
  source?: string;
  available?: boolean;
  items?: OfficialGpaItem[];
}

export interface ExamItem {
  id?: string;
  src?: "official" | "custom";
  name: string;
  start: string;
  end: string;
  location: string;
  seat?: string;
  kind?: string;
  term?: string;
}

export interface PlanCourse {
  code: string;
  name: string;
  credit: number | null;
  hours?: string;
  nature?: string;
  category?: string;
  exam_type?: string;
  term?: string;
  dept?: string;
  score?: string;
  status: "已修" | "在修" | "未修" | "未通过" | string;
  status_code?: "done" | "inprog" | "todo" | "failed" | string;
  group?: string;
  group_code?: string;
  unmatched_reason?: string;
}

export interface CompletionGroup {
  code: string;
  name: string;
  parent?: string;
  nature?: string;
  required: number | null;
  earned: number;
  missing: number;
  passed: boolean;
  courses_done?: number;
  earned_source?: string;
  courses?: PlanCourse[];
  children?: CompletionGroup[];
}

export interface CompletionData {
  plan?: string;
  required?: number;
  earned?: number;
  selected?: number;
  missing?: number;
  passed?: boolean;
  calculated_at?: string;
  groups?: CompletionGroup[];
  tree?: CompletionGroup[];
  unmatched?: PlanCourse[];
  tree_stats?: {
    groups?: number;
    roots?: number;
    matched?: number;
    unmatched?: number;
    courses?: number;
  };
}

export interface AcademicMeta {
  local_synced_at?: string | null;
  school_calculated_at?: string | null;
  cached_calculated_at?: string | null;
  overview_calculated_at?: string | null;
  curriculum_ready?: boolean;
}

export interface CalendarInfo {
  term?: string;
  start_date?: string;
  first_monday?: string;
  total_weeks?: number;
  teaching_weeks?: number;
}

export interface AppSnapshot {
  ok?: boolean;
  courses: CourseItem[];
  schedule_issues: ScheduleIssue[];
  schedule_ops: ScheduleOp[];
  schedule_adjust: ScheduleAdjustInfo;
  schedule_edits: number;
  schedule_term: string;
  schedule_other_terms: number;
  schedule_can_undo_reset: boolean;
  grades: GradeRecord[];
  grade_source: "jwxt" | "import";
  has_imported_grades: boolean;
  grade_filename?: string | null;
  grade_notes?: string[];
  exams: ExamItem[];
  schemes: Record<string, string[]>;
  scheme_rules: Record<string, SchemeRule>;
  settings: {
    first_monday?: string;
    apply_adjustments?: boolean;
    grade_help_seen?: boolean;
    show_exams_in_schedule?: boolean;
  };
  calendar: CalendarInfo;
  periods: Record<string, [string, string]>;
  first_monday: string | null;
  first_monday_source: "manual" | "calendar" | null;
  official_gpa: OfficialGpa | null;
  academic_meta: AcademicMeta;
  completion: CompletionData | null;
  plan_courses: {
    plan?: string;
    courses?: PlanCourse[];
    tree_nodes?: unknown[];
  } | null;
  gpa_all?: { gpa: number; credits: number };
  updated: string | null;
  offline?: boolean;
  cached_at?: string | null;
  needs_bootstrap?: boolean;
  bootstrapped?: boolean;
  session_expired?: boolean;
  session_site?: string;
  result?: Record<string, { ok?: boolean; cached?: boolean; count?: number; error?: string; login_needed?: boolean; skipped?: boolean }>;
}

export interface SessionInfo {
  state: "ok" | "expired" | "missing" | "unknown";
  logged_in?: boolean;
  needs_login?: boolean;
  offline?: boolean;
  cached_at?: string | null;
  needs_bootstrap?: boolean;
  bootstrapped?: boolean;
}

export interface RoomItem {
  name: string;
  building: string;
  campus: string;
  seats: string;
  kind: string;
  exam_seats: string;
  free_date?: string;
  free_periods?: string;
  free_time?: string;
  special?: boolean;
}

export interface RoomQueryResult {
  ok?: boolean;
  mode: "date" | "week";
  date: string;
  week: number;
  weeks: string;
  weekday: number;
  periods: [number, number];
  total: number;
  hidden_special: number;
  rooms: RoomItem[];
}

export interface RoomDayRecord {
  date: string;
  period?: number;
  range?: [number, number];
  complete: boolean;
  fetched_at: string;
  rooms: RoomItem[];
  cached?: boolean;
}

export interface OAChannel {
  id: string;
  name: string;
  kind?: "oa" | "college" | "link";
}

export interface OAPrefs {
  onboarded: boolean;
  home_college: string;
  enabled: string[];
  order: string[];
}

export interface OANoticeItem {
  id: string;
  title: string;
  time: string;
  dept: string;
  top: boolean;
  url: string;
  source?: string;
  html?: string;
  text?: string;
  detail_error?: string;
  attachments?: { name: string; url: string }[];
}

export interface OANoticesResponse {
  ok: boolean;
  channel: string;
  channel_name: string;
  count: number;
  fetched_at: string | null;
  items: OANoticeItem[];
  source?: string;
  status?: string;
  hint?: string;
  source_url?: string;
  offline?: boolean;
}

export interface OASubscriptionRule {
  id: string;
  keywords: string[];
  depts: string[];
  channel: string;
  created: string;
}

export interface OASubscriptionMatch {
  rule_id: string;
  keywords_hit: string[];
  notice: OANoticeItem;
  matched_at: string;
}

export interface CollegeCatalogItem {
  id: string;
  name: string;
  host?: string;
  home?: string;
  scrape?: boolean;
  cols?: Record<string, [string, string]>;
}

export interface CollegeCatalogCategory {
  id: string;
  name: string;
  colleges: CollegeCatalogItem[];
}

export interface CampusLink {
  id: string;
  name: string;
  icon?: string;
  url: string;
  vpn_url?: string;
  sso_url?: string;
  vpn_sso_url?: string;
  vpn_help_url?: string;
  purpose: string;
  login: string;
  campus_only: boolean;
  handoff?: { state?: string; route?: string; checked_at?: number; message?: string };
}

export interface SiteSessionStatus {
  id: string;
  name: string;
  state: "ok" | "expired" | "missing" | "unknown";
  checked_at?: number;
  message?: string;
  external_browser?: boolean;
  vpn_url?: string;
}

export interface NetworkState {
  ok: boolean;
  mode: LoginMode;
  vpn?: SiteSessionStatus;
  last_connection?: { route?: string; checked_at?: number };
  note?: string;
}

export interface NetworkCheckReport {
  ok: boolean;
  checked_at: string;
  python: string;
  tls_library: string;
  services: {
    id: string;
    name: string;
    host: string;
    port: number;
    reachable: boolean;
    http_status?: number;
    transport?: string;
    milliseconds: number;
    error?: string;
  }[];
  recommended_route?: LoginMode | null;
  route_hint?: string;
  hint?: string;
  device_hint?: string;
  note?: string;
}
