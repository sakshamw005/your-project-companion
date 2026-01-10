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

interface ScanResponseFull {
  url: string;
  timestamp: string;
  phases: {
    [key: string]: {
      name: string;
      score: number;
      maxScore: number;
      status: "safe" | "warning" | "danger";
      error?: string;
      findings?: string[];
      details?: unknown;
      evidence?: unknown;
      reason?: string;
      threats?: string;
      [key: string]: unknown;
    };
  };
  totalScore: number;
  maxTotalScore: number;
  percentage: number;
  overallStatus: "safe" | "warning" | "danger";
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
const BACKEND_URL = "https://guardianlink-backend.onrender.com";

export function URLScanner() {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(-1);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [totalScore, setTotalScore] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [fullScanResponse, setFullScanResponse] = useState<ScanResponseFull | null>(null);

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
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url }),
        }).then(res => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          return res.json() as Promise<ScanResponse>;
        }),
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
      setFullScanResponse(scanResponse as ScanResponseFull);
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
            <div className="glass-card p-6 overflow-y-auto max-h-[600px]">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Security Analysis
              </h3>
              <div className="space-y-4">
                {SCAN_PHASES.map((phase, index) => {
                  const phaseResult = results[index];
                  return (
                    <motion.div
                      key={phase.key}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="border border-border/30 rounded-lg p-3 bg-background/40 hover:border-primary/50 transition-colors"
                    >
                      {/* Phase Header */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm">{phase.name}</h4>
                          <p className="text-xs text-muted-foreground">{phase.description}</p>
                        </div>
                        {phaseResult && (
                          <div className={`text-xs font-bold px-2 py-1 rounded ${
                            phaseResult.status === 'passed' ? 'bg-safe/20 text-safe' :
                            phaseResult.status === 'warning' ? 'bg-warning/20 text-warning' :
                            phaseResult.status === 'failed' ? 'bg-destructive/20 text-destructive' :
                            'bg-primary/20 text-primary'
                          }`}>
                            {phaseResult.status === 'passed' ? '✓ Pass' :
                             phaseResult.status === 'failed' ? '✗ Fail' :
                             phaseResult.status === 'warning' ? '⚠ Warn' : '→ Run'}
                          </div>
                        )}
                      </div>

                      {/* Score Bar */}
                      {phaseResult && (
                        <div className="mb-2">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-mono text-muted-foreground">
                              {phaseResult.score}/{phaseResult.maxScore}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
                            <motion.div
                              className={`h-full ${
                                phaseResult.status === 'passed' ? 'bg-safe' :
                                phaseResult.status === 'failed' ? 'bg-destructive' :
                                'bg-warning'
                              }`}
                              initial={{ width: 0 }}
                              animate={{ width: `${(phaseResult.score / phaseResult.maxScore) * 100}%` }}
                              transition={{ duration: 0.6, ease: 'easeOut' }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Phase Status */}
                      <ScanPhase
                        name={phase.name}
                        status={getPhaseStatus(index)}
                        phase={index}
                        isRunning={index === currentPhase}
                      />
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detailed Results Section */}
      <AnimatePresence>
        {scanComplete && fullScanResponse && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="glass-card p-6 mt-8"
          >
            <h3 className="text-lg font-semibold mb-6">Detailed Security Findings</h3>
            
            {/* Phase Details */}
            <div className="space-y-4">
              {Object.entries(fullScanResponse.phases).map(([key, phase]: [string, any]) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`border rounded-lg p-4 ${
                    phase.status === 'safe' ? 'border-safe/30 bg-safe/5' :
                    phase.status === 'warning' ? 'border-warning/30 bg-warning/5' :
                    'border-destructive/30 bg-destructive/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        phase.status === 'safe' ? 'bg-safe' :
                        phase.status === 'warning' ? 'bg-warning' :
                        'bg-destructive'
                      }`} />
                      <h4 className="font-semibold">{phase.name}</h4>
                    </div>
                    <span className={`text-sm font-mono ${
                      phase.status === 'safe' ? 'text-safe' :
                      phase.status === 'warning' ? 'text-warning' :
                      'text-destructive'
                    }`}>
                      {phase.score}/{phase.maxScore}
                    </span>
                  </div>

                  {/* Phase Findings */}
                  {(phase.findings || phase.evidence || phase.reason || phase.threats) && (
                    <div className="text-sm space-y-2 text-muted-foreground">
                      {phase.reason && (
                        <p><span className="font-semibold text-foreground">Reason:</span> {phase.reason}</p>
                      )}
                      {phase.error && (
                        <p><span className="font-semibold text-warning">Error:</span> {phase.error}</p>
                      )}
                      {phase.threats && (
                        <p><span className="font-semibold text-destructive">Threats:</span> {phase.threats}</p>
                      )}
                      {Array.isArray(phase.findings) && phase.findings.length > 0 && (
                        <div>
                          <p className="font-semibold text-foreground mb-1">Findings:</p>
                          <ul className="list-disc list-inside space-y-1">
                            {phase.findings.map((finding: string, idx: number) => (
                              <li key={idx}>{finding}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {phase.evidence && typeof phase.evidence === 'object' && (
                        <div className="text-xs font-mono bg-background/40 rounded p-2 overflow-auto max-h-32">
                          {JSON.stringify(phase.evidence, null, 2)}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Overall Recommendation */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className={`mt-6 p-4 rounded-lg border ${
                fullScanResponse.overallStatus === 'safe' ? 'border-safe/50 bg-safe/10' :
                fullScanResponse.overallStatus === 'warning' ? 'border-warning/50 bg-warning/10' :
                'border-destructive/50 bg-destructive/10'
              }`}
            >
              <h4 className="font-semibold mb-2">Security Recommendation</h4>
              <p className="text-sm">
                {fullScanResponse.overallStatus === 'safe' && '✓ This URL appears to be safe based on all security checks.'}
                {fullScanResponse.overallStatus === 'warning' && '⚠ Exercise caution with this URL. Some security indicators are concerning.'}
                {fullScanResponse.overallStatus === 'danger' && '✗ This URL has significant security concerns. Proceed with extreme caution or avoid it entirely.'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
