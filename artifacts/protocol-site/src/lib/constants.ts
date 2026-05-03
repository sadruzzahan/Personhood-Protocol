export const COMPANY = {
  legalName: "Proof of Personhood Foundation",
  shortName: "POP Protocol",
  contactEmail: "legal@popprotocol.example",
  privacyEmail: "privacy@popprotocol.example",
  securityEmail: "security@popprotocol.example",
  jurisdiction: "Delaware, United States",
  effectiveDate: "May 1, 2026",
} as const;

export const SUBPROCESSORS = [
  { name: "Persona", purpose: "Identity verification & liveness checks", region: "United States", url: "https://withpersona.com" },
  { name: "Clerk", purpose: "Developer authentication for the dashboard", region: "United States", url: "https://clerk.com" },
  { name: "Replit Deployments", purpose: "Application hosting & managed Postgres", region: "United States", url: "https://replit.com" },
] as const;

export const RETENTION = {
  verificationRecords: "24 months from last activity",
  apiRequestLogs: "30 days",
  developerAccountData: "Until account deletion + 30 days",
} as const;
