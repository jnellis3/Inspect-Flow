import { CheckCircle2, CircleDashed, LoaderCircle, TriangleAlert } from "lucide-react";
import type { RunState } from "@/lib/inspection/types";

const LOOK: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  draft: { label: "Draft", className: "bg-white/90 text-foreground", icon: CircleDashed },
  ready_to_make: { label: "Ready to make", className: "bg-white/90 text-foreground", icon: CircleDashed },
  queued: { label: "Queued", className: "bg-highlight text-foreground", icon: LoaderCircle },
  running: { label: "Making your video", className: "bg-highlight text-foreground", icon: LoaderCircle },
  done: { label: "Ready", className: "bg-emerald-500 text-white", icon: CheckCircle2 },
  failed: { label: "Needs attention", className: "bg-orange-600 text-white", icon: TriangleAlert },
  cancelled: { label: "Stopped", className: "bg-white/90 text-foreground", icon: CircleDashed },
};

export function StateBadge({ state, hasVideo }: { state: RunState; hasVideo: boolean }) {
  const key = state === "idle" ? (hasVideo ? "ready_to_make" : "draft") : state;
  const { label, className, icon: Icon } = LOOK[key];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ${className}`}>
      <Icon className={`size-3.5 ${state === "running" || state === "queued" ? "animate-spin" : ""}`} />{label}
    </span>
  );
}
