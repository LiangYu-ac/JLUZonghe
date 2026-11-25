import type { GradeRecord, SchemeRule } from "../types/api";

export const GRADE_BUILTINS = {
  __postgraduate__: {
    id: "__postgraduate__",
    base: "postgraduate" as const,
    name: "保研加权（不含限选课程）",
    shortName: "保研加权",
    policy: "排除选修、限选、通用学术英语、体育、军事理论、军事训练。",
  },
  __scholarship__: {
    id: "__scholarship__",
    base: "scholarship" as const,
    name: "奖学金加权",
    shortName: "奖学金加权",
    policy: "只计必修课，排除英语、体育、军事训练；军事理论计入。",
  },
  __all__: {
    id: "__all__",
    base: "comprehensive" as const,
    name: "所有课程",
    shortName: "所有课程",
    policy: "计入所有有学分的课程（通过类课程不参与加权）。",
  },
} as const;

export type BuiltinSchemeId = keyof typeof GRADE_BUILTINS;

export function isBuiltinScheme(name: string): name is BuiltinSchemeId {
  return name in GRADE_BUILTINS;
}

export function gradeBaseLabel(base: "postgraduate" | "scholarship" | "comprehensive"): string {
  if (base === "postgraduate") return "保研加权";
  if (base === "scholarship") return "奖学金加权";
  return "所有课程加权";
}

export function resolveSchemeBase(
  name: string,
  rules: Record<string, SchemeRule> = {},
): "postgraduate" | "scholarship" | "comprehensive" {
  if (isBuiltinScheme(name)) {
    return GRADE_BUILTINS[name].base;
  }
  return rules[name]?.base ?? "comprehensive";
}

export function computeSchemeSelection(
  grades: GradeRecord[],
  schemeName: string,
  schemes: Record<string, string[]> = {},
  rules: Record<string, SchemeRule> = {},
): Set<string> {
  if (isBuiltinScheme(schemeName)) {
    const base = GRADE_BUILTINS[schemeName].base;
    return new Set(grades.filter((g) => g.builtin?.[base]).map((g) => g.key));
  }
  const rule = rules[schemeName];
  if (rule) {
    const overrides = rule.overrides || {};
    return new Set(
      grades
        .filter((g) =>
          Object.prototype.hasOwnProperty.call(overrides, g.key)
            ? overrides[g.key]
            : g.builtin?.[rule.base],
        )
        .map((g) => g.key),
    );
  }
  const saved = new Set(schemes[schemeName] || []);
  return new Set(
    grades
      .filter((g) => saved.has(g.key) || saved.has(g.legacy_key))
      .map((g) => g.key),
  );
}

export interface GradeTotals {
  count: number;
  selectedTotal: number;
  credits: number;
  score: number | null;
  point: number | null;
  invalid: number;
  estimated: number;
}

export function computeGradeTotals(
  grades: GradeRecord[],
  selected: Set<string>,
): GradeTotals {
  const rows = grades.filter(
    (g) => selected.has(g.key) && g.credit > 0 && !g.ungraded,
  );
  const credits = rows.reduce((sum, g) => sum + g.credit, 0);
  const score =
    credits > 0
      ? rows.reduce((sum, g) => sum + (g.numeric_score ?? 0) * g.credit, 0) / credits
      : null;
  const point =
    credits > 0 && rows.every((g) => g.point != null)
      ? rows.reduce((sum, g) => sum + (g.point ?? 0) * g.credit, 0) / credits
      : null;

  return {
    count: rows.length,
    selectedTotal: grades.filter((g) => selected.has(g.key)).length,
    credits,
    score,
    point,
    invalid: rows.filter((g) => !g.score_valid).length,
    estimated: rows.filter((g) => g.point_source === "estimated" && g.point != null).length,
  };
}

export function gradeHasIssue(
  g: GradeRecord,
  kind: "unknown" | "missing-point" | "missing-nature",
): boolean {
  if (kind === "unknown") return g.credit > 0 && !g.ungraded && !g.score_valid;
  if (kind === "missing-point") return g.credit > 0 && !g.ungraded && g.point == null;
  return !String(g.nature || "").trim() || g.nature === "未标注";
}

export function computeGradeIssues(
  grades: GradeRecord[],
  selected: Set<string>,
) {
  const counts = {
    unknown: 0,
    "missing-point": 0,
    "missing-nature": 0,
    selectedUnknown: 0,
    selectedMissingPoint: 0,
  };
  for (const g of grades) {
    if (gradeHasIssue(g, "unknown")) counts.unknown++;
    if (gradeHasIssue(g, "missing-point")) counts["missing-point"]++;
    if (gradeHasIssue(g, "missing-nature")) counts["missing-nature"]++;
    if (selected.has(g.key)) {
      if (gradeHasIssue(g, "unknown")) counts.selectedUnknown++;
      if (gradeHasIssue(g, "missing-point")) counts.selectedMissingPoint++;
    }
  }
  return counts;
}

export function computeTermTrends(
  grades: GradeRecord[],
  selected: Set<string>,
) {
  const byTerm = new Map<string, GradeRecord[]>();
  for (const g of grades) {
    const t = g.term || "未标注";
    if (!byTerm.has(t)) byTerm.set(t, []);
    byTerm.get(t)!.push(g);
  }
  const terms = [...byTerm.keys()].sort();
  return terms
    .map((term) => {
      const list = byTerm.get(term)!;
      const tot = computeGradeTotals(list, selected);
      return {
        term,
        shortTerm: term.replace(/^20(\d{2})-20(\d{2})-/, "$1-$2 "),
        score: tot.score != null ? Number(tot.score.toFixed(2)) : null,
        gpa: tot.point != null ? Number(tot.point.toFixed(3)) : null,
        credits: Number(tot.credits.toFixed(1)),
        courses: tot.count,
      };
    })
    .filter((d) => d.score !== null);
}

export function computeScoreDistribution(grades: GradeRecord[]) {
  const buckets = [
    { label: "90+", count: 0, fill: "#10b981" },
    { label: "80-89", count: 0, fill: "#2557d6" },
    { label: "70-79", count: 0, fill: "#6366f1" },
    { label: "60-69", count: 0, fill: "#f59e0b" },
    { label: "<60", count: 0, fill: "#e11d48" },
  ];
  for (const g of grades) {
    if (g.ungraded || g.numeric_score == null) continue;
    const s = g.numeric_score;
    if (s >= 90) buckets[0].count++;
    else if (s >= 80) buckets[1].count++;
    else if (s >= 70) buckets[2].count++;
    else if (s >= 60) buckets[3].count++;
    else buckets[4].count++;
  }
  return buckets;
}

export function formatSignedDelta(val: number | null): string {
  if (val == null || !Number.isFinite(val)) return "—";
  const r = Math.round(val * 1000) / 1000;
  return (r > 0 ? "+" : "") + r.toFixed(3);
}
