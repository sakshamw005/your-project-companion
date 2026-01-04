import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldIcon } from "./ShieldIcon";
import { ScanPhase, PhaseStatus } from "./ScanPhase";
import { RiskScore } from "./RiskScore";
import { Search, ExternalLink, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ScanResult {
  phase: string;
  status: PhaseStatus;
  score: number;
  maxScore: number;
  details?: string;
}

const SCAN_PHASES = [
  { name: "Whitelist Check", description: "Checking trusted domains", maxScore: 0 },
  { name: "Blacklist Check", description: "Scanning known threat database", maxScore: 0 },
  { name: "VirusTotal", description: "URL reputation analysis", maxScore: 40 },
  { name: "AbuseIPDB", description: "IP threat intelligence", maxScore: 50 },
  { name: "URLhaus", description: "Malware database lookup", maxScore: 45 },
  { name: "Domain Age", description: "Registration date verification", maxScore: 30 },
  { name: "SSL Analysis", description: "Certificate validation", maxScore: 25 },
  { name: "Heuristics", description: "Pattern & typosquatting detection", maxScore: 50 },
];

export function URLScanner() {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(-1);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [totalScore, setTotalScore] = useState(0);

  const getOverallStatus = (score: number): "scanning" | "safe" | "warning" | "danger" => {
    if (scanning) return "scanning";
    if (score >= 70) return "danger";
    if (score >= 40) return "warning";
    return "safe";
  };

  const simulateScan = async () => {
    if (!url) return;
    
    setScanning(true);
    setScanComplete(false);
    setResults([]);
    setCurrentPhase(-1);
    setTotalScore(0);

    const newResults: ScanResult[] = [];
    let runningScore = 0;

    for (let i = 0; i < SCAN_PHASES.length; i++) {
      setCurrentPhase(i);
      await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 300));
      
      // Simulate random scores (in real implementation, this comes from API)
      const phase = SCAN_PHASES[i];
      const isThreat = Math.random() > 0.8;
      const score = phase.maxScore > 0 ? (isThreat ? Math.floor(Math.random() * phase.maxScore * 0.8) : 0) : 0;
      
      const status: PhaseStatus = score > 0 
        ? (score >= phase.maxScore * 0.5 ? "failed" : "warning") 
        : "passed";

      newResults.push({
        phase: phase.name,
        status,
        score,
        maxScore: phase.maxScore,
      });

      runningScore += score;
      setResults([...newResults]);
      setTotalScore(Math.min(100, Math.round((runningScore / 310) * 100)));
    }

    setScanning(false);
    setScanComplete(true);
  };

  const resetScan = () => {
    setUrl("");
    setScanning(false);
    setScanComplete(false);
    setResults([]);
    setCurrentPhase(-1);
    setTotalScore(0);
  };

  const getPhaseStatus = (index: number): PhaseStatus => {
    if (results[index]) return results[index].status;
    if (index === currentPhase) return "running";
    return "pending";
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
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
              onClick={simulateScan}
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
