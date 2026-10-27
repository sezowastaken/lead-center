import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { BusinessDetail } from "./types";

export function useSectors() {
  return useQuery({ queryKey: ["sectors"], queryFn: api.sectors, staleTime: Infinity });
}

export function useLocations() {
  return useQuery({ queryKey: ["locations"], queryFn: api.locations, staleTime: Infinity });
}

/** Decision mutations (spec §27). All of them refresh every business list and detail. */
export function useBusinessActions(onDone?: (b: BusinessDetail) => void) {
  const qc = useQueryClient();
  const settle = (b: BusinessDetail) => {
    qc.setQueryData(["business", b.id], b);
    qc.invalidateQueries({ queryKey: ["businesses"] });
    qc.invalidateQueries({ queryKey: ["queue"] });
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    onDone?.(b);
  };
  return {
    reject: useMutation({
      mutationFn: (v: { id: number; reason: string; note: string }) => api.reject(v.id, v.reason, v.note),
      onSuccess: settle,
    }),
    favorite: useMutation({
      mutationFn: (v: { id: number; favorite: boolean }) => api.favorite(v.id, v.favorite),
      onSuccess: settle,
    }),
    approve: useMutation({ mutationFn: (id: number) => api.approve(id), onSuccess: settle }),
    restore: useMutation({ mutationFn: (id: number) => api.restore(id), onSuccess: settle }),
  };
}
