/**
 * @proofofperson/browser — open a Proof of Personhood flow from the
 * browser, get back a human-badge JWT.
 *
 * Pipeline (matches the hand-rolled fetch in /demo):
 *   1. POST {baseUrl}/api/inquiries   — open hosted liveness check
 *   2. window.open(hostedUrl)         — user completes Persona flow
 *   3. poll {baseUrl}/api/inquiries/:id until status === "approved"
 *   4. POST {baseUrl}/api/register    — exchange for badge
 *   5. callback receives { humanBadge, nullifier, commitmentHash, expiresAt }
 *
 * Nothing is persisted to localStorage; the badge is held in module-scope
 * memory and exposed via getBadge() / cleared via signOut().
 */

export interface VerifyArgs {
  /** Project public key (`pk_test_…` or `pk_live_…`). */
  projectKey: string;
  /** Per-app nullifier scope. Same value across reverifications. */
  appContext: string;
  /** Optional opaque correlation id for your records. */
  referenceId?: string;
  /** "mock" runs the in-process simulator; "persona" forces the real flow. */
  mode?: "mock" | "persona";
  /** Override the API base URL. Defaults to `https://api.proofofperson.com`. */
  baseUrl?: string;
  /** Called once on success. */
  onSuccess?: (badge: HumanBadge) => void;
  /** Called on the first error. */
  onError?: (err: ProofOfPersonBrowserError) => void;
  /** Max time to wait for the user to complete the hosted flow. Defaults to 5 min. */
  hostedTimeoutMs?: number;
}

export interface HumanBadge {
  humanBadge: string;
  nullifier: string;
  commitmentHash: string;
  registeredAt: string;
  expiresAt: string;
}

export type BrowserSdkErrorCode =
  | "inquiry_failed"
  | "hosted_flow_timeout"
  | "register_failed"
  | "network_error"
  | "user_cancelled";

export class ProofOfPersonBrowserError extends Error {
  readonly code: BrowserSdkErrorCode;
  readonly cause?: unknown;
  constructor(code: BrowserSdkErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "ProofOfPersonBrowserError";
    this.code = code;
    this.cause = cause;
  }
}

export interface PoPClient {
  /** Run the full flow. Resolves with the badge; the callback also fires. */
  verify(args: Omit<VerifyArgs, "projectKey">): Promise<HumanBadge>;
  /** Returns the badge from the most recent successful verify(), if any. */
  getBadge(): HumanBadge | null;
  /** Clear in-memory badge. Does not call any server endpoint. */
  signOut(): void;
}

const DEFAULT_BASE = "https://api.proofofperson.com";

export function createClient(opts: { projectKey: string; baseUrl?: string }): PoPClient {
  if (!opts.projectKey) {
    throw new Error("createClient: projectKey is required");
  }
  let badge: HumanBadge | null = null;

  return {
    async verify(args) {
      try {
        badge = await runVerifyFlow({
          ...args,
          projectKey: opts.projectKey,
          baseUrl: args.baseUrl ?? opts.baseUrl,
        });
        args.onSuccess?.(badge);
        return badge;
      } catch (err) {
        const wrapped =
          err instanceof ProofOfPersonBrowserError
            ? err
            : new ProofOfPersonBrowserError(
                "network_error",
                err instanceof Error ? err.message : String(err),
                err,
              );
        args.onError?.(wrapped);
        throw wrapped;
      }
    },
    getBadge: () => badge,
    signOut: () => {
      badge = null;
    },
  };
}

async function runVerifyFlow(args: VerifyArgs): Promise<HumanBadge> {
  const base = args.baseUrl ?? DEFAULT_BASE;
  const headers = {
    authorization: `Bearer ${args.projectKey}`,
    "content-type": "application/json",
  };

  // 1. Open the inquiry.
  const inquiryRes = await safeFetch(`${base}/api/inquiries`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      referenceId: args.referenceId,
      ...(args.mode ? { mode: args.mode } : {}),
    }),
  });
  if (!inquiryRes.ok) {
    throw new ProofOfPersonBrowserError(
      "inquiry_failed",
      `Failed to open inquiry: ${inquiryRes.status}`,
    );
  }
  const inquiry = (await inquiryRes.json()) as {
    inquiryId: string;
    hostedUrl: string;
    vendor: "mock" | "persona";
  };

  // 2. Open the hosted flow in a new window when it's a real Persona run.
  let popupRef: Window | null = null;
  if (inquiry.vendor === "persona" && typeof window !== "undefined") {
    popupRef = window.open(inquiry.hostedUrl, "_blank", "noopener,noreferrer");
  }

  // 3. Poll until approved (mock auto-approves; Persona waits on the user).
  const deadline = Date.now() + (args.hostedTimeoutMs ?? 5 * 60_000);
  const pollHeaders = { authorization: `Bearer ${args.projectKey}` };
  let approved = false;
  while (Date.now() < deadline) {
    await sleep(800);
    if (popupRef && popupRef.closed && !approved) {
      // Don't give up immediately — Persona may still finalize via webhook
      // after the popup is closed. But surface the cancel hint after a few
      // post-close polls fail.
    }
    const statusRes = await safeFetch(
      `${base}/api/inquiries/${encodeURIComponent(inquiry.inquiryId)}`,
      { method: "GET", headers: pollHeaders },
    );
    if (!statusRes.ok) continue;
    const body = (await statusRes.json()) as { status: string };
    if (body.status === "approved") {
      approved = true;
      break;
    }
    if (body.status === "declined" || body.status === "expired" || body.status === "failed") {
      throw new ProofOfPersonBrowserError(
        "user_cancelled",
        `Inquiry ended with status: ${body.status}`,
      );
    }
  }
  if (!approved) {
    throw new ProofOfPersonBrowserError(
      "hosted_flow_timeout",
      "User did not complete the hosted flow in time",
    );
  }

  // 4. Exchange for a human badge.
  const regRes = await safeFetch(`${base}/api/register`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      inquiryId: inquiry.inquiryId,
      appContext: args.appContext,
    }),
  });
  if (!regRes.ok) {
    throw new ProofOfPersonBrowserError(
      "register_failed",
      `Failed to register: ${regRes.status}`,
    );
  }
  return (await regRes.json()) as HumanBadge;
}

async function safeFetch(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    throw new ProofOfPersonBrowserError(
      "network_error",
      err instanceof Error ? err.message : "Network error",
      err,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
