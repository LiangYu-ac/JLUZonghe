import React, { useEffect } from "react";
import { X, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "../../lib/utils";

export interface ToastMessage {
  id: string;
  text: string;
  tone?: "info" | "success" | "error";
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div
      className="fixed top-4 right-4 z-[90] flex flex-col gap-2 max-w-sm pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const isErr = t.tone === "error";
        const isOk = t.tone === "success";
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm font-medium shadow-lg backdrop-blur-xl animate-in",
              isErr
                ? "bg-rose-50/95 dark:bg-rose-950/90 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200"
                : isOk
                  ? "bg-emerald-50/95 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200"
                  : "bg-white/95 dark:bg-slate-900/95 border-slate-200/80 dark:border-slate-700/70 text-slate-800 dark:text-slate-100",
            )}
          >
            {isErr ? (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
            ) : isOk ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
            ) : (
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent)]" />
            )}
            <span className="flex-1 leading-snug">{t.text}</span>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="p-0.5 rounded-md opacity-60 hover:opacity-100 transition-opacity"
              aria-label="关闭提示"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = "max-w-lg",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-sm animate-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "w-full surface-card shadow-2xl overflow-hidden flex flex-col max-h-[90vh]",
          maxWidth,
        )}
        role="dialog"
        aria-modal="true"
      >
        {title !== undefined && (
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-[var(--text)]">
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="关闭对话框"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function StatusChip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "accent" | "ok" | "warn" | "bad";
  children: React.ReactNode;
  className?: string;
}) {
  const styles = {
    neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
    ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    warn: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    bad: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-tight whitespace-nowrap",
        styles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mb-3">
        {icon}
      </div>
      <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
      {description && (
        <p className="text-xs text-[var(--text-muted)] max-w-sm mt-1.5 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
