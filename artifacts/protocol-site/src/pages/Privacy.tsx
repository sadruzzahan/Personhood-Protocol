import { LegalPage, LegalSection, LegalList } from "@/components/LegalPage";
import { COMPANY, SUBPROCESSORS, RETENTION } from "@/lib/constants";

export function Privacy() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro={`How ${COMPANY.shortName} (operated by ${COMPANY.legalName}) collects, uses, stores, and discloses information about developers who use our API and end-users who complete a verification.`}
      testId="page-privacy"
    >
      <LegalSection number="01" title="Who this applies to" testId="privacy-scope">
        <p>
          This policy applies to two distinct populations: <span className="text-foreground font-medium">developers</span> who
          create accounts on our dashboard to obtain API keys, and <span className="text-foreground font-medium">end-users</span>
          {" "}of those developers' applications who complete a verification through us. The data we
          collect from each population, and our legal basis for processing it, differ. Both are
          described below.
        </p>
      </LegalSection>

      <LegalSection number="02" title="Information we collect — developers" testId="privacy-dev-data">
        <LegalList
          items={[
            <><span className="text-foreground font-medium">Account information:</span> name, email, organization name, and authentication provider, collected via Clerk when you sign up.</>,
            <><span className="text-foreground font-medium">Project & API key metadata:</span> project name, environment, allowed origins, API key prefixes and hashes (we never store full keys at rest).</>,
            <><span className="text-foreground font-medium">Usage data:</span> aggregated request counts, error rates, and rate-limit consumption shown in your dashboard.</>,
            <><span className="text-foreground font-medium">Communications:</span> support emails and responses to product surveys.</>,
          ]}
        />
      </LegalSection>

      <LegalSection number="03" title="Information we collect — end-users" testId="privacy-user-data">
        <LegalList
          items={[
            <><span className="text-foreground font-medium">Liveness verification result:</span> a session identifier and pass/fail decision returned by our identity-verification subprocessor (Persona). We do not receive or store the underlying biometric capture.</>,
            <><span className="text-foreground font-medium">Derived subject identifier:</span> a one-way HMAC of the subject value supplied by the vendor. Used solely to compute per-app nullifiers.</>,
            <><span className="text-foreground font-medium">Nullifiers:</span> HMAC outputs scoped to the application context. Cannot be inverted to recover the underlying subject.</>,
            <><span className="text-foreground font-medium">Request metadata:</span> timestamps, IP address prefixes (truncated to /24 for IPv4), and user-agent strings, retained per Section 06.</>,
          ]}
        />
        <p className="text-foreground/60 italic text-xs">
          The application that initiated your verification may collect additional information governed
          by its own privacy policy. We do not control how it uses your badge token.
        </p>
      </LegalSection>

      <LegalSection number="04" title="How we use information" testId="privacy-use">
        <LegalList
          items={[
            <>Operate the verification API and developer dashboard.</>,
            <>Detect abuse, enforce rate limits, and investigate security incidents.</>,
            <>Send transactional emails about your developer account (account changes, security alerts, billing if applicable).</>,
            <>Comply with legal obligations and respond to lawful requests.</>,
          ]}
        />
        <p>We do not sell personal data and do not use it to train machine-learning models.</p>
      </LegalSection>

      <LegalSection number="05" title="Subprocessors" testId="privacy-subprocessors">
        <p>We share the minimum necessary information with the following providers:</p>
        <LegalList
          items={SUBPROCESSORS.map((sp) => (
            <>
              <span className="text-foreground font-medium">{sp.name}</span> — {sp.purpose} ({sp.region}).{" "}
              <a href={sp.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Privacy policy
              </a>
              .
            </>
          ))}
        />
      </LegalSection>

      <LegalSection number="06" title="Retention" testId="privacy-retention">
        <LegalList
          items={[
            <>Verification records & nullifiers: {RETENTION.verificationRecords}.</>,
            <>API request logs: {RETENTION.apiRequestLogs}.</>,
            <>Developer account data: {RETENTION.developerAccountData}.</>,
          ]}
        />
      </LegalSection>

      <LegalSection number="07" title="Your rights (GDPR / CCPA)" testId="privacy-rights">
        <p>
          If you are an EEA, UK, or California resident you have the right to access, correct, port,
          and delete your personal data, and to object to or restrict its processing. To exercise
          these rights, email{" "}
          <a href={`mailto:${COMPANY.privacyEmail}`} className="text-primary hover:underline">
            {COMPANY.privacyEmail}
          </a>
          . We respond within 30 days.
        </p>
        <p>
          End-users wishing to delete their nullifiers should make the request through the
          application that initiated the verification; that application can call our deletion endpoint
          on your behalf. We will honor a direct request only if you can prove the underlying subject
          identifier.
        </p>
      </LegalSection>

      <LegalSection number="08" title="International transfers" testId="privacy-transfers">
        <p>
          Data is stored in the United States. For users in the EEA and UK, transfers are made under
          the Standard Contractual Clauses or equivalent safeguards offered by our subprocessors.
        </p>
      </LegalSection>

      <LegalSection number="09" title="Changes" testId="privacy-changes">
        <p>
          We will post material changes to this policy at least 30 days before they take effect and
          notify developers via email. Continued use after the effective date constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection number="10" title="Contact" testId="privacy-contact">
        <p>
          {COMPANY.legalName}, organized in {COMPANY.jurisdiction}.
          <br />
          Email:{" "}
          <a href={`mailto:${COMPANY.privacyEmail}`} className="text-primary hover:underline">
            {COMPANY.privacyEmail}
          </a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
