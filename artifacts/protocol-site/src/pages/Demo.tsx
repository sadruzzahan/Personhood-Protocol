import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useRegisterCommitment, useVerifyProof, useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";

type Step = 0 | 1 | 2 | 3 | 4;

function randomHex(len: number) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function FaceOverlay({ scanning, confirmed }: { scanning: boolean; confirmed: boolean }) {
  return (
    <div className="relative w-48 h-48 mx-auto">
      <svg viewBox="0 0 192 192" className="w-full h-full" data-testid="face-overlay">
        <ellipse cx="96" cy="92" rx="56" ry="68" fill="none" stroke={confirmed ? "hsl(190,100%,50%)" : scanning ? "hsl(190,100%,50%,0.6)" : "hsl(0,0%,30%)"} strokeWidth="1.5" strokeDasharray={confirmed ? "none" : "6 3"} className={scanning && !confirmed ? "animate-spin" : ""} style={{ animationDuration: "4s" }} />
        <circle cx="78" cy="86" r="5" fill="none" stroke={confirmed ? "hsl(190,100%,50%)" : "hsl(0,0%,30%)"} strokeWidth="1.5" />
        <circle cx="114" cy="86" r="5" fill="none" stroke={confirmed ? "hsl(190,100%,50%)" : "hsl(0,0%,30%)"} strokeWidth="1.5" />
        <path d="M 78 118 Q 96 130 114 118" fill="none" stroke={confirmed ? "hsl(190,100%,50%)" : "hsl(0,0%,30%)"} strokeWidth="1.5" strokeLinecap="square" />
        {scanning && !confirmed && (
          <line x1="40" y1="96" x2="152" y2="96" stroke="hsl(190,100%,50%)" strokeWidth="1" opacity="0.6">
            <animateTransform attributeName="transform" type="translate" values="0,-60;0,60;0,-60" dur="2s" repeatCount="indefinite" />
          </line>
        )}
        {confirmed && (
          <>
            <circle cx="96" cy="96" r="70" fill="none" stroke="hsl(190,100%,50%)" strokeWidth="0.5" opacity="0.3" />
            <path d="M 72 96 L 88 112 L 120 80" fill="none" stroke="hsl(190,100%,50%)" strokeWidth="2" strokeLinecap="square" />
          </>
        )}
      </svg>
    </div>
  );
}

function HashDisplay({ hash, label }: { hash: string; label: string }) {
  return (
    <div className="border border-border bg-background p-4" data-testid={`hash-${label}`}>
      <p className="font-mono text-xs text-primary mb-1">{label}</p>
      <p className="font-mono text-xs text-muted-foreground break-all leading-relaxed">{hash}</p>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps = ["Liveness", "Nullifier", "Attestation", "Badge"];
  return (
    <div className="flex items-center gap-0 mb-12" data-testid="step-indicator">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className={`flex flex-col items-center`}>
            <div className={`w-8 h-8 flex items-center justify-center text-xs font-mono border transition-all duration-300 ${
              i + 1 < current ? 'bg-primary border-primary text-primary-foreground' :
              i + 1 === current ? 'border-primary text-primary' :
              'border-border text-muted-foreground'
            }`}>
              {i + 1 < current ? (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/></svg>
              ) : (String(i + 1).padStart(2, '0'))}
            </div>
            <span className={`text-xs mt-1 font-mono hidden sm:block ${i + 1 === current ? 'text-primary' : 'text-muted-foreground'}`}>{label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-12 sm:w-24 h-px mx-1 transition-all duration-500 ${i + 1 < current ? 'bg-primary' : 'bg-border'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export function Demo() {
  const [step, setStep] = useState<Step>(0);
  const [scanning, setScanning] = useState(false);
  const [livenessConfirmed, setLivenessConfirmed] = useState(false);
  const [commitmentResult, setCommitmentResult] = useState<{ commitmentHash: string; nullifier: string; proofGenerationMs: number } | null>(null);
  const [hashProgress, setHashProgress] = useState(0);
  const [proofProgress, setProofProgress] = useState(0);
  const [attestationToken, setAttestationToken] = useState("");
  const [badgeResult, setBadgeResult] = useState<{ humanBadge: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const biometricData = useRef(randomHex(32));

  const [, setLocation] = useLocation();
  const registerMutation = useRegisterCommitment();
  const verifyMutation = useVerifyProof();
  const { refetch: refetchHealth } = useHealthCheck({ query: { enabled: false, queryKey: getHealthCheckQueryKey() } });

  function reset() {
    setStep(0);
    setScanning(false);
    setLivenessConfirmed(false);
    setCommitmentResult(null);
    setHashProgress(0);
    setProofProgress(0);
    setAttestationToken("");
    setBadgeResult(null);
    setError(null);
    biometricData.current = randomHex(32);
    registerMutation.reset();
    verifyMutation.reset();
  }

  function startLiveness() {
    setStep(1);
    setScanning(true);
    refetchHealth().catch(() => { /* health probe is best-effort */ });
    setTimeout(() => {
      setLivenessConfirmed(true);
      setScanning(false);
    }, 2800);
  }

  function startCommitment() {
    setStep(2);
    setHashProgress(0);
    const start = Date.now();
    const duration = 1200;
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      setHashProgress(p);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    registerMutation.mutate(
      { data: { biometricData: biometricData.current, deviceTier: "secure_enclave", appContext: "proof-of-personhood-demo" } },
      {
        onSuccess: (result) => {
          setCommitmentResult({ commitmentHash: result.commitmentHash, nullifier: result.nullifier, proofGenerationMs: result.proofGenerationMs });
          setHashProgress(1);
        },
        onError: (err: unknown) => {
          const msg = (err as { message?: string })?.message ?? "Registration failed";
          setError(msg);
        },
      }
    );
  }

  function startProof() {
    if (!commitmentResult) return;
    setStep(3);
    setProofProgress(0);
    const duration = commitmentResult.proofGenerationMs;
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      setProofProgress(p);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const proof = `att_${randomHex(24)}`;
    setAttestationToken(proof);

    setTimeout(() => {
      verifyMutation.mutate(
        { data: { proof, nullifier: commitmentResult.nullifier, appContext: "proof-of-personhood-demo" } },
        {
          onSuccess: (result) => {
            setBadgeResult({ humanBadge: result.humanBadge ?? "", message: result.message });
            setStep(4);
          },
          onError: (err: unknown) => {
            const msg = (err as { message?: string })?.message ?? "Verification failed";
            setError(msg);
          },
        }
      );
    }, duration);
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-16">
        <p className="text-xs font-mono text-primary tracking-widest uppercase mb-2">Simulated Walkthrough</p>
        <h1 className="text-4xl font-medium tracking-tight mb-4">How a verification looks end-to-end</h1>
        <p className="text-muted-foreground font-mono text-sm mb-6">
          A guided walkthrough of the verification flow. Each step calls the live API, but the
          biometric capture is simulated locally — no camera access, no real liveness check.
        </p>

        <div className="border border-primary/40 bg-primary/5 p-4 mb-12 font-mono text-xs text-foreground/80 leading-relaxed" data-testid="demo-simulation-banner">
          <p className="text-primary mb-1 tracking-widest uppercase">Simulation only</p>
          <p>
            Production uses a hosted Persona liveness check, an HMAC-derived per-app nullifier, and a
            JWT human-badge signed against our public JWKS. That path ships in a coming release; this
            page exists to demonstrate the shape of the flow today.
          </p>
        </div>

        <StepIndicator current={(step === 0 ? 1 : step) as Step} />

        {error && (
          <div className="border border-destructive bg-destructive/10 p-4 mb-8 font-mono text-sm text-destructive" data-testid="demo-error">
            Error: {error}
            <button className="ml-4 underline text-xs" onClick={reset} data-testid="button-reset-error">Reset</button>
          </div>
        )}

        {/* Step 0: Ready to start */}
        {step === 0 && !error && (
          <div className="border border-border bg-card p-10 flex flex-col items-center gap-6 text-center" data-testid="step-start">
            <div className="w-16 h-16 border border-border flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-primary">
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M4 20C4 16.686 7.582 14 12 14s8 2.686 8 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-medium mb-2">Ready to walk through</h2>
              <p className="text-sm text-muted-foreground max-w-sm">No camera access. A random subject payload stands in for what the production liveness vendor would return.</p>
            </div>
            <div className="font-mono text-xs text-muted-foreground bg-background border border-border px-4 py-2 w-full text-left">
              Simulated subject: <span className="text-primary">{biometricData.current.slice(0, 16)}...</span>
            </div>
            <button
              className="w-full bg-primary text-primary-foreground py-3 font-medium text-sm hover:bg-primary/90 transition-colors"
              onClick={startLiveness}
              data-testid="button-start-demo"
            >
              Begin Verification
            </button>
          </div>
        )}

        {/* Step 1: Liveness */}
        {step === 1 && !error && (
          <div className="border border-border bg-card p-10 flex flex-col items-center gap-6" data-testid="step-liveness">
            <div className="w-full text-center">
              <h2 className="text-xl font-medium mb-1">Liveness Check (simulated)</h2>
              <p className="text-sm text-muted-foreground">In production, the user completes a hosted liveness check from our identity-verification subprocessor.</p>
            </div>
            <FaceOverlay scanning={scanning} confirmed={livenessConfirmed} />
            <div className="w-full font-mono text-xs text-center">
              {livenessConfirmed ? (
                <span className="text-primary">Simulated liveness pass — proceeding</span>
              ) : (
                <span className="text-muted-foreground animate-pulse">Pretending to analyze face geometry and depth signals...</span>
              )}
            </div>
            {livenessConfirmed && (
              <button
                className="w-full bg-primary text-primary-foreground py-3 font-medium text-sm hover:bg-primary/90 transition-colors"
                onClick={startCommitment}
                data-testid="button-proceed-commitment"
              >
                Register Nullifier
              </button>
            )}
          </div>
        )}

        {/* Step 2: Commitment */}
        {step === 2 && !error && (
          <div className="border border-border bg-card p-10 flex flex-col gap-6" data-testid="step-commitment">
            <div>
              <h2 className="text-xl font-medium mb-1">Nullifier registration</h2>
              <p className="text-sm text-muted-foreground font-mono">Computing C = HMAC(master_key, subject) and N = HMAC(master_key, subject || appContext)...</p>
            </div>
            <div className="h-1 bg-border w-full">
              <div className="h-1 bg-primary transition-all duration-100" style={{ width: `${Math.round(hashProgress * 100)}%` }} />
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {Math.round(hashProgress * 100)}% — {hashProgress < 1 ? "hashing..." : "commitment stored in registry"}
            </div>

            {commitmentResult && (
              <div className="flex flex-col gap-3" data-testid="commitment-results">
                <HashDisplay hash={commitmentResult.commitmentHash} label="COMMITMENT HASH (server registry)" />
                <HashDisplay hash={commitmentResult.nullifier} label="NULLIFIER (app-scoped)" />
                <div className="font-mono text-xs text-muted-foreground border border-border bg-background p-3">
                  Server processing time: <span className="text-primary">{commitmentResult.proofGenerationMs}ms</span>
                </div>
                <button
                  className="w-full bg-primary text-primary-foreground py-3 font-medium text-sm hover:bg-primary/90 transition-colors"
                  onClick={startProof}
                  data-testid="button-proceed-proof"
                >
                  Issue Attestation
                </button>
              </div>
            )}
            {!commitmentResult && hashProgress >= 0.99 && registerMutation.isPending && (
              <div className="font-mono text-xs text-muted-foreground animate-pulse">Waiting for API response...</div>
            )}
          </div>
        )}

        {/* Step 3: Attestation issuance */}
        {step === 3 && !error && (
          <div className="border border-border bg-card p-10 flex flex-col gap-6" data-testid="step-proof">
            <div>
              <h2 className="text-xl font-medium mb-1">Issuing attestation token</h2>
              <p className="text-sm text-muted-foreground font-mono">Today: server mints an opaque token bound to the registered nullifier. Production: the server signs a JWT attestation_token with the RSA key published at /.well-known/jwks.json.</p>
            </div>

            <div className="border border-border bg-background p-4 font-mono text-xs space-y-1">
              <p className="text-muted-foreground">issuer: <span className="text-primary">pop-protocol-api</span></p>
              <p className="text-muted-foreground">audience: <span className="text-primary">app:proof-of-personhood-demo</span></p>
              <p className="text-muted-foreground">claims: <span className="text-primary">nullifier, sub, iat, exp</span></p>
              <p className="text-muted-foreground">attestation_token: <span className="text-primary">{attestationToken.slice(0, 20)}...</span></p>
            </div>

            <div className="h-1 bg-border w-full">
              <div className="h-1 bg-primary transition-all duration-100" style={{ width: `${Math.round(proofProgress * 100)}%` }} />
            </div>
            <div className="font-mono text-xs text-muted-foreground animate-pulse">
              {Math.round(proofProgress * 100)}% — server is binding the token to the nullifier...
            </div>
          </div>
        )}

        {/* Step 4: Badge Revealed */}
        {step === 4 && badgeResult && !error && (
          <div className="border border-primary bg-primary/5 p-10 flex flex-col items-center gap-6 text-center" data-testid="step-badge">
            <div className="w-20 h-20 border border-primary flex items-center justify-center">
              <svg width="32" height="28" viewBox="0 0 32 28" fill="none">
                <path d="M3 14L11 22L29 4" stroke="hsl(190,100%,50%)" strokeWidth="3" strokeLinecap="square"/>
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-medium mb-2 text-primary">Verified Unique Human</h2>
              <p className="text-sm text-muted-foreground max-w-sm">{badgeResult.message}</p>
            </div>
            {badgeResult.humanBadge && (
              <div className="w-full border border-primary/30 bg-background p-4 text-left" data-testid="human-badge">
                <p className="font-mono text-xs text-primary mb-1">HUMAN BADGE TOKEN</p>
                <p className="font-mono text-xs text-muted-foreground break-all">{badgeResult.humanBadge}</p>
              </div>
            )}
            <div className="text-xs font-mono text-muted-foreground">
              This token can be stored by any application to mark your account as a verified unique human.
            </div>
            {commitmentResult && (
              <button
                className="w-full border border-primary text-primary py-3 font-mono text-sm hover:bg-primary/10 transition-colors"
                onClick={() => setLocation(`/developers?nullifier=${encodeURIComponent(commitmentResult.nullifier)}`)}
                data-testid="button-inspect-nullifier"
              >
                Inspect nullifier in API playground
              </button>
            )}
            <button
              className="w-full border border-border py-3 font-mono text-sm hover:border-primary/50 hover:text-primary transition-colors"
              onClick={reset}
              data-testid="button-run-again"
            >
              Run Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
