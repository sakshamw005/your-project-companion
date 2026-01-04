import { cn } from "@/lib/utils";
import { Check, Loader2, AlertTriangle, XCircle, Circle } from "lucide-react";

export type PhaseStatus = "pending" | "running" | "passed" | "warning" | "failed";

interface ScanPhaseProps {
  name: string;
  description: string;
  status: PhaseStatus;
  score?: number;
  maxScore?: number;
  delay?: number;
}

export function ScanPhase({ name, description, status, score, maxScore, delay = 0 }: ScanPhaseProps) {
  const statusIcons = {
    pending: Circle,
    running: Loader2,
    passed: Check,
    warning: AlertTriangle,
    failed: XCircle,
  };

  const statusColors = {
    pending: "text-muted-foreground border-border",
    running: "text-primary border-primary",
    passed: "text-safe border-safe",
    warning: "text-warning border-warning",
    failed: "text-destructive border-destructive",
  };

  const Icon = statusIcons[status];

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 rounded-lg border transition-all duration-500",
        "bg-card/40 backdrop-blur-sm",
        statusColors[status],
        status === "running" && "animate-pulse-glow"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={cn(
        "flex items-center justify-center w-10 h-10 rounded-full border-2",
        statusColors[status]
      )}>
        <Icon className={cn(
          "w-5 h-5",
          status === "running" && "animate-spin"
        )} />
      </div>
      
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-foreground">{name}</h4>
        <p className="text-sm text-muted-foreground truncate">{description}</p>
      </div>
      
      {score !== undefined && maxScore !== undefined && (
        <div className="text-right font-mono">
          <span className={cn(
            "text-lg font-bold",
            score === 0 ? "text-safe" : score >= maxScore * 0.5 ? "text-destructive" : "text-warning"
          )}>
            {score}
          </span>
          <span className="text-muted-foreground text-sm">/{maxScore}</span>
        </div>
      )}
    </div>
  );
}
