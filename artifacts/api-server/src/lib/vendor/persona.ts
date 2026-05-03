import { createHash } from "node:crypto";
import type { InquiryResult, InquirySession, VerificationVendor } from "./index";
import { logger } from "../logger";

const PERSONA_BASE = "https://withpersona.com/api/v1";

function env() {
  return {
    apiKey: process.env.PERSONA_API_KEY ?? "",
    templateId: process.env.PERSONA_TEMPLATE_ID ?? "",
    environmentId: process.env.PERSONA_ENVIRONMENT_ID ?? "",
  };
}

function deriveSubjectId(personaAccountId: string): string {
  // Persona's account_id is already a stable opaque identifier per natural
  // person within a Persona account. Hash it once more so we never store
  // the raw vendor id in our DB.
  return createHash("sha256")
    .update(`persona|account|${personaAccountId}`)
    .digest("hex");
}

interface PersonaInquiryResource {
  id: string;
  type: "inquiry";
  attributes: {
    status: string;
    "reference-id"?: string;
    fields?: Record<string, unknown>;
  };
  relationships?: {
    account?: { data?: { id: string } | null };
  };
}

function mapStatus(s: string): InquiryResult["status"] {
  switch (s) {
    case "approved":
      return "approved";
    case "completed":
      return "completed";
    case "declined":
      return "declined";
    case "expired":
      return "expired";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

export const personaVendor: VerificationVendor = {
  name: "persona",
  isConfigured() {
    const { apiKey, templateId } = env();
    return Boolean(apiKey && templateId);
  },
  async createInquiry({ referenceId, redirectUri }) {
    const { apiKey, templateId, environmentId } = env();
    if (!apiKey || !templateId) {
      throw new Error("Persona vendor not configured");
    }
    const body = {
      data: {
        attributes: {
          "inquiry-template-id": templateId,
          "reference-id": referenceId,
          ...(environmentId ? { "environment-id": environmentId } : {}),
          ...(redirectUri ? { "redirect-uri": redirectUri } : {}),
        },
      },
    };
    const resp = await fetch(`${PERSONA_BASE}/inquiries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Persona-Version": "2023-01-05",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      logger.error({ status: resp.status, text }, "Persona createInquiry failed");
      throw new Error(`Persona createInquiry failed: ${resp.status}`);
    }
    const json = (await resp.json()) as { data: PersonaInquiryResource };
    const inquiryId = json.data.id;
    // Persona's hosted flow lives at withpersona.com/verify
    const hostedUrl = `https://withpersona.com/verify?inquiry-id=${encodeURIComponent(
      inquiryId,
    )}`;
    return { inquiryId, hostedUrl, vendor: "persona" };
  },
  async getInquiry(inquiryId): Promise<InquiryResult> {
    const { apiKey } = env();
    if (!apiKey) throw new Error("Persona vendor not configured");
    const resp = await fetch(
      `${PERSONA_BASE}/inquiries/${encodeURIComponent(inquiryId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Persona-Version": "2023-01-05",
        },
      },
    );
    if (resp.status === 404) {
      return {
        inquiryId,
        status: "failed",
        decision: null,
        subjectId: null,
        raw: { reason: "not_found" },
      };
    }
    if (!resp.ok) {
      throw new Error(`Persona getInquiry failed: ${resp.status}`);
    }
    const json = (await resp.json()) as { data: PersonaInquiryResource };
    const status = mapStatus(json.data.attributes.status);
    const accountId = json.data.relationships?.account?.data?.id ?? null;
    const subjectId = accountId ? deriveSubjectId(accountId) : null;
    return {
      inquiryId,
      status,
      decision: status === "approved" ? "approved" : status === "declined" ? "declined" : null,
      subjectId,
      raw: json.data,
    };
  },
};

export { deriveSubjectId };
