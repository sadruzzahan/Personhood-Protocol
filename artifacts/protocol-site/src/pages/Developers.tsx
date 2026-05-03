import { useEffect, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  useCheckNullifier,
  getCheckNullifierQueryKey,
  useVerifyProof,
} from "@workspace/api-client-react";

const CODE_SNIPPETS: Record<string, string> = {
  JavaScript: `import {
  useCreateInquiry,
  useRegisterCommitment,
  useVerifyProof,
  getInquiry,
} from "@workspace/api-client-react";

// 1. Open a Persona inquiry. Send the user to result.hostedUrl.
const inquiry = await createInquiry.mutateAsync({
  data: { referenceId: yourUserId }
});
window.location.href = inquiry.hostedUrl;

// 2. After the webhook flips status to "approved", register
//    the verification and mint a JWT human badge.
await pollUntilApproved(inquiry.inquiryId);
const reg = await register.mutateAsync({
  data: {
    inquiryId: inquiry.inquiryId,
    appContext: "your-app-id"   // per-app nullifier scope
  }
});

// 3. Anyone can verify the badge against /.well-known/jwks.json
const result = await verify.mutateAsync({
  data: {
    humanBadge: reg.humanBadge,
    appContext: "your-app-id"
  }
});

if (result.verified) markUserAsHuman(reg.humanBadge);`,

  Python: `import httpx, time

BASE = "https://your-domain.com/api"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

# 1. Open a Persona inquiry, send user to hostedUrl.
inq = httpx.post(f"{BASE}/inquiries", headers=HEADERS,
    json={"referenceId": user_id}).json()
redirect_user_to(inq["hostedUrl"])

# 2. Poll until the webhook flips it to "approved".
while True:
    s = httpx.get(f"{BASE}/inquiries/{inq['inquiryId']}",
                  headers=HEADERS).json()
    if s["status"] == "approved":
        break
    time.sleep(1)

# 3. Register: server derives nullifier and mints RS256 JWT.
reg = httpx.post(f"{BASE}/register", headers=HEADERS, json={
    "inquiryId": inq["inquiryId"],
    "appContext": "your-app-id"
}).json()

# 4. Anyone with the public JWKS can verify offline.
result = httpx.post(f"{BASE}/verify", headers=HEADERS, json={
    "humanBadge": reg["humanBadge"],
    "appContext": "your-app-id"
}).json()

if result["verified"]:
    mark_user_as_human(reg["humanBadge"])`,

  Go: `package main

import (
    "bytes"
    "encoding/json"
    "net/http"
)

const base = "https://your-domain.com/api"

inqBody, _ := json.Marshal(map[string]string{
    "referenceId": userID,
})
inqResp, _ := authedPost(base+"/inquiries", inqBody)

var inq struct {
    InquiryID string \`json:"inquiryId"\`
    HostedURL string \`json:"hostedUrl"\`
}
json.NewDecoder(inqResp.Body).Decode(&inq)
redirectUserTo(inq.HostedURL)

// Wait for webhook -> status=approved (omitted).

regBody, _ := json.Marshal(map[string]string{
    "inquiryId":  inq.InquiryID,
    "appContext": "your-app-id",
})
regResp, _ := authedPost(base+"/register", regBody)

var reg struct {
    HumanBadge string \`json:"humanBadge"\`
    Nullifier  string \`json:"nullifier"\`
}
json.NewDecoder(regResp.Body).Decode(&reg)

verBody, _ := json.Marshal(map[string]string{
    "humanBadge": reg.HumanBadge,
    "appContext": "your-app-id",
})
http.Post(base+"/verify", "application/json",
    bytes.NewBuffer(verBody))`,
};

const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/inquiries",
    summary: "Start a verification inquiry",
    desc: "Opens a hosted liveness check with the configured vendor (Persona in production, an auto-approving mock when no vendor credentials are set). Send the end user to the returned hostedUrl. Once they finish, the vendor's webhook flips the inquiry to status=\"approved\" and you can call /register.",
    request: `{
  referenceId?: string  // Your stable user identifier;
                        // never sent to the vendor in the clear.
}`,
    response: `{
  inquiryId: string     // Use this for /register.
  hostedUrl: string     // Send the user here.
  vendor: "persona" | "mock"
  status: "pending"
}`,
    errors: ["503 — Vendor unavailable"],
  },
  {
    method: "GET",
    path: "/api/inquiries/:inquiryId",
    summary: "Poll inquiry status",
    desc: "Returns the current status of an inquiry. Poll this until status=\"approved\" before calling /register, or rely on the webhook your project receives.",
    request: "inquiryId — path parameter",
    response: `{
  inquiryId: string
  status: "pending" | "approved" | "declined" | "expired"
  vendor: "persona" | "mock"
  approvedAt?: string
}`,
    errors: ["404 — Unknown inquiry"],
  },
  {
    method: "POST",
    path: "/api/register",
    summary: "Register a verification & mint badge",
    desc: "After an inquiry is approved, exchange it for a registered nullifier and a JWT human badge. The server derives a per-app nullifier as HMAC(NULLIFIER_MASTER_SECRET, subject || appContext), records it, and signs a 24-hour RS256 JWT against the key published at /.well-known/jwks.json.",
    request: `{
  inquiryId: string     // From POST /api/inquiries
  appContext: string    // Per-app nullifier scope
}`,
    response: `{
  commitmentHash: string
  nullifier: string
  humanBadge: string    // RS256 JWT
  registeredAt: string
  expiresAt: string     // Badge JWT exp
}`,
    errors: [
      "409 — Nullifier already registered for this appContext",
      "409 — Inquiry already consumed",
      "412 — Inquiry not yet approved",
      "422 — Invalid request payload",
    ],
  },
  {
    method: "POST",
    path: "/api/verify",
    summary: "Verify a human badge",
    desc: "Verifies an RS256 human badge: signature against the JWKS, audience matches your project, app_context matches, badge has not expired, and the nullifier is still registered. You can also do this offline yourself by fetching /.well-known/jwks.json — this endpoint exists for convenience and to let you cross-check the registry.",
    request: `{
  humanBadge: string    // RS256 JWT issued by /register
  appContext: string    // Must match the badge's app_context
}`,
    response: `{
  verified: boolean
  nullifier?: string
  commitmentHash?: string
  verifiedAt: string
  message: string
}`,
    errors: ["422 — Invalid request payload"],
  },
  {
    method: "GET",
    path: "/.well-known/jwks.json",
    summary: "Public signing keys (JWKS)",
    desc: "Public RSA keys used to sign human badges. Standard JWKS format — drop into any RS256-aware JWT library (jose, PyJWT, github.com/golang-jwt/jwt) for offline verification. No auth required.",
    request: "(none)",
    response: `{
  keys: [{
    kty: "RSA", alg: "RS256", use: "sig",
    kid: string, n: string, e: string
  }]
}`,
    errors: [],
  },
  {
    method: "POST",
    path: "/api/webhooks/persona",
    summary: "Persona webhook receiver",
    desc: "Receives inquiry.completed events from Persona. Verifies the t=…,v1=… signature against PERSONA_WEBHOOK_SECRET, deduplicates by event id, and updates the inquiry status. Used internally — you only need this if you're operating your own deployment.",
    request: "Persona webhook event (raw JSON body, signed)",
    response: "{ received: true }",
    errors: ["401 — Invalid signature"],
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
  const [verifyBadge, setVerifyBadge] = useState("");
  const [verifyContext, setVerifyContext] = useState("proof-of-personhood-demo");
  const [verifyResult, setVerifyResult] = useState<{
    verified: boolean; nullifier?: string; commitmentHash?: string; verifiedAt: string; message: string;
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
      { data: { humanBadge: verifyBadge.trim(), appContext: verifyContext.trim() } },
      {
        onSuccess: (result) => {
          setVerifyResult({
            verified: result.verified,
            nullifier: result.nullifier,
            commitmentHash: result.commitmentHash,
            verifiedAt: typeof result.verifiedAt === "string" ? result.verifiedAt : new Date(result.verifiedAt as unknown as string).toISOString(),
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
          Drop in unique-human verification with a single API key. Persona-hosted liveness, RS256-signed badges, no biometric data on your servers.
        </p>
        <p className="text-xs font-mono text-muted-foreground mb-16">
          Read the <Link href="/trust" className="text-primary hover:underline" data-testid="link-developers-trust">threat model</Link> before integrating.
        </p>

        <div className="border border-primary/30 bg-primary/5 p-4 mb-12 font-mono text-xs text-foreground/80 leading-relaxed" data-testid="developers-production-notice">
          <p className="text-primary mb-1 tracking-widest uppercase">Verification flow</p>
          <p>
            <code className="text-primary">/inquiries</code> opens a hosted Persona liveness check
            (or an auto-approving mock when <code className="text-primary">PERSONA_API_KEY</code> /
            <code className="text-primary"> PERSONA_TEMPLATE_ID</code> are unset). Once approved,
            <code className="text-primary"> /register</code> mints an RS256 human badge signed
            against the JWKS at <code className="text-primary">/.well-known/jwks.json</code>. Badges
            verify offline; <code className="text-primary">/verify</code> is provided for
            convenience and registry cross-checking.
          </p>
        </div>

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

        <section className="mb-20" data-testid="section-auth-limits">
          <h2 className="text-2xl font-medium mb-2">Authentication, limits, and errors</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-3xl">
            Production hardening surface for the API. Every public endpoint is rate-limited per
            project, accepts <code className="text-primary">Idempotency-Key</code>, and returns a
            stable error envelope you can switch on.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-border">
            <div className="p-6 border-b md:border-b-0 md:border-r border-border">
              <p className="font-mono text-xs text-primary tracking-widest uppercase mb-3">Authorization</p>
              <p className="text-sm text-muted-foreground mb-3">
                Send your project key as a bearer token. Find or rotate keys at{" "}
                <Link href="/dashboard" className="text-primary hover:underline">/dashboard</Link>.
              </p>
              <pre className="text-xs font-mono text-foreground/80 bg-card p-3 border border-border whitespace-pre-wrap">{`Authorization: Bearer pk_test_…   # development
Authorization: Bearer pk_live_…   # production`}</pre>
              <p className="text-xs font-mono text-muted-foreground mt-3">
                Live keys enforce your project's allowed origins on browser requests.
              </p>
            </div>
            <div className="p-6 border-b md:border-b-0 border-border">
              <p className="font-mono text-xs text-primary tracking-widest uppercase mb-3">Rate limits</p>
              <p className="text-sm text-muted-foreground mb-3">
                Token-bucket per project. Every response carries the current state.
              </p>
              <ul className="text-xs font-mono text-muted-foreground space-y-1 mb-3">
                <li><span className="text-primary">—</span> Writes (<code>/register</code>, <code>/verify</code>, <code>/inquiries</code>): 60 req/min</li>
                <li><span className="text-primary">—</span> Reads (<code>/stats</code>, <code>/nullifier/:hash</code>, <code>/inquiries/:id</code>): 600 req/min</li>
              </ul>
              <pre className="text-xs font-mono text-foreground/80 bg-card p-3 border border-border whitespace-pre-wrap">{`X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1
Retry-After: 1   # only on 429`}</pre>
            </div>
            <div className="p-6 border-b md:border-b-0 md:border-r border-border md:border-t">
              <p className="font-mono text-xs text-primary tracking-widest uppercase mb-3">Idempotency</p>
              <p className="text-sm text-muted-foreground mb-3">
                Send <code className="text-primary">Idempotency-Key: &lt;your-uuid&gt;</code> on any
                POST. Repeating the request within 24 hours replays the original byte-for-byte;
                replaying with a different body returns 409.
              </p>
              <pre className="text-xs font-mono text-foreground/80 bg-card p-3 border border-border whitespace-pre-wrap">{`POST /api/register
Authorization: Bearer pk_test_…
Idempotency-Key: 9b2f…d1
Content-Type: application/json

{ "inquiryId": "…", "appContext": "…" }`}</pre>
            </div>
            <div className="p-6 md:border-t border-border">
              <p className="font-mono text-xs text-primary tracking-widest uppercase mb-3">Error envelope</p>
              <p className="text-sm text-muted-foreground mb-3">
                All non-2xx responses use the same shape with a stable{" "}
                <code className="text-primary">error.code</code>.
              </p>
              <pre className="text-xs font-mono text-foreground/80 bg-card p-3 border border-border whitespace-pre-wrap">{`{
  "error": {
    "code": "rate_limited",
    "message": "Rate limit exceeded …",
    "request_id": "f9a1…",
    "details": "(optional)"
  }
}`}</pre>
              <p className="text-xs font-mono text-muted-foreground mt-3">
                Codes include: <code>missing_authorization</code>, <code>invalid_api_key</code>,{" "}
                <code>rate_limited</code>, <code>idempotency_conflict</code>,{" "}
                <code>validation_error</code>, <code>conflict</code>,{" "}
                <code>inquiry_not_found</code>, <code>inquiry_not_approved</code>,{" "}
                <code>inquiry_consumed</code>, <code>invalid_badge</code>,{" "}
                <code>expired_badge</code>, <code>vendor_unavailable</code>,{" "}
                <code>internal_error</code>.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-20" data-testid="section-sdk">
          <h2 className="text-2xl font-medium mb-2">SDK Integration</h2>
          <p className="text-sm text-muted-foreground mb-6">Full inquiry → register → verify flow. Copy, paste, adapt.</p>
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

        <section className="mb-20" data-testid="section-api-reference">
          <h2 className="text-2xl font-medium mb-2">API Reference</h2>
          <p className="text-sm text-muted-foreground mb-8">All endpoints respond with <code className="text-primary font-mono">application/json</code>. Base URL: <code className="text-primary font-mono">/api</code> (JWKS lives at the root <code className="text-primary font-mono">/.well-known/jwks.json</code>).</p>
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

        <section data-testid="section-playground">
          <h2 className="text-2xl font-medium mb-2">Live Playground</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Call the API in real time. Run the <a href="/demo" className="text-primary hover:underline">demo</a> first to get a valid nullifier and human badge for both tabs.
          </p>

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
                      {nullifierData.used ? "Registered nullifier" : "Not yet registered"}
                    </div>
                  </div>
                )}
              </div>
            )}

            {playgroundTab === "verify" && (
              <div className="p-6 flex flex-col gap-4" data-testid="playground-verify">
                <p className="font-mono text-xs text-muted-foreground">
                  Paste an RS256 human badge JWT and the appContext it was minted for.
                </p>
                <textarea
                  className="border border-border bg-background px-4 py-3 font-mono text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors min-h-[120px]"
                  placeholder="eyJhbGciOiJSUzI1NiIs..."
                  value={verifyBadge}
                  onChange={e => setVerifyBadge(e.target.value)}
                  data-testid="input-verify-badge"
                />
                <input
                  type="text"
                  className="border border-border bg-background px-4 py-3 font-mono text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                  placeholder="appContext (e.g. proof-of-personhood-demo)"
                  value={verifyContext}
                  onChange={e => setVerifyContext(e.target.value)}
                  data-testid="input-verify-context"
                />
                <button
                  className="border border-primary bg-primary text-primary-foreground px-6 py-3 font-mono text-xs hover:bg-primary/90 transition-colors disabled:opacity-50 self-start"
                  onClick={runVerify}
                  disabled={!verifyBadge.trim() || !verifyContext.trim() || verifyMutation.isPending}
                  data-testid="button-run-verify"
                >
                  {verifyMutation.isPending ? "..." : "RUN"}
                </button>
                {verifyResult && (
                  <div className="border border-border bg-card p-4" data-testid="playground-verify-result">
                    <p className="font-mono text-xs text-muted-foreground mb-2">RESPONSE 200</p>
                    <pre className="font-mono text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
{JSON.stringify(verifyResult, null, 2)}
                    </pre>
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
