import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { fmtDateTime } from "../api/format";
import { useLocations, useSectors } from "../api/hooks";
import type { ReviewSessionView } from "../api/types";
import { useI18n, usePlaceName, useSectorName } from "../i18n";
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
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("nav.review")} description={t("session.description")} actions={<DailyProgress />} />
      <ErrorNote error={current.error ?? start.error ?? move.error} />
      {current.isLoading && <p className="t-caption">{t("common.loading")}</p>}

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
                title={session.total === 0 ? t("session.emptyTitle") : t("session.completeTitle")}
                action={
                  <Button variant="primary" onClick={() => setChoosingNew(true)}>
                    <Shuffle className="h-4 w-4" /> {t("session.startNew")}
                  </Button>
                }
              >
                {session.total === 0
                  ? t("session.emptyBody")
                  : t("session.completeBody", { total: session.total, decided: session.decided })}
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
  const { t } = useI18n();
  const undecided = session.business && !DECIDED.has(session.business.record_state);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={pending || session.at_start} onClick={() => onMove("previous")}>
          <ChevronLeft className="h-4 w-4" /> {t("session.previous")}
        </Button>
        <Button variant="secondary" disabled={pending || session.at_end} onClick={() => onMove("next")} title={undecided ? t("session.skipTitle") : undefined}>
          {undecided ? t("session.skip") : t("session.next")} <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="tabular-nums">
          {session.at_end ? t("session.endOf", { total: session.total }) : t("session.position", { position: session.position, total: session.total })} ·{" "}
          {t("session.left", { count: session.pending })}
        </span>
        <Button variant="ghost" size="sm" onClick={onNew}>
          <Shuffle className="h-3.5 w-3.5" /> {t("session.new")}
        </Button>
      </div>
    </div>
  );
}

function ResumeCard({ session, onResume, onNew }: { session: ReviewSessionView; onResume: () => void; onNew: () => void }) {
  const { t } = useI18n();
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader
        title={t("session.resumeTitle")}
        description={t("session.resumeBody", { date: fmtDateTime(session.created_at), decided: session.decided, total: session.total, pending: session.pending })}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="lg" onClick={onResume}>
          {t("session.resume")}
        </Button>
        <Button variant="secondary" size="lg" onClick={onNew}>
          <Shuffle className="h-4 w-4" /> {t("session.startNew")}
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
  const { t } = useI18n();
  const sectorName = useSectorName();
  const placeName = usePlaceName();
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
        title={t("session.startTitle")}
        description={t("session.startBody")}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("common.sector")}>
          <SelectInput value={sectorId} onChange={setSectorId} placeholder={t("common.allSectors")} options={sectors.map((s) => ({ value: String(s.id), label: sectorName(s.name) }))} />
        </Field>
        <Field label={t("common.location")}>
          <SelectInput value={locationId} onChange={setLocationId} placeholder={t("common.allLocations")} options={locations.map((l) => ({ value: String(l.id), label: placeName(l.name) }))} />
        </Field>
      </div>
      {eligible.data && (
        <p className="text-[15px] text-ink-2">
          <strong className="font-semibold">{count}</strong> {t("session.waiting")}
          {eligible.data.by_sector.length > 1 && (
            <span className="text-muted">
              {" "}
              · {eligible.data.by_sector.slice(0, 5).map((s) => `${s.count} ${sectorName(s.sector)}`).join(" · ")}
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
          <Shuffle className="h-4 w-4" /> {pending ? t("session.shuffling") : t("session.start")}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="lg" onClick={onCancel}>
            {t("common.back")}
          </Button>
        )}
        {count === 0 && eligible.data && (
          <ButtonLink to="/discover/find" variant="secondary" size="lg">
            {t("session.findMore")}
          </ButtonLink>
        )}
      </div>
    </Card>
  );
}

/** "12 / 30 reviewed today" — measurable, not gamified. */
export function DailyProgress() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ["review-progress"], queryFn: api.reviewProgress, staleTime: 0 });
  const [, force] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => force((n) => n + 1), 60_000); // roll over at midnight
    return () => clearInterval(timer);
  }, []);
  if (!q.data) return null;
  const { reviewed_today: done, target } = q.data;
  const pct = Math.min(100, Math.round((done / Math.max(1, target)) * 100));
  return (
    <div className="flex min-w-44 flex-col gap-1.5" aria-label={t("session.progressLabel")}>
      <span className="text-sm text-ink-2 tabular-nums">
        <strong className="font-semibold text-ink">{done}</strong> {t("session.progress", { target })}
      </span>
      <div className="h-1.5 rounded-full bg-hover">
        <div className="h-1.5 rounded-full bg-accent/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
