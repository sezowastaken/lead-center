import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { fmtDateTime } from "../api/format";
import { useLocations, useSectors } from "../api/hooks";
import type { ReviewSessionView } from "../api/types";
import ReviewWorkspace from "../components/ReviewWorkspace";
import { Button, ButtonLink, Card, CardHeader, EmptyState, ErrorNote, Field, PageHeader, SelectInput } from "../components/ui";

/** sessionStorage remembers that this tab already opened a session, so a refresh resumes directly. */
const TAB_KEY = "lead-center.review-session";
const openedInTab = (): number | null => {
  try {
    const v = sessionStorage.getItem(TAB_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
};
const rememberInTab = (id: number | null) => {
  try {
    if (id === null) sessionStorage.removeItem(TAB_KEY);
    else sessionStorage.setItem(TAB_KEY, String(id));
  } catch {
    /* storage unavailable: the resume prompt simply shows again */
  }
};

const DECIDED = new Set(["REJECTED", "APPROVED", "FAVORITED"]);

/**
 * Review works through a persisted, pre-shuffled deck. Previous / Next move a stored cursor like
 * browser history; nothing is reshuffled until you start a new session.
 */
export default function ReviewQueuePage() {
  const qc = useQueryClient();
  const current = useQuery({ queryKey: ["review-session"], queryFn: api.currentReviewSession, staleTime: 0 });
  const session = current.data?.session ?? null;
  const [tabSession, setTabSession] = useState<number | null>(openedInTab);
  const [choosingNew, setChoosingNew] = useState(false);

  const setSession = (s: ReviewSessionView) => {
    qc.setQueryData(["review-session"], { session: s });
    if (s.business) qc.setQueryData(["business", s.business.id], s.business);
  };
  const start = useMutation({
    mutationFn: api.startReviewSession,
    onSuccess: (s) => {
      setSession(s);
      rememberInTab(s.id);
      setTabSession(s.id);
      setChoosingNew(false);
    },
  });
  const move = useMutation({
    mutationFn: (action: "previous" | "next" | "advance") => api.moveReviewSession(session!.id, action),
    onSuccess: setSession,
  });

  const resume = () => {
    if (!session) return;
    rememberInTab(session.id);
    setTabSession(session.id);
  };
  const open = session && tabSession === session.id && !choosingNew;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Review" description="Research each business, record what you find, then decide." actions={<DailyProgress />} />
      <ErrorNote error={current.error ?? start.error ?? move.error} />
      {current.isLoading && <p className="t-caption">Loading…</p>}

      {current.data && !open && (
        <>
          {session && !choosingNew && <ResumeCard session={session} onResume={resume} onNew={() => setChoosingNew(true)} />}
          {(!session || choosingNew) && (
            <StartCard pending={start.isPending} onStart={(f) => start.mutate(f)} onCancel={session ? () => setChoosingNew(false) : undefined} />
          )}
        </>
      )}

      {open && session && (
        <>
          {session.business ? (
            <ReviewWorkspace
              key={session.business.id}
              business={session.business}
              nav={<SessionNav session={session} pending={move.isPending} onMove={(a) => move.mutate(a)} onNew={() => setChoosingNew(true)} />}
              onDecided={(b) => {
                // A decision moves on to the next undecided business in the same deck; undo/unfavorite stays put.
                if (DECIDED.has(b.record_state)) move.mutate("advance");
                else qc.invalidateQueries({ queryKey: ["review-session"] });
              }}
            />
          ) : (
            <>
              <SessionNav session={session} pending={move.isPending} onMove={(a) => move.mutate(a)} onNew={() => setChoosingNew(true)} />
              <EmptyState
                title={session.total === 0 ? "Nothing to review in this session" : "Session complete"}
                action={
                  <Button variant="primary" onClick={() => setChoosingNew(true)}>
                    <Shuffle className="h-4 w-4" /> Start new shuffled session
                  </Button>
                }
              >
                {session.total === 0
                  ? "No businesses were waiting for review with these filters."
                  : `You went through all ${session.total} businesses — ${session.decided} decided. Go back with Previous, or start a new session with what is still waiting.`}
              </EmptyState>
            </>
          )}
        </>
      )}
    </div>
  );
}

function SessionNav({
  session,
  pending,
  onMove,
  onNew,
}: {
  session: ReviewSessionView;
  pending: boolean;
  onMove: (a: "previous" | "next") => void;
  onNew: () => void;
}) {
  const undecided = session.business && !DECIDED.has(session.business.record_state);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={pending || session.at_start} onClick={() => onMove("previous")}>
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        <Button variant="secondary" disabled={pending || session.at_end} onClick={() => onMove("next")} title={undecided ? "Leave this one undecided and move on" : undefined}>
          {undecided ? "Skip" : "Next"} <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="tabular-nums">
          {session.at_end ? `End of session · ${session.total}` : `${session.position} of ${session.total}`} · {session.pending} left
        </span>
        <Button variant="ghost" size="sm" onClick={onNew}>
          <Shuffle className="h-3.5 w-3.5" /> New session
        </Button>
      </div>
    </div>
  );
}

function ResumeCard({ session, onResume, onNew }: { session: ReviewSessionView; onResume: () => void; onNew: () => void }) {
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader
        title="Continue where you left off?"
        description={`Session started ${fmtDateTime(session.created_at)} · ${session.decided} of ${session.total} decided · ${session.pending} still waiting`}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="lg" onClick={onResume}>
          Resume review session
        </Button>
        <Button variant="secondary" size="lg" onClick={onNew}>
          <Shuffle className="h-4 w-4" /> Start new shuffled session
        </Button>
      </div>
    </Card>
  );
}

function StartCard({
  onStart,
  onCancel,
  pending,
}: {
  onStart: (f: { sector_id?: number; location_id?: number }) => void;
  onCancel?: () => void;
  pending: boolean;
}) {
  const sectors = useSectors().data ?? [];
  const locations = useLocations().data ?? [];
  const [sectorId, setSectorId] = useState("");
  const [locationId, setLocationId] = useState("");
  const filters = { sector_id: sectorId || undefined, location_id: locationId || undefined };
  const eligible = useQuery({ queryKey: ["review-eligible", filters], queryFn: () => api.eligibleForReview(filters), staleTime: 0 });
  const count = eligible.data?.count ?? 0;

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <CardHeader
        title="Start a review session"
        description="Businesses waiting for review are shuffled so sectors alternate. The order is kept, so Previous and Next always show the same businesses."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Sector">
          <SelectInput value={sectorId} onChange={setSectorId} placeholder="All sectors" options={sectors.map((s) => ({ value: String(s.id), label: s.name }))} />
        </Field>
        <Field label="Location">
          <SelectInput value={locationId} onChange={setLocationId} placeholder="All locations" options={locations.map((l) => ({ value: String(l.id), label: l.name }))} />
        </Field>
      </div>
      {eligible.data && (
        <p className="text-[15px] text-ink-2">
          <strong className="font-semibold">{count}</strong> waiting for review
          {eligible.data.by_sector.length > 1 && (
            <span className="text-muted">
              {" "}
              · {eligible.data.by_sector.slice(0, 5).map((s) => `${s.count} ${s.sector}`).join(" · ")}
              {eligible.data.by_sector.length > 5 ? " · …" : ""}
            </span>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="lg"
          disabled={pending || count === 0}
          onClick={() => onStart({ sector_id: sectorId ? Number(sectorId) : undefined, location_id: locationId ? Number(locationId) : undefined })}
        >
          <Shuffle className="h-4 w-4" /> {pending ? "Shuffling…" : "Start shuffled session"}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="lg" onClick={onCancel}>
            Back
          </Button>
        )}
        {count === 0 && eligible.data && (
          <ButtonLink to="/discover/find" variant="secondary" size="lg">
            Find more businesses
          </ButtonLink>
        )}
      </div>
    </Card>
  );
}

/** "12 / 30 reviewed today" — measurable, not gamified. */
export function DailyProgress() {
  const q = useQuery({ queryKey: ["review-progress"], queryFn: api.reviewProgress, staleTime: 0 });
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 60_000); // roll over at midnight
    return () => clearInterval(t);
  }, []);
  if (!q.data) return null;
  const { reviewed_today: done, target } = q.data;
  const pct = Math.min(100, Math.round((done / Math.max(1, target)) * 100));
  return (
    <div className="flex min-w-44 flex-col gap-1.5" aria-label="Daily review progress">
      <span className="text-sm text-ink-2 tabular-nums">
        <strong className="font-semibold text-ink">{done}</strong> / {target} reviewed today
      </span>
      <div className="h-1.5 rounded-full bg-hover">
        <div className="h-1.5 rounded-full bg-accent/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
