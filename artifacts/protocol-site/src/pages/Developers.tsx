import { useEffect, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  useCheckNullifier,
  getCheckNullifierQueryKey,
  useVerifyProof,
} from "@workspace/api-client-react";

const CODE_SNIPPETS: Record<string, string> = {
  JavaScript: `import {
  useRegisterCommitment,
  useVerifyProof
} from "@workspace/api-client-react";

// 1. Start a verification (today: simulated;
//    production: opens vendor liveness flow).
const register = useRegisterCommitment();

register.mutate({
  data: {
    biometricData: simulatedSubjectPayload(),
    deviceTier: "secure_enclave",
    appContext: "your-app-id"
  }
}, {
  onSuccess: ({ commitmentHash, nullifier }) => {
    // Treat the returned token as opaque.
    // The production API will return a JWT human-badge.
    const attestation_token = mintAttestation(nullifier);

    verify.mutate({
      data: {
        // attestation_token is the documented field name.
        // Wire-level field is currently named "proof"
        // until the codegen rename ships.
        attestation_token,
        proof: attestation_token,
        nullifier,
        appContext: "your-app-id"
      }
    }, {
      onSuccess: ({ verified, humanBadge }) => {
        if (verified) markUserAsHuman(humanBadge);
      }
    });
  }
});`,

  Python: `import httpx

BASE = "https://your-domain.com/api"

# 1. Start a verification.
reg = httpx.post(f"{BASE}/register", json={
    "biometricData": simulated_subject_payload(),
    "deviceTier": "secure_enclave",
    "appContext": "your-app-id"
}).json()

nullifier = reg["nullifier"]

# 2. Mint an attestation token (today: opaque;
#    production: JWT issued after vendor liveness).
attestation_token = mint_attestation(nullifier)

# 3. Verify and mark the user. The wire-level field is
#    still "proof" until the codegen rename ships.
result = httpx.post(f"{BASE}/verify", json={
    "attestation_token": attestation_token,
    "proof": attestation_token,
    "nullifier": nullifier,
    "appContext": "your-app-id"
}).json()

if result["verified"]:
    mark_user_as_human(result["humanBadge"])`,

  Go: `package main

import (
    "bytes"
    "encoding/json"
    "net/http"
)

const base = "https://your-domain.com/api"

regBody, _ := json.Marshal(map[string]string{
    "biometricData": simulatedSubjectPayload(),
    "deviceTier":    "secure_enclave",
    "appContext":    "your-app-id",
})
regResp, _ := http.Post(base+"/register",
    "application/json", bytes.NewBuffer(regBody))

var reg struct {
    CommitmentHash string \`json:"commitmentHash"\`
    Nullifier      string \`json:"nullifier"\`
}
json.NewDecoder(regResp.Body).Decode(&reg)

token := mintAttestation(reg.Nullifier)

verBody, _ := json.Marshal(map[string]string{
    // attestation_token is the documented field name.
    // proof is the current wire-level field (rename pending).
    "attestation_token": token,
    "proof":             token,
    "nullifier":         reg.Nullifier,
    "appContext":        "your-app-id",
})
http.Post(base+"/verify", "application/json",
    bytes.NewBuffer(verBody))`,
};

const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/register",
    summary: "Register a verification",
    desc: "In production, this is called after the user completes a vendor-hosted liveness check. The server derives a per-app nullifier from the verified subject and registers it. Today, the endpoint accepts a placeholder payload for the simulated demo.",
    request: `{
  biometricData: string  // Today: opaque payload.
                         // Production: vendor inquiry id.
  deviceTier: "software" | "secure_enclave" | "specialized"
  appContext: string     // Per-app scope for the nullifier
}`,
    response: `{
  commitmentHash: string  // HMAC commitment
  nullifier: string       // HMAC(master_key, subject || appContext)
  registeredAt: string    // ISO timestamp
  proofGenerationMs: number
}`,
    errors: ["409 — Nullifier already registered for this app context", "422 — Invalid request payload"],
  },
  {
    method: "POST",
    path: "/api/verify",
    summary: "Verify an attestation token",
    desc: "Verifies a previously-issued attestation token against the nullifier registry. Returns a human-badge token on success, which downstream applications store and verify offline. The documented field name is `attestation_token`; the legacy `proof` alias is accepted on the wire today and will be removed in a future release. Send both during the transition.",
    request: `{
  attestation_token: string  // Documented field name.
                             // Opaque today; signed JWT in production.
  proof: string              // Legacy alias, accepted on the wire today.
                             // Will be removed in a future release.
  nullifier: string          // From the registration step
  appContext: string         // Must match registration context
}`,
    response: `{
  verified: boolean
  humanBadge?: string   // JWT badge if verified === true
  verifiedAt: string
  message: string
}`,
    errors: ["422 — Invalid request payload"],
  },
  {
    method: "GET",
    path: "/api/stats",
    summary: "Service statistics",
    desc: "Aggregate counters for the verification registry. Public read-only, no parameters required.",
    request: "(none)",
    response: `{
  totalCommitments: number
  totalVerifications: number
  totalFailedVerifications: number
  uptimeSeconds: number
  activeNullifiers: number
}`,
    errors: [],
  },
  {
    method: "GET",
    path: "/api/nullifier/:hash",
    summary: "Check nullifier status",
    desc: "Returns whether a nullifier hash has been registered. Useful for client-side duplicate detection without a full /verify round-trip.",
    request: "hash — path parameter (string)",
    response: `{
  hash: string
  used: boolean
  registeredAt?: string  // Present if used === true
}`,
    errors: [],
  },
];

function MethodBadge({ method }: { method: string }) {
  const color = method === "POST" ? "text-primary border-primary" : "text-muted-foreground border-border";
  return (
    <span className={`inline-block font-mono text-xs border px-2 py-0.5 ${color}`} data-testid={`method-badge-${method}`}>
      {method}
    </span>
  );
}

export function Developers() {
  const search = useSearch();
  const initialNullifier = (() => {
    const params = new URLSearchParams(search);
    return params.get("nullifier")?.trim() ?? "";
  })();
  const [lang, setLang] = useState<keyof typeof CODE_SNIPPETS>("JavaScript");
  const [nullifierInput, setNullifierInput] = useState(initialNullifier);
  const [queryHash, setQueryHash] = useState(initialNullifier);
  const [playgroundTab, setPlaygroundTab] = useState<"nullifier" | "verify">("nullifier");
  const lastSyncedNullifier = useRef(initialNullifier);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const next = params.get("nullifier")?.trim() ?? "";
    if (next && next !== lastSyncedNullifier.current) {
      lastSyncedNullifier.current = next;
      setNullifierInput(next);
      setQueryHash(next);
      setPlaygroundTab("nullifier");
    }
  }, [search]);
  const [verifyProof, setVerifyProof] = useState("");
  const [verifyNullifier, setVerifyNullifier] = useState("");
  const [verifyContext, setVerifyContext] = useState("proof-of-personhood-demo");
  const [verifyResult, setVerifyResult] = useState<{
    verified: boolean; humanBadge?: string; verifiedAt: string; message: string;
  } | null>(null);

  const { data: nullifierData, isLoading, isFetching } = useCheckNullifier(queryHash, {
    query: { enabled: !!queryHash, queryKey: getCheckNullifierQueryKey(queryHash) },
  });

  const verifyMutation = useVerifyProof();

  function runNullifierCheck() {
    setQueryHash(nullifierInput.trim());
  }

  function runVerify() {
    setVerifyResult(null);
    verifyMutation.mutate(
      { data: { proof: verifyProof.trim(), nullifier: verifyNullifier.trim(), appContext: verifyContext.trim() } },
      {
        onSuccess: (result) => {
          setVerifyResult({
            verified: result.verified,
            humanBadge: result.humanBadge,
            verifiedAt: result.verifiedAt,
            message: result.message,
          });
        },
      }
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="max-w-6xl mx-auto w-full px-4 py-16">
        <p className="text-xs font-mono text-primary tracking-widest uppercase mb-2">Developer Portal</p>
        <h1 className="text-4xl font-medium tracking-tight mb-4">Build with the API</h1>
        <p className="text-muted-foreground font-mono text-sm mb-4">
          Drop in unique-human verification with a single API key. Vendor liveness check, signed badges, no biometric data on your servers.
        </p>
        <p className="text-xs font-mono text-muted-foreground mb-16">
          Read the <Link href="/trust" className="text-primary hover:underline" data-testid="link-developers-trust">threat model</Link> before integrating.
        </p>

        {/* Production notice */}
        <div className="border border-primary/30 bg-primary/5 p-4 mb-12 font-mono text-xs text-foreground/80 leading-relaxed" data-testid="developers-production-notice">
          <p className="text-primary mb-1 tracking-widest uppercase">API maturity notice</p>
          <p>
            The endpoints below are stable and live, but the verification semantics are currently
            symbolic: there is no real liveness check, and the <code className="text-primary">humanBadge</code>{" "}
            value is a hash, not a JWT. The production release ships vendor-backed liveness via Persona
            and JWT badges signed against a public JWKS at <code className="text-primary">/.well-known/jwks.json</code>.
            Field shapes won't break; semantics will tighten.
          </p>
        </div>

        {/* Threat model */}
        <section className="mb-20" data-testid="section-threat-model">
          <h2 className="text-2xl font-medium mb-2">Threat model — read this first</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-3xl">
            What this service defends against, and what it doesn't. Most integration mistakes come
            from assuming a uniqueness layer is also an identity layer or a deepfake-resistance
            layer. It isn't.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-border">
            <div className="p-6 border-b md:border-b-0 md:border-r border-border" data-testid="threat-protected">
              <p className="font-mono text-xs text-primary tracking-widest uppercase mb-3">Protected</p>
              <ul className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                <li className="flex gap-2"><span className="text-primary font-mono">—</span> Sybil signups against a single app context</li>
                <li className="flex gap-2"><span className="text-primary font-mono">—</span> Trivial bot account creation</li>
                <li className="flex gap-2"><span className="text-primary font-mono">—</span> Cross-app correlation by default</li>
              </ul>
            </div>
            <div className="p-6" data-testid="threat-out-of-scope">
              <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-3">Out of scope</p>
              <ul className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                <li className="flex gap-2"><span className="text-muted-foreground font-mono">—</span> Determined deepfake attackers</li>
                <li className="flex gap-2"><span className="text-muted-foreground font-mono">—</span> Coerced or sold verifications</li>
                <li className="flex gap-2"><span className="text-muted-foreground font-mono">—</span> Identity / KYC / age verification</li>
                <li className="flex gap-2"><span className="text-muted-foreground font-mono">—</span> Decentralization & on-chain auditability</li>
              </ul>
            </div>
          </div>
          <p className="text-xs font-mono text-muted-foreground mt-3">
            Full description on the <Link href="/trust" className="text-primary hover:underline">Trust & Security</Link> page.
          </p>
        </section>

        {/* SDK Code Snippets */}
        <section className="mb-20" data-testid="section-sdk">
          <h2 className="text-2xl font-medium mb-2">SDK Integration</h2>
          <p className="text-sm text-muted-foreground mb-6">Full registration and verification flow. Copy, paste, adapt.</p>
          <div className="border border-border">
            <div className="flex border-b border-border">
              {(Object.keys(CODE_SNIPPETS) as Array<keyof typeof CODE_SNIPPETS>).map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-5 py-3 font-mono text-xs border-r border-border transition-colors ${lang === l ? 'bg-card text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  data-testid={`tab-lang-${l}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <pre className="p-6 overflow-x-auto text-xs font-mono leading-relaxed text-muted-foreground bg-card">
              <code className="text-foreground/80">{CODE_SNIPPETS[lang]}</code>
            </pre>
          </div>
        </section>

        {/* API Reference */}
        <section className="mb-20" data-testid="section-api-reference">
          <h2 className="text-2xl font-medium mb-2">API Reference</h2>
          <p className="text-sm text-muted-foreground mb-8">All endpoints respond with <code className="text-primary font-mono">application/json</code>. Base URL: <code className="text-primary font-mono">/api</code></p>
          <div className="space-y-0 border border-border">
            {ENDPOINTS.map((ep, i) => (
              <div key={i} className={`p-6 ${i < ENDPOINTS.length - 1 ? 'border-b border-border' : ''}`} data-testid={`endpoint-card-${i}`}>
                <div className="flex items-center gap-3 mb-3">
                  <MethodBadge method={ep.method} />
                  <code className="font-mono text-sm text-foreground">{ep.path}</code>
                </div>
                <p className="font-medium mb-1">{ep.summary}</p>
                <p className="text-sm text-muted-foreground mb-4">{ep.desc}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-border">
                  <div className="p-4 border-b md:border-b-0 md:border-r border-border">
                    <p className="font-mono text-xs text-muted-foreground mb-2">REQUEST</p>
                    <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">{ep.request}</pre>
                  </div>
                  <div className="p-4">
                    <p className="font-mono text-xs text-muted-foreground mb-2">RESPONSE 200</p>
                    <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">{ep.response}</pre>
                  </div>
                </div>
                {ep.errors.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ep.errors.map((e, j) => (
                      <span key={j} className="font-mono text-xs text-muted-foreground border border-border px-2 py-1">{e}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Live Playground */}
        <section data-testid="section-playground">
          <h2 className="text-2xl font-medium mb-2">Live Playground</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Call the API in real time. Run the <a href="/demo" className="text-primary hover:underline">demo</a> first to get a valid nullifier for both tabs.
          </p>

          {/* Tab switcher */}
          <div className="border border-border mb-0">
            <div className="flex border-b border-border">
              <button
                onClick={() => setPlaygroundTab("nullifier")}
                className={`px-5 py-3 font-mono text-xs border-r border-border transition-colors flex items-center gap-2 ${playgroundTab === "nullifier" ? 'bg-card text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                data-testid="tab-playground-nullifier"
              >
                <MethodBadge method="GET" /> /api/nullifier/:hash
              </button>
              <button
                onClick={() => setPlaygroundTab("verify")}
                className={`px-5 py-3 font-mono text-xs transition-colors flex items-center gap-2 ${playgroundTab === "verify" ? 'bg-card text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                data-testid="tab-playground-verify"
              >
                <MethodBadge method="POST" /> /api/verify
              </button>
            </div>

            {/* GET /api/nullifier/:hash */}
            {playgroundTab === "nullifier" && (
              <div className="p-6 flex flex-col gap-4" data-testid="playground-nullifier">
                <p className="font-mono text-xs text-muted-foreground">Paste a nullifier hash to check if it has been registered.</p>
                <div className="flex gap-0">
                  <input
                    type="text"
                    className="flex-1 border border-border bg-background px-4 py-3 font-mono text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                    placeholder="e.g. 0ec05559c0f30bc096618ef9..."
                    value={nullifierInput}
                    onChange={e => setNullifierInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && runNullifierCheck()}
                    data-testid="input-nullifier"
                  />
                  <button
                    className="border border-l-0 border-primary bg-primary text-primary-foreground px-6 py-3 font-mono text-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
                    onClick={runNullifierCheck}
                    disabled={!nullifierInput.trim() || isLoading}
                    data-testid="button-check-nullifier"
                  >
                    {isFetching ? "..." : "RUN"}
                  </button>
                </div>
                {nullifierData && queryHash && (
                  <div className="border border-border bg-card p-4" data-testid="playground-nullifier-result">
                    <p className="font-mono text-xs text-muted-foreground mb-2">RESPONSE 200</p>
                    <pre className="font-mono text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
{JSON.stringify({ hash: nullifierData.hash, used: nullifierData.used, ...(nullifierData.registeredAt ? { registeredAt: nullifierData.registeredAt } : {}) }, null, 2)}
                    </pre>
                    <div className={`mt-3 inline-flex items-center gap-2 font-mono text-xs ${nullifierData.used ? 'text-primary' : 'text-muted-foreground'}`}>
                      <div className={`w-2 h-2 ${nullifierData.used ? 'bg-primary' : 'bg-border'}`} />
                      {nullifierData.used ? "Nullifier registered" : "Nullifier not found"}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* POST /api/verify */}
            {playgroundTab === "verify" && (
              <div className="p-6 flex flex-col gap-4" data-testid="playground-verify">
                <p className="font-mono text-xs text-muted-foreground">Submit an attestation token and nullifier to verify uniqueness. Returns a <code className="text-primary">humanBadge</code> token on success.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="font-mono text-xs text-muted-foreground">attestation_token <span className="text-muted-foreground/50">(wire field: <code>proof</code>)</span></label>
                    <input
                      type="text"
                      className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      placeholder="opaque attestation token (any non-empty string)"
                      value={verifyProof}
                      onChange={e => setVerifyProof(e.target.value)}
                      data-testid="input-verify-proof"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-mono text-xs text-muted-foreground">nullifier</label>
                    <input
                      type="text"
                      className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      placeholder="Paste nullifier from demo..."
                      value={verifyNullifier}
                      onChange={e => setVerifyNullifier(e.target.value)}
                      data-testid="input-verify-nullifier"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-mono text-xs text-muted-foreground">appContext</label>
                    <input
                      type="text"
                      className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      placeholder="e.g. proof-of-personhood-demo"
                      value={verifyContext}
                      onChange={e => setVerifyContext(e.target.value)}
                      data-testid="input-verify-context"
                    />
                  </div>
                </div>
                <button
                  className="self-start border border-primary bg-primary text-primary-foreground px-6 py-2 font-mono text-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
                  onClick={runVerify}
                  disabled={!verifyProof.trim() || !verifyNullifier.trim() || !verifyContext.trim() || verifyMutation.isPending}
                  data-testid="button-run-verify"
                >
                  {verifyMutation.isPending ? "Verifying..." : "POST /api/verify"}
                </button>
                {verifyResult !== null && (
                  <div className={`border p-4 ${verifyResult.verified ? 'border-primary bg-primary/5' : 'border-border bg-card'}`} data-testid="playground-verify-result">
                    <p className="font-mono text-xs text-muted-foreground mb-2">RESPONSE 200</p>
                    <pre className="font-mono text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
{JSON.stringify(verifyResult, null, 2)}
                    </pre>
                    <div className={`mt-3 inline-flex items-center gap-2 font-mono text-xs ${verifyResult.verified ? 'text-primary' : 'text-destructive'}`}>
                      <div className={`w-2 h-2 ${verifyResult.verified ? 'bg-primary' : 'bg-destructive'}`} />
                      {verifyResult.verified ? "Verification successful — human badge issued" : "Verification failed"}
                    </div>
                  </div>
                )}
                {verifyMutation.isError && (
                  <div className="border border-destructive bg-destructive/10 p-4 font-mono text-xs text-destructive" data-testid="playground-verify-error">
                    {(verifyMutation.error as { message?: string })?.message ?? "Verification request failed"}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
