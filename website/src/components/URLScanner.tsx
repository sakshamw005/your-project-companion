import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldIcon } from "./ShieldIcon";
import { ScanPhase, PhaseStatus } from "./ScanPhase";
import { RiskScore } from "./RiskScore";
import { Search, ExternalLink, RotateCcw, AlertCircle, Settings } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PhaseResult {
  name: string;
  score: number;
  maxScore: number;
  status: "safe" | "warning" | "danger";
  error?: string;
  [key: string]: unknown;
}

interface ScanResponse {
  url: string;
  timestamp: string;
  phases: Record<string, PhaseResult>;
  totalScore: number;
  maxTotalScore: number;
  percentage: number;
  overallStatus: "safe" | "warning" | "danger";
}

interface ScanResult {
  phase: string;
  status: PhaseStatus;
  score: number;
  maxScore: number;
  details?: string;
}

const SCAN_PHASES = [
  { key: "virusTotal", name: "VirusTotal Analysis", description: "URL reputation analysis", maxScore: 25 },
  { key: "abuseIPDB", name: "AbuseIPDB Check", description: "IP threat intelligence", maxScore: 15 },
  { key: "ssl", name: "SSL Certificate", description: "Certificate validation", maxScore: 15 },
  { key: "domainAge", name: "Domain Analysis", description: "Domain pattern analysis", maxScore: 10 },
  { key: "content", name: "Content Analysis", description: "Phishing indicator scan", maxScore: 15 },
  { key: "redirects", name: "Redirect Analysis", description: "Redirect chain inspection", maxScore: 10 },
  { key: "securityHeaders", name: "Security Headers", description: "Header configuration check", maxScore: 10 },
];

// Default to localhost, but can be configured
const BACKEND_URL = "http://localhost:3001";

export function URLScanner() {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(-1);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [totalScore, setTotalScore] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);

  const getOverallStatus = (score: number): "scanning" | "safe" | "warning" | "danger" => {
    if (scanning) return "scanning";
    if (score < 50) return "danger";
    if (score < 80) return "warning";
    return "safe";
  };

  const checkBackendHealth = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/health`);
      if (response.ok) {
        setBackendConnected(true);
        return true;
      }
      setBackendConnected(false);
      return false;
    } catch {
      setBackendConnected(false);
      return false;
    }
  };

  const performRealScan = async () => {
    if (!url) return;

    setScanning(true);
    setScanComplete(false);
    setResults([]);
    setCurrentPhase(-1);
    setTotalScore(0);
    setError(null);

    // Check backend connection first
    const isConnected = await checkBackendHealth();
    if (!isConnected) {
      setError("Backend server not running. Start the server with: cd backend && npm start");
      setScanning(false);
      return;
    }

    // Animate through phases while waiting for results
    const phaseAnimation = async () => {
      for (let i = 0; i < SCAN_PHASES.length; i++) {
        setCurrentPhase(i);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    };

    try {
      // Start phase animation and API call in parallel
      const [scanResponse] = await Promise.all([
        fetch(`${BACKEND_URL}/api/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        }).then(res => res.json() as Promise<ScanResponse>),
        phaseAnimation(),
      ]);

      // Process results
      const newResults: ScanResult[] = SCAN_PHASES.map(phase => {
        const phaseResult = scanResponse.phases[phase.key];
        if (!phaseResult) {
          return {
            phase: phase.name,
            status: "warning" as PhaseStatus,
            score: 0,
            maxScore: phase.maxScore,
          };
        }

        const status: PhaseStatus = 
          phaseResult.status === "danger" ? "failed" :
          phaseResult.status === "warning" ? "warning" : "passed";

        return {
          phase: phase.name,
          status,
          score: phaseResult.score,
          maxScore: phaseResult.maxScore,
        };
      });

      setResults(newResults);
      setTotalScore(scanResponse.percentage);
      setCurrentPhase(SCAN_PHASES.length);
      setScanComplete(true);
    } catch (err) {
      console.error("Scan error:", err);
      setError("Failed to complete scan. Check if backend server is running.");
    } finally {
      setScanning(false);
    }
  };

  const resetScan = () => {
    setUrl("");
    setScanning(false);
    setScanComplete(false);
    setResults([]);
    setCurrentPhase(-1);
    setTotalScore(0);
    setError(null);
  };

  const getPhaseStatus = (index: number): PhaseStatus => {
    if (results[index]) return results[index].status;
    if (index === currentPhase) return "running";
    if (index < currentPhase) return "passed";
    return "pending";
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Backend Status Indicator */}
      {backendConnected === false && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 mb-4 border-warning/50 bg-warning/10"
        >
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-warning mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-warning">Backend Server Required</h4>
              <p className="text-sm text-muted-foreground mt-1">
                To perform real security scans, run the local backend server:
              </p>
              <pre className="mt-2 p-2 bg-background/50 rounded text-xs font-mono overflow-x-auto">
                cd backend && npm install && npm start
              </pre>
            </div>
          </div>
        </motion.div>
      )}

      {/* URL Input Section */}
      <motion.div 
        className="glass-card p-6 mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Input
              variant="url"
              type="url"
              placeholder="Enter URL to scan (e.g., https://example.com)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={scanning}
              className="pr-12"
            />
            <ExternalLink className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          </div>
          
          {!scanComplete ? (
            <Button
              variant="hero"
              size="xl"
              onClick={performRealScan}
              disabled={!url || scanning}
              className="min-w-[160px]"
            >
              {scanning ? (
                <>
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Scan URL
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="xl"
              onClick={resetScan}
              className="min-w-[160px]"
            >
              <RotateCcw className="w-5 h-5" />
              New Scan
            </Button>
          )}
        </div>
      </motion.div>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-card p-4 mb-8 border-danger/50 bg-danger/10"
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-danger" />
              <p className="text-danger">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results Section */}
      <AnimatePresence>
        {(scanning || scanComplete) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8"
          >
            {/* Left: Score Display */}
            <div className="glass-card p-8 flex flex-col items-center justify-center">
              <div className="mb-6">
                <ShieldIcon 
                  status={scanning ? "scanning" : getOverallStatus(totalScore)} 
                  className="w-20 h-20"
                />
              </div>
              <RiskScore 
                score={totalScore} 
                status={getOverallStatus(totalScore)} 
              />
              
              {scanComplete && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="mt-6 text-center"
                >
                  <p className="text-sm text-muted-foreground font-mono break-all">
                    {url}
                  </p>
                </motion.div>
              )}
            </div>

            {/* Right: Phase Progress */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Security Analysis
              </h3>
              <div className="space-y-3">
                {SCAN_PHASES.map((phase, index) => (
                  <motion.div
                    key={phase.name}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    <ScanPhase
                      name={phase.name}
                      description={phase.description}
                      status={getPhaseStatus(index)}
                      score={results[index]?.score}
                      maxScore={phase.maxScore > 0 ? phase.maxScore : undefined}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
