import type { Metadata } from 'next';
import { LegalArticle, PublicPageHeader, PublicPageShell } from '@/components/public-page-shell';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms governing access to and use of the vProcly platform.',
};

export default function TermsPage() {
  return (
    <PublicPageShell>
      <PublicPageHeader
        eyebrow="Legal"
        title="Terms of Service"
        description="These terms govern access to and use of the vProcly sourcing and procurement platform."
      />
      <LegalArticle>
        <p><strong>Effective date:</strong> 11 October 2026</p>

        <h2>1. Acceptance</h2>
        <p>By creating an account, accessing, or using vProcly, you agree to these Terms of Service. If you use vProcly for a company or other organization, you represent that you have authority to bind that organization. If you do not agree, do not use the service.</p>

        <h2>2. The service</h2>
        <p>vProcly provides tools for business sourcing and procurement, including sourcing requests, supplier matching and research, outreach, bidding, clarification, bid comparison, awards, wallet points, draft purchase-order records, and fulfillment tracking. Features may vary by plan, configuration, geography, and availability of third-party services.</p>
        <p>vProcly facilitates interactions between independent buyers and suppliers. Unless expressly agreed in writing, vProcly is not the buyer, seller, manufacturer, supplier, logistics provider, inspection agency, or party to a purchase contract formed between users.</p>

        <h2>3. Accounts and organizations</h2>
        <p>You must provide accurate information, keep it current, protect your credentials, and promptly notify us of suspected unauthorized access. You are responsible for activity performed through your account and for ensuring that users you invite have appropriate authority and permissions.</p>

        <h2>4. Buyer responsibilities</h2>
        <p>Buyers are responsible for the accuracy and legality of sourcing requests, specifications, quantities, delivery requirements, supplier invitations, award decisions, and purchase commitments. Buyers must not use the service to solicit prohibited goods or services, mislead suppliers, harvest information, or run sourcing events without a genuine business purpose.</p>

        <h2>5. Supplier responsibilities</h2>
        <p>Suppliers are responsible for the accuracy of their identity, qualifications, certifications, capabilities, availability, quotations, tax information, lead times, and fulfillment representations. A submitted bid must be made by an authorized person and must not be false, misleading, collusive, or unlawful.</p>

        <h2>6. Blind bidding and confidentiality</h2>
        <p>vProcly may restrict buyer identity and other information during a sourcing event. Users must not attempt to bypass blind-bidding controls, identify another participant through prohibited means, access competing bids, interfere with a sourcing event, or disclose confidential information obtained through the service without authorization.</p>

        <h2>7. Bids, awards, and transactions</h2>
        <p>A bid is a supplier’s commercial submission. An award recorded in vProcly reflects the buyer’s selection but does not replace any purchase order, contract, quality agreement, tax document, or other document required by the parties or applicable law. Buyers and suppliers are responsible for performing their transaction and resolving commercial, quality, delivery, warranty, tax, and payment matters between themselves.</p>

        <h2>8. Wallet points and payments</h2>
        <p>Certain supplier actions may use wallet points. Applicable point charges are shown in the service. Unless stated otherwise, points are platform credits, have no cash value, are not transferable, and are not a bank deposit or stored-value account. Paid refills, where enabled, are processed through a third-party payment provider and may be subject to additional payment terms.</p>
        <p>Refunds, reversals, expiry, promotional credits, and taxes are governed by the terms displayed when points are granted or purchased and by applicable law. Contact us if you believe a charge or wallet entry is incorrect.</p>

        <h2>9. User content</h2>
        <p>You retain ownership of information, files, specifications, messages, and other content you submit. You grant vProcly a limited, worldwide right to host, copy, process, transmit, display, and otherwise use that content as necessary to operate, secure, support, and improve the service and fulfill your requests.</p>
        <p>You represent that you have the rights and permissions necessary to submit the content and that it does not violate law, confidentiality obligations, privacy rights, intellectual-property rights, or third-party terms.</p>

        <h2>10. Acceptable use</h2>
        <p>You must not:</p>
        <ul>
          <li>Use the service for unlawful, fraudulent, deceptive, abusive, or anti-competitive activity.</li>
          <li>Upload malware or attempt to compromise, probe, overload, reverse engineer, or circumvent the service’s security.</li>
          <li>Scrape, resell, or build an unauthorized database from platform information.</li>
          <li>Impersonate another person or organization or falsify business information.</li>
          <li>Send unlawful or unsolicited communications through the platform.</li>
          <li>Use another user’s confidential information outside the intended procurement transaction.</li>
        </ul>

        <h2>11. Intellectual property</h2>
        <p>vProcly and its licensors retain all rights in the platform, software, branding, interfaces, documentation, and related technology, excluding user content. These Terms provide a limited, revocable, non-exclusive, non-transferable right to use the service for your organization’s legitimate business purposes.</p>

        <h2>12. Third-party services</h2>
        <p>The service may depend on third-party authentication, hosting, storage, communications, research, payment, mapping, or other providers. Their services may have separate terms and may occasionally be unavailable. vProcly is not responsible for third-party products or for matters outside its reasonable control.</p>

        <h2>13. Suspension and termination</h2>
        <p>You may stop using the service at any time. We may restrict or suspend access when reasonably necessary to address security risks, suspected misuse, non-payment, legal requirements, or material breaches of these Terms. Where appropriate, we will provide notice and an opportunity to remedy the issue.</p>

        <h2>14. Disclaimers</h2>
        <p>The service is provided on an “as available” basis. To the extent permitted by law, vProcly disclaims implied warranties, including merchantability, fitness for a particular purpose, and non-infringement. Supplier matches, research results, scores, benchmarks, and recommendations are decision-support information and do not guarantee supplier identity, capability, quality, price, compliance, availability, or performance. Users must perform their own commercial and technical due diligence.</p>

        <h2>15. Limitation of liability</h2>
        <p>To the extent permitted by law, vProcly will not be liable for indirect, incidental, special, exemplary, punitive, or consequential losses, or for lost profits, revenue, data, business opportunity, or goodwill arising from the service. vProcly’s aggregate liability relating to the service will not exceed the fees paid by the affected organization to vProcly during the 12 months preceding the event giving rise to the claim. Nothing in these Terms excludes liability that cannot lawfully be excluded.</p>

        <h2>16. Indemnity</h2>
        <p>To the extent permitted by law, your organization will defend and indemnify vProcly against third-party claims, losses, and reasonable costs arising from your content, your transactions, your unlawful or unauthorized use of the service, or your material breach of these Terms.</p>

        <h2>17. Changes</h2>
        <p>We may update these Terms to reflect changes in the service, business practices, or law. We will publish updated Terms with a revised effective date and provide additional notice where required. Continued use after the updated Terms take effect constitutes acceptance to the extent permitted by law.</p>

        <h2>18. Governing law and disputes</h2>
        <p>These Terms are governed by the laws of India. Subject to any mandatory dispute-resolution rights under applicable law, courts located in Pune, Maharashtra will have exclusive jurisdiction over disputes arising from these Terms or the service.</p>

        <h2>19. Contact</h2>
        <p>Questions about these Terms may be sent to:</p>
        <p><strong>vProcly</strong><br />Pune, Maharashtra, India<br /><a href="mailto:support@vprocly.com">support@vprocly.com</a></p>
      </LegalArticle>
    </PublicPageShell>
  );
}
