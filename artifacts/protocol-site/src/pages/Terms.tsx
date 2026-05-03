import { LegalPage, LegalSection, LegalList } from "@/components/LegalPage";
import { COMPANY } from "@/lib/constants";

export function Terms() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      intro={`These terms govern your use of the ${COMPANY.shortName} API and developer dashboard, operated by ${COMPANY.legalName}.`}
      testId="page-terms"
    >
      <LegalSection number="01" title="Agreement" testId="terms-agreement">
        <p>
          By creating an account, generating an API key, or making a request to our API, you agree to
          these terms on behalf of yourself and the entity you represent. If you do not agree, do not
          use the service.
        </p>
      </LegalSection>

      <LegalSection number="02" title="Acceptable use" testId="terms-acceptable">
        <p>You will not, and will not permit users of your application to:</p>
        <LegalList
          items={[
            <>Use the service to deceive end-users about whether they are interacting with a verified human.</>,
            <>Attempt to bypass, disable, or interfere with rate limits, authentication, or signing keys.</>,
            <>Use the service for any illegal purpose, including violations of applicable export controls or sanctions.</>,
            <>Resell badges, expose raw subject identifiers, or otherwise enable cross-application correlation that the protocol design is meant to prevent.</>,
            <>Run automated load tests against the production environment without prior written approval.</>,
            <>Use the service to verify users under the age of 13 (or the higher minimum age in your jurisdiction).</>,
          ]}
        />
      </LegalSection>

      <LegalSection number="03" title="Rate limits & fair use" testId="terms-rate-limits">
        <p>
          Default rate limits are documented in the developer portal. We may throttle, queue, or
          reject requests that exceed your plan's limits. Sustained excess load may result in
          temporary suspension of an API key.
        </p>
      </LegalSection>

      <LegalSection number="04" title="Billing" testId="terms-billing">
        <p>
          The current release is offered free of charge under a usage cap. Once paid plans launch,
          continued use beyond the free tier will require an active payment method and acceptance of
          a separate billing agreement. We will provide at least 30 days' notice before any free-tier
          changes affect your account.
        </p>
      </LegalSection>

      <LegalSection number="05" title="Service levels" testId="terms-sla">
        <p>
          The service is provided <span className="text-foreground font-medium">as-is</span> without any service-level commitment.
          We publish a public status page and target high availability, but no uptime SLA, latency
          SLA, or credits are guaranteed at this stage.
        </p>
      </LegalSection>

      <LegalSection number="06" title="Confidentiality of API keys" testId="terms-keys">
        <p>
          API keys are bearer tokens. Anyone holding a key can act on behalf of the issuing project.
          You are responsible for keeping keys secret, rotating them on suspected compromise, and
          revoking keys for departed employees. We are not liable for losses caused by leaked keys.
        </p>
      </LegalSection>

      <LegalSection number="07" title="No warranty" testId="terms-warranty">
        <p>
          To the maximum extent permitted by law, the service is provided without warranties of any
          kind, express or implied, including warranties of merchantability, fitness for a particular
          purpose, and non-infringement. We do not warrant that any verification result is suitable
          for any specific use case, including KYC, AML, voting, financial transactions, or
          life-safety decisions.
        </p>
      </LegalSection>

      <LegalSection number="08" title="Limitation of liability" testId="terms-liability">
        <p>
          To the maximum extent permitted by law, our aggregate liability arising out of or relating
          to the service is limited to the greater of (a) the fees you paid us in the 12 months
          preceding the event giving rise to liability, or (b) one hundred US dollars (USD 100). We
          are not liable for indirect, consequential, special, or punitive damages, including lost
          profits or lost data.
        </p>
      </LegalSection>

      <LegalSection number="09" title="Indemnification" testId="terms-indemnification">
        <p>
          You will defend and indemnify us against claims arising from your application's use of the
          service, your violation of these terms, or your violation of applicable law.
        </p>
      </LegalSection>

      <LegalSection number="10" title="Termination" testId="terms-termination">
        <p>
          You may stop using the service at any time and delete your account from the dashboard. We
          may suspend or terminate your account for material breach of these terms or to protect the
          integrity of the service. Sections 06–11 survive termination.
        </p>
      </LegalSection>

      <LegalSection number="11" title="Governing law" testId="terms-law">
        <p>
          These terms are governed by the laws of {COMPANY.jurisdiction}, without regard to conflict
          of laws principles. Disputes will be resolved exclusively in the state or federal courts
          located in that jurisdiction.
        </p>
      </LegalSection>

      <LegalSection number="12" title="Contact" testId="terms-contact">
        <p>
          Questions about these terms?{" "}
          <a href={`mailto:${COMPANY.contactEmail}`} className="text-primary hover:underline">
            {COMPANY.contactEmail}
          </a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
