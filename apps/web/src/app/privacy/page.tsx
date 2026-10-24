import type { Metadata } from 'next';
import { LegalArticle, PublicPageHeader, PublicPageShell } from '@/components/public-page-shell';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How vProcly collects, uses, shares, and protects personal information.',
};

export default function PrivacyPage() {
  return (
    <PublicPageShell>
      <PublicPageHeader
        eyebrow="Legal"
        title="Privacy Policy"
        description="This policy explains how vProcly handles personal information when buyers, suppliers, and visitors use our procurement platform."
      />
      <LegalArticle>
        <p><strong>Effective date:</strong> 11 October 2026</p>

        <h2>1. Who we are</h2>
        <p>vProcly provides a business-to-business sourcing and procurement platform for buyers and suppliers. References to “vProcly”, “we”, “our”, or “us” mean the operator of the vProcly service. We are based in Pune, Maharashtra, India.</p>

        <h2>2. Information we collect</h2>
        <p>Depending on how you use the service, we may collect:</p>
        <ul>
          <li>Account information, including your name, business email address, phone number, role, authentication identifiers, and organization.</li>
          <li>Business and supplier information, including company name, GSTIN or other identifiers, locations, categories, capabilities, materials, certifications, and contacts.</li>
          <li>Sourcing information, including BOMs, line items, specifications, quantities, delivery locations, bids, pricing, lead times, clarifications, awards, and fulfillment outcomes.</li>
          <li>Payment and wallet information, including transaction references and payment status. Payment-card details are handled by the relevant payment provider and are not intended to be stored by vProcly.</li>
          <li>Communications and outreach records, including email delivery, call status, support requests, and information you submit in conversations.</li>
          <li>Technical and usage information, including IP address, browser or device information, timestamps, authentication events, logs, and service-performance data.</li>
          <li>Documents and files you upload, together with security-scan results and access records.</li>
        </ul>

        <h2>3. How we obtain information</h2>
        <p>We receive information directly from you, from your organization or authorized users, through your use of the platform, from service providers, and from lawful business sources used for supplier research. Where a buyer invites a supplier, we may initially receive the supplier’s business contact information from that buyer.</p>

        <h2>4. How we use information</h2>
        <p>We use information to:</p>
        <ul>
          <li>Create and secure accounts and organization workspaces.</li>
          <li>Operate sourcing, supplier matching, outreach, bidding, award, wallet, and fulfillment workflows.</li>
          <li>Process uploaded files and protect the service from malicious content.</li>
          <li>Provide supplier scoring, pricing insights, reporting, and service improvements using appropriate access controls and privacy thresholds.</li>
          <li>Send transactional communications, sourcing invitations, account notices, and support responses.</li>
          <li>Detect fraud, misuse, security incidents, and violations of our Terms.</li>
          <li>Maintain audit records, resolve disputes, and comply with legal obligations.</li>
        </ul>

        <h2>5. Buyer and supplier visibility</h2>
        <p>vProcly uses a blind-bidding model. Before an award, suppliers receive limited sourcing information and are not shown the buyer’s identity through the supplier experience. Buyers can review the suppliers and bids submitted to their sourcing requests. After an award, information needed to complete the transaction may be shared with the winning supplier.</p>

        <h2>6. How we share information</h2>
        <p>We may share information:</p>
        <ul>
          <li>With authorized users of the buyer or supplier organization to which the information relates.</li>
          <li>Between a buyer and a supplier as required to run a sourcing event or fulfill an awarded order, subject to the platform’s blind-bidding rules.</li>
          <li>With hosting, authentication, storage, email, communications, payment, analytics, security, and other service providers acting on our behalf.</li>
          <li>When required by law, legal process, or a valid government request, or when reasonably necessary to protect rights, safety, and the integrity of the service.</li>
          <li>As part of a merger, financing, acquisition, reorganization, or sale of assets, subject to appropriate confidentiality protections.</li>
        </ul>
        <p>We do not sell personal information as a standalone product.</p>

        <h2>7. International processing</h2>
        <p>Our service providers may process information in India and other countries. Where information is transferred across borders, we use appropriate contractual, organizational, and technical safeguards and comply with applicable transfer restrictions.</p>

        <h2>8. Retention</h2>
        <p>We retain information for as long as reasonably necessary to provide the service, meet contractual and legal obligations, maintain security and audit records, resolve disputes, and enforce agreements. Retention periods depend on the type of information and the purpose for which it is processed. We may retain limited records after account closure where legally required or necessary to preserve transaction and audit history.</p>

        <h2>9. Security</h2>
        <p>We use safeguards designed to protect information, including access controls, tenant isolation, encryption in transit, audit logging, malware scanning for uploads, and restricted document access. No system is completely secure, and we cannot guarantee that unauthorized access will never occur.</p>

        <h2>10. Your choices and rights</h2>
        <p>Subject to applicable law, you may request access to information about you, correction of inaccurate information, deletion, withdrawal of consent, or grievance redressal. Some information may need to be retained for legal, security, fraud-prevention, or transaction-record purposes.</p>
        <p>To exercise a privacy right or withdraw consent, email <a href="mailto:support@vprocly.com">support@vprocly.com</a>. We may need to verify your identity and authority before completing a request.</p>

        <h2>11. Cookies and similar technologies</h2>
        <p>vProcly may use cookies and similar technologies that are necessary for authentication, security, session continuity, preferences, and service operation. Where required, we will request permission before using optional technologies.</p>

        <h2>12. Children</h2>
        <p>vProcly is a business service and is not intended for children. Users must be legally capable of entering into a binding agreement and authorized to act for their organization.</p>

        <h2>13. Changes to this policy</h2>
        <p>We may update this policy to reflect changes in the service, our practices, or applicable law. We will publish the revised policy with a new effective date and provide additional notice where required.</p>

        <h2>14. Contact and grievances</h2>
        <p>For privacy questions, requests, or grievances, contact:</p>
        <p><strong>vProcly</strong><br />Pune, Maharashtra, India<br /><a href="mailto:support@vprocly.com">support@vprocly.com</a></p>
      </LegalArticle>
    </PublicPageShell>
  );
}
