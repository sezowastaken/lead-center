import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Compass, FlaskConical, KanbanSquare, LayoutDashboard, Menu, Settings, Users, X } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api/client";
import Attribution from "./Attribution";

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }>; badge?: "queue" | "due" };

// Primary navigation. Discovery runs and Favorites live inside Discover.
export const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/review", label: "Review", icon: ClipboardCheck, badge: "queue" },
  { to: "/leads", label: "Leads", icon: Users, badge: "due" },
  { to: "/crm", label: "CRM", icon: KanbanSquare },
  { to: "/settings", label: "Settings", icon: Settings },
];

function NavList({ counts, onNavigate }: { counts: { queue?: number; due?: number }; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV.map(({ to, label, icon: Icon, badge }) => {
        const count = badge ? counts[badge] : undefined;
        return (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-[15px] transition-colors ${
                isActive ? "bg-surface font-medium text-ink shadow-[var(--shadow-card)] ring-1 ring-line-soft" : "text-ink-2 hover:bg-hover hover:text-ink"
              }`
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0 text-muted group-[.active]:text-accent" />
            <span className="flex-1">{label}</span>
            {count != null && count > 0 && (
              <span
                className={`min-w-6 rounded-full px-1.5 text-center text-xs font-medium tabular-nums ${
                  badge === "due" ? "bg-amber-100 text-amber-800" : "bg-accent-soft text-accent-ink"
                }`}
                title={badge === "due" ? "Follow-ups due" : "Waiting for review"}
              >
                {count}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-semibold text-white">LC</div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold">Lead Center</div>
        <div className="text-xs text-muted">Istanbul · local</div>
      </div>
    </div>
  );
}

export default function Layout() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, staleTime: Infinity });
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, staleTime: 30_000 });
  const counts = { queue: dash.data?.totals.in_queue, due: dash.data?.totals.follow_ups_due };
  const sandbox = health.data?.profile === "sandbox";
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  useEffect(() => setDrawer(false), [location.pathname]);

  return (
    <div className="min-h-screen">
      {sandbox && (
        <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-[13px] font-medium text-amber-900">
          <FlaskConical className="h-4 w-4" /> Sandbox data — test database, not your real prospecting data
        </div>
      )}

      {/* Mobile / tablet top bar */}
      <div className={`sticky z-30 flex items-center justify-between border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur lg:hidden ${sandbox ? "top-8" : "top-0"}`}>
        <Brand />
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Open menu" onClick={() => setDrawer(true)}>
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-zinc-900/30" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 bg-canvas p-4 shadow-[var(--shadow-raised)]">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Close menu" onClick={() => setDrawer(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList counts={counts} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className={`sticky hidden h-screen w-60 shrink-0 flex-col gap-8 border-r border-line-soft px-3 py-5 lg:flex ${sandbox ? "top-8 h-[calc(100vh-2rem)]" : "top-0"}`}>
          <div className="px-2">
            <Brand />
          </div>
          <NavList counts={counts} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
            <Outlet />
          </main>
          <footer className="mx-auto w-full max-w-[1320px] px-4 pb-6 sm:px-6 lg:px-10">
            <Attribution />
          </footer>
        </div>
      </div>
    </div>
  );
}
