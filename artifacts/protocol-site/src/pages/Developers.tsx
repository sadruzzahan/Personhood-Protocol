import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
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

// 1. Register a biometric commitment
const register = useRegisterCommitment();

register.mutate({
  data: {
    biometricData: captureLocalBiometric(),
    deviceTier: "secure_enclave",
    appContext: "your-app-id"
  }
}, {
  onSuccess: ({ commitmentHash, nullifier, proofGenerationMs }) => {
    // Store nullifier for verification step
    // commitmentHash is published on-chain
    const proof = generateZkProof(biometric, proofGenerationMs);

    // 2. Verify the proof
    verify.mutate({
      data: { proof, nullifier, appContext: "your-app-id" }
    }, {
      onSuccess: ({ verified, humanBadge }) => {
        if (verified) markUserAsHuman(humanBadge);
      }
    });
  }
});`,

  Python: `import httpx

BASE = "https://your-domain.com/api"

# 1. Register a biometric commitment
reg = httpx.post(f"{BASE}/register", json={
    "biometricData": capture_local_biometric(),
    "deviceTier": "secure_enclave",
    "appContext": "your-app-id"
}).json()

commitment_hash = reg["commitmentHash"]
nullifier = reg["nullifier"]
proof_ms = reg["proofGenerationMs"]

# 2. Generate ZK proof (on device)
proof = generate_zk_proof(biometric, proof_ms)

# 3. Verify
result = httpx.post(f"{BASE}/verify", json={
    "proof": proof,
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

// 1. Register commitment
regBody, _ := json.Marshal(map[string]string{
    "biometricData": captureLocalBiometric(),
    "deviceTier":    "secure_enclave",
    "appContext":    "your-app-id",
})
regResp, _ := http.Post(base+"/register",
    "application/json", bytes.NewBuffer(regBody))

var reg struct {
    CommitmentHash string  \`json:"commitmentHash"\`
    Nullifier      string  \`json:"nullifier"\`
    ProofMs        float64 \`json:"proofGenerationMs"\`
}
json.NewDecoder(regResp.Body).Decode(&reg)

// 2. Generate ZK proof on device
proof := generateZkProof(reg.ProofMs)

// 3. Verify
verBody, _ := json.Marshal(map[string]string{
    "proof": proof, "nullifier": reg.Nullifier,
    "appContext": "your-app-id",
})
http.Post(base+"/verify", "application/json",
    bytes.NewBuffer(verBody))`,
};

const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/register",
    summary: "Register a biometric commitment",
    desc: "Accepts a biometric payload, generates a cryptographic commitment hash and nullifier, stores them, and returns the commitment details.",
    request: `{
  biometricData: string   // Base64 biometric payload
  deviceTier: "software" | "secure_enclave" | "specialized"
  appContext: string      // Application context for scoped nullifier
}`,
    response: `{
  commitmentHash: string  // C = Hash(biometric, salt)
  nullifier: string       // N = Hash(biometric, appContext)
  registeredAt: string    // ISO timestamp
  proofGenerationMs: number
}`,
    errors: ["409 — Nullifier already registered", "422 — Invalid biometric payload"],
  },
  {
    method: "POST",
    path: "/api/verify",
    summary: "Verify a ZK proof",
    desc: "Verifies a ZK proof against the commitment registry. Returns a human badge token on success.",
    request: `{
  proof: string      // zkSNARK proof blob
  nullifier: string  // From registration step
  appContext: string // Must match registration context
}`,
    response: `{
  verified: boolean
  humanBadge?: string  // Present if verified === true
  verifiedAt: string
  message: string
}`,
    errors: ["422 — Invalid proof payload"],
  },
  {
    method: "GET",
    path: "/api/stats",
    summary: "Protocol statistics",
    desc: "Returns aggregate protocol statistics. No parameters required.",
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
    desc: "Returns whether a nullifier hash has been registered, enabling duplicate-registration detection.",
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
        <h1 className="text-4xl font-medium tracking-tight mb-4">Build with the Protocol</h1>
        <p className="text-muted-foreground font-mono text-sm mb-16">
          Integrating proof of personhood into any application requires fewer than 20 lines of code.
        </p>

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
                <p className="font-mono text-xs text-muted-foreground">Submit a ZK proof and nullifier to verify humanhood. Returns a <code className="text-primary">humanBadge</code> token on success.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="font-mono text-xs text-muted-foreground">proof</label>
                    <input
                      type="text"
                      className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      placeholder="zk_abc123... (any non-empty string)"
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
