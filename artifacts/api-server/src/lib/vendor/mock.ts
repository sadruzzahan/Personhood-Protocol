import { createHash, randomUUID } from "node:crypto";
import type { InquiryResult, InquirySession, VerificationVendor } from "./index";

// In-memory store of mock inquiries. Auto-approves after a short delay so
// the demo flow can simulate a hosted liveness check end-to-end without
// any external vendor account.
interface MockInquiry {
  inquiryId: string;
  referenceId: string;
  createdAt: number;
  // null until "auto-approval" elapses, then a stable hash of the reference id
  // so re-using the same reference yields the same subject.
  subjectId: string | null;
  status: "pending" | "completed" | "approved";
}

const inquiries = new Map<string, MockInquiry>();
const AUTO_APPROVE_AFTER_MS = 1500;

function maybeAdvance(inq: MockInquiry): void {
  if (inq.status === "approved") return;
  if (Date.now() - inq.createdAt >= AUTO_APPROVE_AFTER_MS) {
    inq.subjectId = createHash("sha256")
      .update(`mock|${inq.referenceId}`)
      .digest("hex");
    inq.status = "approved";
  }
}

export const mockVendor: VerificationVendor = {
  name: "mock",
  isConfigured() {
    return true;
  },
  async createInquiry({ referenceId }) {
    const inquiryId = `mock_inq_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    inquiries.set(inquiryId, {
      inquiryId,
      referenceId,
      createdAt: Date.now(),
      subjectId: null,
      status: "pending",
    });
    // For the mock vendor the "hosted URL" is a self-completing client-side
    // page. We wire the demo to skip the redirect and just poll status.
    const session: InquirySession = {
      inquiryId,
      hostedUrl: `mock://inquiry/${inquiryId}`,
      vendor: "mock",
    };
    return session;
  },
  async getInquiry(inquiryId): Promise<InquiryResult> {
    const inq = inquiries.get(inquiryId);
    if (!inq) {
      return {
        inquiryId,
        status: "failed",
        decision: null,
        subjectId: null,
        raw: { reason: "unknown_inquiry" },
      };
    }
    maybeAdvance(inq);
    return {
      inquiryId: inq.inquiryId,
      status: inq.status,
      decision: inq.status === "approved" ? "approved" : null,
      subjectId: inq.subjectId,
      raw: { mock: true, reference_id: inq.referenceId },
    };
  },
};
