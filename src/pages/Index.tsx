import { URLScanner } from "@/components/URLScanner";
import { ShieldIcon } from "@/components/ShieldIcon";
import { Shield, Zap, Lock, Eye } from "lucide-react";
import { motion } from "framer-motion";

const Index = () => {
  return (
    <div className="min-h-screen bg-background grid-pattern relative overflow-hidden">
      {/* Animated background gradients */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-safe/10 rounded-full blur-3xl animate-float [animation-delay:2s]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldIcon status="idle" className="w-8 h-8" />
            <span className="text-xl font-bold tracking-tight">
              Guardian<span className="text-primary">Link</span>
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How it Works</a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10">
        <section className="container py-16 md:py-24">
          <motion.div 
            className="text-center max-w-3xl mx-auto mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
              <Shield className="w-4 h-4" />
              Multi-Layer URL Security Scanner
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              Protect Yourself from
              <span className="gradient-text block">Malicious Links</span>
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Guardian Link analyzes URLs through 8 security layers including VirusTotal, 
              AbuseIPDB, and advanced heuristics to detect phishing, malware, and suspicious domains.
            </p>
          </motion.div>

          {/* URL Scanner Component */}
          <URLScanner />
        </section>

        {/* Features Section */}
        <section id="features" className="container py-16 border-t border-border/50">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold mb-4">Multi-Layer Protection</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Our comprehensive security analysis checks URLs against multiple threat intelligence sources
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Zap,
                title: "Real-Time Analysis",
                description: "Parallel API checks complete in under 500ms for instant threat detection",
              },
              {
                icon: Lock,
                title: "SSL Verification",
                description: "Validates certificates, checks issuer reputation, and detects mismatches",
              },
              {
                icon: Eye,
                title: "Heuristic Detection",
                description: "Advanced pattern matching for typosquatting and homoglyph attacks",
              },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                className="glass-card p-6 hover:border-primary/50 transition-colors"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <feature.icon className="w-10 h-10 text-primary mb-4" />
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="container py-16 border-t border-border/50">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold mb-4">How Guardian Link Works</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              A 9-phase security pipeline that aggregates multiple threat intelligence sources
            </p>
          </motion.div>

          <div className="max-w-2xl mx-auto space-y-4">
            {[
              { phase: 1, name: "Whitelist Check", time: "1ms" },
              { phase: 2, name: "Local Blacklist", time: "2ms" },
              { phase: 3, name: "Parallel API Checks", time: "100-500ms" },
              { phase: 4, name: "Domain Age Verification", time: "100-200ms" },
              { phase: 5, name: "SSL Certificate Analysis", time: "50-100ms" },
              { phase: 6, name: "Heuristic Analysis", time: "5-10ms" },
              { phase: 7, name: "Google Safe Browsing", time: "100-200ms" },
              { phase: 8, name: "Score Aggregation", time: "instant" },
              { phase: 9, name: "Action & Logging", time: "instant" },
            ].map((step, index) => (
              <motion.div
                key={step.phase}
                className="flex items-center gap-4 p-4 rounded-lg bg-card/40 border border-border/50"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold font-mono">
                  {step.phase}
                </div>
                <div className="flex-1">
                  <span className="font-medium">{step.name}</span>
                </div>
                <span className="text-sm text-muted-foreground font-mono">{step.time}</span>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container py-8 text-center text-sm text-muted-foreground">
          <p>Guardian Link — Multi-Layer URL Security Scanner</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
