import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useReducer, useState } from "react";
import { api } from "../api/client";
import { useLocations, useSectors } from "../api/hooks";
import ReviewWorkspace from "../components/ReviewWorkspace";
import { Button, ButtonLink, EmptyState, ErrorNote, PageHeader, SelectInput } from "../components/ui";
import { initialQueueNav, queueNavReducer } from "../lib/logic";

/** Guided review of the normal queue (DISCOVERED + IN_REVIEW), oldest first, one business at a time. */
export default function ReviewQueuePage() {
  const sectors = useSectors().data ?? [];
  const locations = useLocations().data ?? [];
  const [sectorId, setSectorId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [nav, dispatch] = useReducer(queueNavReducer, initialQueueNav);

  const filters = { sector_id: sectorId || undefined, location_id: locationId || undefined };
  const head = useQuery({
    queryKey: ["queue", filters, nav.afterId],
    queryFn: () => api.queueNext(filters, nav.afterId),
    staleTime: 0,
    placeholderData: keepPreviousData, // no blank flash between businesses
  });
  // Looking back at a business already decided or skipped in this session.
  const backId = nav.back !== null ? nav.trail[nav.back] : null;
  const back = useQuery({ queryKey: ["business", backId], queryFn: () => api.business(backId!), enabled: backId !== null });

  const current = backId !== null ? back.data : head.data?.business;
  const remaining = head.data?.remaining ?? 0;
  const advance = () => current && dispatch({ type: "advance", fromId: current.id });
  const changeFilter = (set: (v: string) => void) => (v: string) => {
    set(v);
    dispatch({ type: "reset" });
  };

  const queueNav = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={nav.trail.length === 0 || nav.back === 0} onClick={() => dispatch({ type: "previous" })}>
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        {nav.back !== null ? (
          <Button variant="secondary" onClick={() => dispatch({ type: "next" })}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="secondary" onClick={advance} disabled={!current} title="Leave this one in the queue and move on">
            Skip <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
      <span className="text-sm text-muted">
        {nav.back !== null ? "Viewing a business you already handled" : `${remaining} waiting for review`}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Review"
        description="Research each business, record what you find, then decide."
        actions={
          <>
            <SelectInput className="w-auto" ariaLabel="Sector" value={sectorId} onChange={changeFilter(setSectorId)} placeholder="All sectors" options={sectors.map((s) => ({ value: String(s.id), label: s.name }))} />
            <SelectInput className="w-auto" ariaLabel="Location" value={locationId} onChange={changeFilter(setLocationId)} placeholder="All locations" options={locations.map((l) => ({ value: String(l.id), label: l.name }))} />
          </>
        }
      />

      <ErrorNote error={head.error ?? back.error} />
      {head.isLoading && <p className="t-caption">Loading…</p>}
      {head.data && !current && (
        <>
          {nav.trail.length > 0 && queueNav}
          <EmptyState title="You're all caught up" action={<ButtonLink to="/discover/find" variant="primary">Find more businesses</ButtonLink>}>
            Nothing is waiting for review with these filters.
          </EmptyState>
        </>
      )}
      {current && (
        <ReviewWorkspace
          key={current.id}
          business={current}
          nav={queueNav}
          onDecided={(b) => {
            // Move on after a decision made at the queue head; stay when revisiting.
            if (nav.back === null && b.record_state !== "IN_REVIEW" && b.record_state !== "DISCOVERED") advance();
          }}
        />
      )}
    </div>
  );
}
