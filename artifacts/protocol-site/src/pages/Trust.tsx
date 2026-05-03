import { LegalPage, LegalSection, LegalList } from "@/components/LegalPage";
import { COMPANY, SUBPROCESSORS, RETENTION } from "@/lib/constants";

export function Trust() {
  return (
    <LegalPage
      eyebrow="Trust & Security"
      title="What we actually protect against"
      intro="An honest description of the threats this service mitigates, the threats it does not mitigate, and how user data is handled."
      testId="page-trust"
    >
      <LegalSection number="01" title="What we protect against" testId="trust-protect">
        <p>
          The {COMPANY.shortName} service is designed to defend applications against three specific
          attacks. Outside this scope, no claim is made.
        </p>
        <LegalList
          testId="trust-protect-list"
          items={[
            <><span className="text-foreground font-medium">Sybil attacks against per-app uniqueness.</span> A single verified human can register a verified badge no more than once per application context (the app's chosen <code className="text-primary">appContext</code> string).</>,
            <><span className="text-foreground font-medium">Trivial bot signups.</span> Every badge is bound to a successful third-party liveness check, so headless scripts and bulk account-creation tooling cannot obtain badges without solving a real liveness challenge.</>,
            <><span className="text-foreground font-medium">Cross-app correlation by default.</span> Nullifiers are HMAC-derived per app context, so two participating applications cannot link a user across them without collusion and a shared identifier outside our system.</>,
          ]}
        />
      </LegalSection>

      <LegalSection number="02" title="What we do NOT protect against" testId="trust-not-protect">
        <p>
          We are deliberately specific about the limits of this service. The following attacks are
          outside the protection envelope and applications must mitigate them with other controls.
        </p>
        <LegalList
          testId="trust-not-protect-list"
          items={[
            <><span className="text-foreground font-medium">Determined deepfake attackers.</span> Liveness vendors raise the cost of synthetic-face attacks but do not eliminate them. State-level adversaries with custom hardware can bypass any commercial liveness product available today.</>,
            <><span className="text-foreground font-medium">Coerced or sold badges.</span> If a real human passes liveness on behalf of an attacker, the resulting badge is valid. We cannot detect duress or sale.</>,
            <><span className="text-foreground font-medium">Decentralization & on-chain auditability.</span> The nullifier registry runs on a single managed Postgres instance. There is no smart contract, no zero-knowledge circuit, and no decentralized governance. Trust in the service is trust in our operations.</>,
            <><span className="text-foreground font-medium">Data-breach immunity.</span> Best-effort security controls are in place, but no system is breach-proof. We do not store raw biometric data; see Section 04.</>,
            <><span className="text-foreground font-medium">Identity verification.</span> A badge proves uniqueness, not identity. Applications requiring "who" must layer KYC on top.</>,
          ]}
        />
      </LegalSection>

      <LegalSection number="03" title="How a verification actually works" testId="trust-flow">
        <p>The end-to-end flow today, in plain language:</p>
        <LegalList
          items={[
            <>An application calls our API to start a verification. We open a hosted liveness check provided by our identity-verification subprocessor (see Section 05).</>,
            <>The user completes the liveness check in the vendor's UI. The vendor returns a signed result identifying the verified subject.</>,
            <>Our server derives a per-app nullifier as <code className="text-primary">HMAC-SHA256(server_master_key, subject || app_context)</code>. We never store the raw subject.</>,
            <>If the nullifier is unused for that app context, we register it and issue a JWT human-badge token signed with our RSA key (published at <code className="text-primary">/.well-known/jwks.json</code>).</>,
            <>The application stores the badge alongside the user's account and verifies it offline against our public JWKS for as long as the badge is needed.</>,
          ]}
        />
        <p className="text-xs text-foreground/60 italic">
          Note: The "real liveness vendor" path described above is partially live. The current public
          demo runs a simulated flow with random data; the production verification path ships in a
          subsequent release. The Demo page labels each mode clearly.
        </p>
      </LegalSection>

      <LegalSection number="04" title="What data we collect & store" testId="trust-data">
        <p>The following data classes flow through our systems. Anything not listed is not collected.</p>
        <LegalList
          items={[
            <><span className="text-foreground font-medium">Liveness vendor session id and result.</span> Stored in our database, used to bind a badge to a verification event.</>,
            <><span className="text-foreground font-medium">Derived subject identifier.</span> A one-way HMAC of the vendor's stable subject value. Used to compute nullifiers.</>,
            <><span className="text-foreground font-medium">Per-app nullifiers.</span> Stored in the <code className="text-primary">commitments</code> table. These are HMAC outputs and cannot be inverted.</>,
            <><span className="text-foreground font-medium">Application metadata.</span> Developer organization, project, API key prefix and hash, and rate-limit counters.</>,
            <><span className="text-foreground font-medium">API request logs.</span> Endpoint, status, latency, request ID, IP address prefix (not full IP).</>,
          ]}
        />
        <p className="text-foreground font-medium mt-2">We never store:</p>
        <LegalList
          items={[
            <>Raw biometric images, video, audio, or feature vectors.</>,
            <>Government identification documents.</>,
            <>The vendor's raw subject identifier in cleartext.</>,
            <>End-user names, emails, or phone numbers (we don't ask for them).</>,
          ]}
        />
      </LegalSection>

      <LegalSection number="05" title="Subprocessors" testId="trust-subprocessors">
        <p>The following third parties may process data on our behalf:</p>
        <div className="border border-border overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="text-left p-3 text-muted-foreground font-normal">Provider</th>
                <th className="text-left p-3 text-muted-foreground font-normal">Purpose</th>
                <th className="text-left p-3 text-muted-foreground font-normal">Region</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((sp) => (
                <tr key={sp.name} className="border-b border-border last:border-b-0">
                  <td className="p-3 text-primary">
                    <a href={sp.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {sp.name}
                    </a>
                  </td>
                  <td className="p-3 text-foreground/80">{sp.purpose}</td>
                  <td className="p-3 text-muted-foreground">{sp.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection number="06" title="Retention" testId="trust-retention">
        <LegalList
          items={[
            <><span className="text-foreground font-medium">Verification records:</span> {RETENTION.verificationRecords}.</>,
            <><span className="text-foreground font-medium">API request logs:</span> {RETENTION.apiRequestLogs}.</>,
            <><span className="text-foreground font-medium">Developer account data:</span> {RETENTION.developerAccountData}.</>,
          ]}
        />
        <p>
          End-users may request deletion of their nullifiers via the application that issued them.
          When all nullifiers tied to a subject are deleted, the subject becomes eligible for
          re-registration in any app context.
        </p>
      </LegalSection>

      <LegalSection number="07" title="Incident response" testId="trust-incident">
        <p>
          Suspected vulnerabilities, abuse, or data exposure should be reported to{" "}
          <a href={`mailto:${COMPANY.securityEmail}`} className="text-primary hover:underline">
            {COMPANY.securityEmail}
          </a>
          . We acknowledge reports within 2 business days. Critical issues affecting badge integrity
          or data exposure trigger notification to affected developer accounts within 72 hours, in
          line with GDPR Article 33 expectations.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
