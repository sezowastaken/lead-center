import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import ReviewWorkspace from "../components/ReviewWorkspace";
import { Button, ErrorNote } from "../components/ui";

export default function BusinessPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["business", id], queryFn: () => api.business(id) });

  const back = (
    <div>
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ChevronLeft className="h-4 w-4" /> Back
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <ErrorNote error={query.error} />
      {query.isLoading && <p className="t-caption">Loading…</p>}
      {query.data && <ReviewWorkspace key={query.data.id} business={query.data} nav={back} />}
    </div>
  );
}
