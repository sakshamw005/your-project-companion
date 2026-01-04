import { cn } from "@/lib/utils";

interface ShieldIconProps {
  status: "idle" | "scanning" | "safe" | "warning" | "danger";
  className?: string;
}

export function ShieldIcon({ status, className }: ShieldIconProps) {
  const statusColors = {
    idle: "text-primary",
    scanning: "text-primary",
    safe: "text-safe",
    warning: "text-warning",
    danger: "text-destructive",
  };

  const glowClasses = {
    idle: "",
    scanning: "animate-pulse-glow",
    safe: "glow-safe",
    warning: "glow-warning",
    danger: "glow-danger",
  };

  return (
    <div className={cn("relative", className)}>
      {/* Animated rings for scanning state */}
      {status === "scanning" && (
        <>
          <div className="absolute inset-0 rounded-full bg-primary/20 pulse-ring" />
          <div className="absolute inset-0 rounded-full bg-primary/20 pulse-ring [animation-delay:0.5s]" />
          <div className="absolute inset-0 rounded-full bg-primary/20 pulse-ring [animation-delay:1s]" />
        </>
      )}
      
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={cn(
          "w-full h-full transition-colors duration-500",
          statusColors[status],
          glowClasses[status]
        )}
      >
        <path
          d="M12 2L4 6V12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12V6L12 2Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="currentColor"
          fillOpacity="0.1"
        />
        
        {/* Status icons inside shield */}
        {status === "safe" && (
          <path
            d="M8 12L11 15L16 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-fade-in"
          />
        )}
        
        {status === "warning" && (
          <>
            <line
              x1="12"
              y1="8"
              x2="12"
              y2="12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="animate-fade-in"
            />
            <circle
              cx="12"
              cy="15"
              r="1"
              fill="currentColor"
              className="animate-fade-in"
            />
          </>
        )}
        
        {status === "danger" && (
          <>
            <line
              x1="9"
              y1="9"
              x2="15"
              y2="15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="animate-fade-in"
            />
            <line
              x1="15"
              y1="9"
              x2="9"
              y2="15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="animate-fade-in"
            />
          </>
        )}
        
        {status === "scanning" && (
          <circle
            cx="12"
            cy="12"
            r="3"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            className="animate-pulse"
          />
        )}
      </svg>
    </div>
  );
}
