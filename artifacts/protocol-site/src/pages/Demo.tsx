import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  useCreateInquiry,
  useRegisterCommitment,
  useVerifyProof,
  useHealthCheck,
  getHealthCheckQueryKey,
  getInquiry,
} from "@workspace/api-client-react";

type Step = 0 | 1 | 2 | 3 | 4;

const APP_CONTEXT = "proof-of-personhood-demo";

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

interface CommitmentResult {
  commitmentHash: string;
  nullifier: string;
  humanBadge: string;
  expiresAt: string;
}

interface BadgeResult {
  message: string;
  verified: boolean;
}

export function Demo() {
  const [step, setStep] = useState<Step>(0);
  const [scanning, setScanning] = useState(false);
  const [livenessConfirmed, setLivenessConfirmed] = useState(false);
  const [inquiryId, setInquiryId] = useState<string | null>(null);
  const [vendor, setVendor] = useState<"mock" | "persona">("mock");
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"mock" | "persona">("mock");

  // Server returns { error: { code, message, request_id } }; the generic
  // fetch wrapper only knows how to extract flat message/detail/title fields,
  // so we unwrap the envelope ourselves to surface a meaningful message.
  function extractServerError(err: unknown, fallback: string): string {
    const data = (err as { data?: { error?: { code?: string; message?: string } } })?.data;
    const code = data?.error?.code;
    const message = data?.error?.message;
    if (message && code) return `${code}: ${message}`;
    if (message) return message;
    if (code) return code;
    return (err as { message?: string })?.message ?? fallback;
  }
  const [commitmentResult, setCommitmentResult] = useState<CommitmentResult | null>(null);
  const [hashProgress, setHashProgress] = useState(0);
  const [proofProgress, setProofProgress] = useState(0);
  const [badgeResult, setBadgeResult] = useState<BadgeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const referenceId = useRef(`demo-${Math.random().toString(36).slice(2, 10)}`);

  const [, setLocation] = useLocation();
  const createInquiryMutation = useCreateInquiry();
  const registerMutation = useRegisterCommitment();
  const verifyMutation = useVerifyProof();
  const { refetch: refetchHealth } = useHealthCheck({ query: { enabled: false, queryKey: getHealthCheckQueryKey() } });

  function reset() {
    setStep(0);
    setScanning(false);
    setLivenessConfirmed(false);
    setInquiryId(null);
    setVendor("mock");
    setHostedUrl(null);
    setCommitmentResult(null);
    setHashProgress(0);
    setProofProgress(0);
    setBadgeResult(null);
    setError(null);
    referenceId.current = `demo-${Math.random().toString(36).slice(2, 10)}`;
    createInquiryMutation.reset();
    registerMutation.reset();
    verifyMutation.reset();
  }

  // Step 1: Create the inquiry, then poll the vendor until it auto-approves
  // (the mock vendor approves after ~1.5s; Persona returns approved as soon
  // as the user finishes the hosted flow). We poll /inquiries/{id} every
  // 700ms while step === 1.
  function startLiveness() {
    setStep(1);
    setScanning(true);
    refetchHealth().catch(() => { /* health probe is best-effort */ });
    createInquiryMutation.mutate(
      { data: { referenceId: referenceId.current, mode } },
      {
        onSuccess: (result) => {
          setInquiryId(result.inquiryId);
          setVendor(result.vendor);
          setHostedUrl(result.hostedUrl);
          // Real Persona inquiries require the user to complete a hosted
          // flow. Open it in a new tab so the polling loop in this tab can
          // wait for the webhook to flip status to "approved".
          if (result.vendor === "persona" && result.hostedUrl) {
            window.open(result.hostedUrl, "_blank", "noopener,noreferrer");
          }
        },
        onError: (err: unknown) => {
          setError(extractServerError(err, "Failed to start inquiry"));
        },
      },
    );
  }

  // Poll inquiry status. Stops as soon as we see status==="approved", which
  // unlocks the "Register Nullifier" button. We avoid the generated react-
  // query hook here because we need an authenticated bearer header — the
  // custom-fetch already handles that for mutations and the URL helper.
  useEffect(() => {
    if (step !== 1 || !inquiryId) return;
    let cancelled = false;
    let attempts = 0;
    async function poll() {
      while (!cancelled && attempts < 40) {
        attempts++;
        try {
          const res = await getInquiry(inquiryId!);
          if (cancelled) return;
          if (res.status === "approved") {
            setLivenessConfirmed(true);
            setScanning(false);
            return;
          }
        } catch {
          // Vendor may be eventually-consistent; keep polling for a bit.
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      if (!cancelled) {
        setError("Inquiry never reached approved state — try again.");
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [step, inquiryId]);

  function startCommitment() {
    if (!inquiryId) return;
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
      { data: { inquiryId, appContext: APP_CONTEXT } },
      {
        onSuccess: (result) => {
          setCommitmentResult({
            commitmentHash: result.commitmentHash,
            nullifier: result.nullifier,
            humanBadge: result.humanBadge,
            expiresAt: typeof result.expiresAt === "string" ? result.expiresAt : new Date(result.expiresAt as unknown as string).toISOString(),
          });
          setHashProgress(1);
        },
        onError: (err: unknown) => {
          setError(extractServerError(err, "Registration failed"));
        },
      },
    );
  }

  function startProof() {
    if (!commitmentResult) return;
    setStep(3);
    setProofProgress(0);
    const duration = 1500;
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      setProofProgress(p);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    setTimeout(() => {
      verifyMutation.mutate(
        { data: { humanBadge: commitmentResult.humanBadge, appContext: APP_CONTEXT } },
        {
          onSuccess: (result) => {
            setBadgeResult({
              message: result.message,
              verified: result.verified,
            });
            setStep(4);
          },
          onError: (err: unknown) => {
            setError(extractServerError(err, "Verification failed"));
          },
        },
      );
    }, duration);
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-16">
        <p className="text-xs font-mono text-primary tracking-widest uppercase mb-2">End-to-end walkthrough</p>
        <h1 className="text-4xl font-medium tracking-tight mb-4">How a verification looks end-to-end</h1>
        <p className="text-muted-foreground font-mono text-sm mb-6">
          Each step calls the live API. The hosted liveness check is provided by Persona in
          production; this demo uses a self-completing mock vendor so the full flow runs without
          requiring you to leave the page.
        </p>

        <div className="border border-primary/40 bg-primary/5 p-4 mb-12 font-mono text-xs text-foreground/80 leading-relaxed" data-testid="demo-vendor-banner">
          <p className="text-primary mb-1 tracking-widest uppercase">Verification vendor: {vendor}</p>
          <p>
            {vendor === "persona"
              ? "Production Persona inquiry — open the hosted URL to complete the liveness check."
              : "Mock vendor active — auto-approves locally so the demo can finish without external credentials. Set PERSONA_API_KEY + PERSONA_TEMPLATE_ID to switch to the real Persona flow."}
          </p>
        </div>

        <StepIndicator current={(step === 0 ? 1 : step) as Step} />

        {error && (
          <div className="border border-destructive bg-destructive/10 p-4 mb-8 font-mono text-sm text-destructive" data-testid="demo-error">
            Error: {error}
            <button className="ml-4 underline text-xs" onClick={reset} data-testid="button-reset-error">Reset</button>
          </div>
        )}

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
              <p className="text-sm text-muted-foreground max-w-sm">A reference id stands in for your end-user identifier. The vendor never sees your project's API key.</p>
            </div>
            <div className="font-mono text-xs text-muted-foreground bg-background border border-border px-4 py-2 w-full text-left">
              Reference: <span className="text-primary">{referenceId.current}</span>
            </div>
            <div className="w-full grid grid-cols-2 gap-3" data-testid="mode-toggle">
              <button
                type="button"
                onClick={() => setMode("mock")}
                data-testid="button-mode-mock"
                aria-pressed={mode === "mock"}
                className={`border py-3 px-3 font-mono text-xs text-left transition-colors ${mode === "mock" ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:border-primary/40"}`}
              >
                <div className="font-medium tracking-widest uppercase mb-1">Quick simulation</div>
                <div className="text-[11px] leading-snug normal-case">Auto-approves locally so you can run the full flow without a Persona account.</div>
              </button>
              <button
                type="button"
                onClick={() => setMode("persona")}
                data-testid="button-mode-persona"
                aria-pressed={mode === "persona"}
                className={`border py-3 px-3 font-mono text-xs text-left transition-colors ${mode === "persona" ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:border-primary/40"}`}
              >
                <div className="font-medium tracking-widest uppercase mb-1">Real verification (sandbox)</div>
                <div className="text-[11px] leading-snug normal-case">Opens the actual Persona hosted flow. Requires PERSONA_API_KEY.</div>
              </button>
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

        {step === 1 && !error && (
          <div className="border border-border bg-card p-10 flex flex-col items-center gap-6" data-testid="step-liveness">
            <div className="w-full text-center">
              <h2 className="text-xl font-medium mb-1">Hosted Liveness Check</h2>
              <p className="text-sm text-muted-foreground">
                {vendor === "persona"
                  ? "User completes Persona's hosted flow. Webhook + polling update the inquiry status."
                  : "Mock vendor auto-approves after a short delay so the demo runs end-to-end."}
              </p>
            </div>
            <FaceOverlay scanning={scanning} confirmed={livenessConfirmed} />
            <div className="w-full font-mono text-xs text-center">
              {livenessConfirmed ? (
                <span className="text-primary">Inquiry approved — proceeding</span>
              ) : (
                <span className="text-muted-foreground animate-pulse">Polling /api/inquiries/{inquiryId?.slice(-8) ?? "…"} until status=approved...</span>
              )}
            </div>
            {vendor === "persona" && hostedUrl && !livenessConfirmed && (
              <a
                href={hostedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full text-center border border-primary text-primary py-3 font-mono text-sm hover:bg-primary/10 transition-colors"
                data-testid="link-hosted-flow"
              >
                Open hosted flow ↗
              </a>
            )}
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

        {step === 2 && !error && (
          <div className="border border-border bg-card p-10 flex flex-col gap-6" data-testid="step-commitment">
            <div>
              <h2 className="text-xl font-medium mb-1">Nullifier registration</h2>
              <p className="text-sm text-muted-foreground font-mono">Server derives N = HMAC(master, subject || appContext) and C = HMAC(master, subject || salt), then signs an RS256 human badge.</p>
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
                <button
                  className="w-full bg-primary text-primary-foreground py-3 font-medium text-sm hover:bg-primary/90 transition-colors"
                  onClick={startProof}
                  data-testid="button-proceed-proof"
                >
                  Verify Human Badge
                </button>
              </div>
            )}
            {!commitmentResult && hashProgress >= 0.99 && registerMutation.isPending && (
              <div className="font-mono text-xs text-muted-foreground animate-pulse">Waiting for API response...</div>
            )}
          </div>
        )}

        {step === 3 && commitmentResult && !error && (
          <div className="border border-border bg-card p-10 flex flex-col gap-6" data-testid="step-proof">
            <div>
              <h2 className="text-xl font-medium mb-1">Verifying RS256 human badge</h2>
              <p className="text-sm text-muted-foreground font-mono">Calling /api/verify with the JWT we just minted. The server checks the signature against the JWKS, validates the audience + app_context claims, and cross-checks the nullifier in the commitment registry.</p>
            </div>

            <div className="border border-border bg-background p-4 font-mono text-xs space-y-1">
              <p className="text-muted-foreground">alg: <span className="text-primary">RS256</span></p>
              <p className="text-muted-foreground">jwks: <span className="text-primary">/.well-known/jwks.json</span></p>
              <p className="text-muted-foreground">app_context: <span className="text-primary">{APP_CONTEXT}</span></p>
              <p className="text-muted-foreground">expires: <span className="text-primary">{new Date(commitmentResult.expiresAt).toLocaleString()}</span></p>
            </div>

            <div className="h-1 bg-border w-full">
              <div className="h-1 bg-primary transition-all duration-100" style={{ width: `${Math.round(proofProgress * 100)}%` }} />
            </div>
            <div className="font-mono text-xs text-muted-foreground animate-pulse">
              {Math.round(proofProgress * 100)}% — checking signature, audience, expiry, nullifier...
            </div>
          </div>
        )}

        {step === 4 && badgeResult && !error && (
          <div className="border border-primary bg-primary/5 p-10 flex flex-col items-center gap-6 text-center" data-testid="step-badge">
            <div className="w-20 h-20 border border-primary flex items-center justify-center">
              <svg width="32" height="28" viewBox="0 0 32 28" fill="none">
                <path d="M3 14L11 22L29 4" stroke="hsl(190,100%,50%)" strokeWidth="3" strokeLinecap="square"/>
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-medium mb-2 text-primary">{badgeResult.verified ? "Verified Unique Human" : "Verification Failed"}</h2>
              <p className="text-sm text-muted-foreground max-w-sm">{badgeResult.message}</p>
            </div>
            {commitmentResult && badgeResult.verified && (
              <div className="w-full border border-primary/30 bg-background p-4 text-left" data-testid="human-badge">
                <p className="font-mono text-xs text-primary mb-1">HUMAN BADGE JWT (RS256)</p>
                <p className="font-mono text-xs text-muted-foreground break-all">{commitmentResult.humanBadge}</p>
              </div>
            )}
            <div className="text-xs font-mono text-muted-foreground">
              Anyone can verify this badge offline by fetching <span className="text-primary">/.well-known/jwks.json</span>.
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
