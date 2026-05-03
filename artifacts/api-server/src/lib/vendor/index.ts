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
 * Selection rule: if a vendor explicitly self-reports configured, use it.
 * Otherwise fall back to the mock vendor so the demo flow keeps working
 * without any external account setup. Override with VERIFICATION_VENDOR.
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

export { mockVendor, personaVendor };
