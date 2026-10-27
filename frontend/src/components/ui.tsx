import { Check, ChevronDown, Inbox } from "lucide-react";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { STATE_LABEL } from "../api/labels";
import type { Option } from "../api/labels";

/* ---------- Buttons ---------- */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const btn = (variant: Variant = "secondary", size: Size = "md", extra = "") => `btn btn-${variant} btn-${size} ${extra}`;

export function Button({
  variant,
  size,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={btn(variant, size, className)} {...props} />;
}

export function ButtonLink({
  to,
  href,
  variant,
  size,
  className = "",
  children,
  title,
}: {
  to?: string;
  href?: string | null;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  const cls = btn(variant, size, className);
  if (to) {
    return (
      <Link to={to} className={cls} title={title}>
        {children}
      </Link>
    );
  }
  if (!href) {
    return (
      <span className={`${cls} pointer-events-none opacity-40`} aria-disabled title={title}>
        {children}
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cls} title={title}>
      {children}
    </a>
  );
}

/* ---------- Surfaces & layout ---------- */

export function Card({ children, className = "", as: As = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <As className={`card ${className}`}>{children}</As>;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="t-section">{title}</h2>
        {description && <p className="t-caption mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="t-title">{title}</h1>
        {description && <p className="mt-1 text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Inbox className="h-8 w-8 text-subtle" strokeWidth={1.5} />
      <p className="t-section">{title}</p>
      {children && <p className="t-caption max-w-md">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Tabs({ items }: { items: { to: string; label: string; end?: boolean; count?: number }[] }) {
  return (
    <nav className="flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-line)]" aria-label="Sections">
      {items.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              isActive ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
            }`
          }
        >
          {t.label}
          {t.count != null && t.count > 0 && <span className="rounded-full bg-hover px-1.5 text-xs text-muted">{t.count}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className = "",
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-left text-sm font-medium text-ink-2 hover:text-ink"
      >
        {summary}
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="pt-3">{children}</div>}
    </div>
  );
}

/** Small anchored panel that closes on outside click / Escape. */
export function Popover({
  open,
  onClose,
  children,
  align = "left",
  placement = "bottom",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "left" | "right";
  placement?: "top" | "bottom";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`absolute z-30 w-[min(20rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-[var(--shadow-raised)] ${
        align === "right" ? "right-0" : "left-0"
      } ${placement === "top" ? "bottom-full mb-2" : "top-full mt-2"}`}
    >
      {children}
    </div>
  );
}

/* ---------- Status ---------- */

const TONES = {
  neutral: "bg-hover text-ink-2",
  accent: "bg-accent-soft text-accent-ink",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-rose-50 text-rose-700",
};
export type Tone = keyof typeof TONES;

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

const STATE_TONE: Record<string, Tone> = {
  DISCOVERED: "accent",
  IN_REVIEW: "neutral",
  FAVORITED: "amber",
  APPROVED: "green",
  REJECTED: "red",
};

export function StateBadge({ state }: { state: string }) {
  return <Badge tone={STATE_TONE[state] ?? "neutral"}>{STATE_LABEL[state] ?? state}</Badge>;
}

const STAGE_TONE: Record<string, Tone> = {
  READY_TO_CONTACT: "accent",
  CONTACTED: "neutral",
  NO_RESPONSE: "neutral",
  REPLIED: "amber",
  FOLLOW_UP: "amber",
  MEETING: "amber",
  OFFER_SENT: "amber",
  WON: "green",
  LOST: "red",
};

export function StageBadge({ stage, label }: { stage: string; label: string }) {
  return <Badge tone={STAGE_TONE[stage] ?? "neutral"}>{label}</Badge>;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-[var(--radius-control)] bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

/** An OSM field. Missing means "not recorded in OSM" — never "does not exist" (spec §3.2). */
export function OsmValue({ value, href, unknownLabel = "Unknown" }: { value: string | null | undefined; href?: string | null; unknownLabel?: string }) {
  if (!value) {
    return (
      <span className="text-muted" title="Not recorded in OpenStreetMap. This does not mean it doesn't exist.">
        {unknownLabel}
      </span>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="break-all text-accent-ink hover:underline">
        {value}
      </a>
    );
  }
  return <span className="break-words">{value}</span>;
}

/* ---------- Form controls ---------- */

export function Field({ label, hint, children, className = "" }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="t-label">{label}</span>
      {children}
      {hint && <span className="t-caption">{hint}</span>}
    </label>
  );
}

export function SelectInput({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: (Option | { group: string; options: Option[] })[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <select className={`control pr-8 ${className}`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) =>
        "group" in o ? (
          <optgroup key={o.group} label={o.group}>
            {o.options.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ),
      )}
    </select>
  );
}

/**
 * Single choice as a compact segmented control. Clicking the selected option clears it
 * (back to "not answered"). Wraps on narrow screens.
 */
export function Segmented({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Option[];
  value: string | null;
  onChange: (v: string | null) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex max-w-full flex-wrap gap-1 self-start rounded-[var(--radius-control)] bg-hover p-1">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(active ? null : o.value)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              active ? "bg-surface font-medium text-accent-ink shadow-[var(--shadow-card)] ring-1 ring-accent/30" : "text-ink-2 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Multi choice as toggle chips with a check mark. */
export function ToggleChips({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  ariaLabel: string;
}) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              on ? "border-accent/40 bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-2 hover:border-zinc-300 hover:text-ink"
            }`}
          >
            {on && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Checkbox list (for longer multi-select sets). */
export function CheckboxGrid({ options, value, onChange }: { options: Option[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 text-sm text-ink-2 hover:bg-hover">
          <input type="checkbox" className="h-4 w-4 rounded accent-[var(--color-accent)]" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}
