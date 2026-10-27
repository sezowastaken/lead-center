import { X } from "lucide-react";
import { useState } from "react";
import { REJECT_REASONS } from "../api/labels";
import { Button, Popover } from "./ui";

/**
 * Reject with a reason (spec §27). Rejection is never deletion: the record stays and never
 * re-enters the review queue.
 */
export default function RejectControl({
  onReject,
  pending,
  size = "md",
  placement = "bottom",
  align = "left",
  label = "Reject",
}: {
  onReject: (reason: string, note: string) => void;
  pending?: boolean;
  size?: "sm" | "md" | "lg";
  placement?: "top" | "bottom";
  align?: "left" | "right";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const close = () => setOpen(false);

  return (
    <div className="relative">
      <Button variant="danger" size={size} className="w-full" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
        <X className="h-4 w-4" /> {label}
      </Button>
      <Popover open={open} onClose={close} placement={placement} align={align}>
        <div role="dialog" aria-label="Reject reason" className="flex flex-col gap-3">
          <p className="t-label">Why reject?</p>
          <div className="flex flex-col">
            {REJECT_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                disabled={pending}
                className="rounded-md px-2 py-1.5 text-left text-sm text-ink-2 hover:bg-rose-50 hover:text-rose-800"
                onClick={() => {
                  onReject(r.value, note);
                  close();
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <input className="control" placeholder="Optional note (add before choosing)" value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="t-caption">The business stays in your registry and won't return to the review queue. You can undo this.</p>
        </div>
      </Popover>
    </div>
  );
}
