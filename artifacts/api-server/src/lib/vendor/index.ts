import { mockVendor } from "./mock";
import { personaVendor } from "./persona";

export interface InquirySession {
  inquiryId: string;
  hostedUrl: string;
  vendor: "mock" | "persona";
}

export interface InquiryResult {
  inquiryId: string;
  status: "pending" | "completed" | "approved" | "declined" | "expired" | "failed";
  decision: "approved" | "declined" | null;
  subjectId: string | null;
  raw: unknown;
}

export interface VerificationVendor {
  readonly name: "mock" | "persona";
  /** True if the vendor is fully configured for this environment. */
  isConfigured(): boolean;
  /** Create a hosted inquiry; returns a URL the user can open. */
  createInquiry(args: {
    referenceId: string;
    redirectUri?: string;
  }): Promise<InquirySession>;
  /** Look up an inquiry by id (used after webhook + on register). */
  getInquiry(inquiryId: string): Promise<InquiryResult>;
}

let cached: VerificationVendor | null = null;

/**
 * Default vendor selection. Honors VERIFICATION_VENDOR override, otherwise
 * uses Persona when configured, otherwise the mock. Per-request callers
 * can request a specific vendor via getVendorByName().
 */
export function getVendor(): VerificationVendor {
  if (cached) return cached;
  const forced = process.env.VERIFICATION_VENDOR;
  if (forced === "persona") {
    cached = personaVendor;
    return cached;
  }
  if (forced === "mock") {
    cached = mockVendor;
    return cached;
  }
  cached = personaVendor.isConfigured() ? personaVendor : mockVendor;
  return cached;
}

/**
 * Per-request vendor lookup. Used by /api/inquiries when the client
 * explicitly requests a mode (the Demo's "Quick simulation" vs "Real
 * verification (sandbox)" toggle). Returns null if the requested vendor
 * is not configured for this environment.
 */
export function getVendorByName(name: string): VerificationVendor | null {
  if (name === "mock") return mockVendor;
  if (name === "persona") return personaVendor.isConfigured() ? personaVendor : null;
  return null;
}

export { mockVendor, personaVendor };
