import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface RiskScoreProps {
  score: number;
  status: "scanning" | "safe" | "warning" | "danger";
}

export function RiskScore({ score, status }: RiskScoreProps) {
  const statusConfig = {
    scanning: {
      color: "text-primary",
      bgColor: "from-primary/20 to-transparent",
      label: "Analyzing...",
    },
    safe: {
      color: "text-safe",
      bgColor: "from-safe/20 to-transparent",
      label: "Safe",
    },
    warning: {
      color: "text-warning",
      bgColor: "from-warning/20 to-transparent",
      label: "Warning",
    },
    danger: {
      color: "text-destructive",
      bgColor: "from-destructive/20 to-transparent",
      label: "Blocked",
    },
  };

  const config = statusConfig[status];
  const circumference = 2 * Math.PI * 90;
  const progress = ((100 - score) / 100) * circumference;

  return (
    <div className="relative flex flex-col items-center justify-center">
      {/* Background glow */}
      <div className={cn(
        "absolute inset-0 blur-3xl bg-gradient-radial",
        config.bgColor
      )} />
      
      {/* SVG Circle */}
      <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 200 200">
        {/* Background circle */}
        <circle
          cx="100"
          cy="100"
          r="90"
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          className="text-border"
        />
        
        {/* Progress circle */}
        <motion.circle
          cx="100"
          cy="100"
          r="90"
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          className={config.color}
          initial={{ strokeDasharray: circumference, strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: progress }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      
      {/* Score display */}
      <div className="absolute flex flex-col items-center">
        <motion.span
          className={cn("text-5xl font-bold font-mono", config.color)}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {score}
        </motion.span>
        <span className="text-muted-foreground text-sm uppercase tracking-wider">
          Risk Score
        </span>
      </div>
      
      {/* Status label */}
      <motion.div
        className={cn(
          "mt-4 px-6 py-2 rounded-full font-semibold text-sm uppercase tracking-wider",
          status === "safe" && "bg-safe/10 text-safe border border-safe/30",
          status === "warning" && "bg-warning/10 text-warning border border-warning/30",
          status === "danger" && "bg-destructive/10 text-destructive border border-destructive/30",
          status === "scanning" && "bg-primary/10 text-primary border border-primary/30"
        )}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        {config.label}
      </motion.div>
    </div>
  );
}
