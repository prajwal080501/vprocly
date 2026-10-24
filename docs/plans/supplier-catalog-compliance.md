# Supplier catalogue and outreach compliance plan

Date reviewed: 2026-10-07

This is an engineering and product plan, not legal advice. Indian counsel and the selected telecom provider should approve the production outreach design.

## Current-state findings

### Researched suppliers are persisted and reused

The worker stores every accepted research result in `platform_suppliers` with `status = 'prospect'`, stores the category in `supplier_categories`, and records source URLs, Place ID, query, discovery time and originating sourcing line in `discovery_metadata`. A successful run is recorded in `supplier_research_runs`.

Future requests reuse this data in two ways:

1. `SourcingService.commitLine` matches active suppliers first. If there are no active suppliers, it matches stored prospects by exact category and ranks them by city/state.
2. When fewer than five suppliers are available, `supplier-research-agent` checks stored prospects before calling Gemini/Places again and notifies those prospects locally.

This means research is not ephemeral. It builds a platform-level supplier prospect database used across buyer tenants.

### Matching gaps to fix

- The synchronous matcher reads prospects only when there are zero active matches. If one to four active suppliers exist, stored prospects are not used in the initial result.
- A recent successful research run suppresses another unmatched event. In the one-to-four-active-supplier case this can prevent the worker from reusing stored prospects during the cooldown window.
- Deduplication is email-only. A shared mailbox can merge two establishments, and the stored Place ID is not indexed as a unique external identifier.
- Prospect fields are copied into the permanent supplier row without per-field provenance, permitted-use metadata, retention dates or a last-verified timestamp.
- A supplier is promoted by matching its signup email. There is no separate claim review or proof that the registrant controls the represented business.
- Only capabilities exist today. There is no product/catalogue entity, variant, media, price-list or publication workflow.

## Target catalogue model

Keep discovery, identity and supplier-authored catalogue data separate.

### Supplier identity and claim

- `platform_suppliers`: canonical company identity and lifecycle: `unclaimed`, `claim_pending`, `active`, `suspended`, `suppressed`.
- `supplier_sources`: source type, URL, external ID, terms/licence version, lawful/use basis, first seen, last checked, allowed fields and expiry.
- `supplier_field_provenance`: supplier ID, field path, source record, captured value hash, observed time, verification status and supplier-confirmed time.
- `supplier_claims`: claimant member, verification method, submitted evidence, reviewer/status and timestamps.
- Put Google Place IDs and other provider identifiers in `supplier_identifiers`, with a uniqueness constraint on `(type, value)`; do not leave them only in JSON.

### Catalogue

- `supplier_products`: supplier-owned product/service record with name, supplier SKU, description, brand/manufacturer, HSN, UOM, status and visibility.
- `supplier_product_categories`: many-to-many link to the shared category vocabulary.
- `supplier_product_variants`: attribute JSON, manufacturer part number, MOQ, lead time and order unit.
- `supplier_product_prices`: optional currency, amount, price basis, minimum quantity, valid-from/to and visibility. Keep bid prices separate.
- `supplier_product_media`: document ID, media type, sort order, alt text, rights attestation and moderation status. Store files through the existing scanned document pipeline.
- `catalog_import_jobs`: supplier-uploaded CSV/XLSX imports with row-level errors and idempotency keys.
- Never copy third-party catalogue text, images, brochures, badges, ratings or reviews without an express licence. An unclaimed listing should contain only licensed/minimal discovery facts.

### Publication rules

- Unclaimed prospects are internal discovery records and are not presented as verified catalogue suppliers.
- Only supplier-authored or expressly licensed products may be published.
- Supplier onboarding includes an asset-rights warranty and a licence for Vprocly to host, transform, search and display submitted catalogue content.
- Buyers match only against active suppliers by default. A separately controlled prospect-outreach pipeline may consider unclaimed records after compliance checks.
- Every visible field has provenance, verification state and `last_verified_at`.

## Matching changes

1. Query active and eligible prospects in one candidate pipeline, while preserving status as a ranking/eligibility feature.
2. Fill remaining slots from stored prospects before emitting a research job, even when active matches exist.
3. Make the cooldown key include category and meaningful geography, or calculate cooldown only after local prospects have filled the current request.
4. Exclude suppressed, stale, licence-expired and do-not-contact suppliers before creating notifications.
5. Add tests for: two active plus three cached prospects; recent research cooldown plus cached prospects; stale source; suppressed prospect; duplicate external ID; and claim promotion preserving source history.

## TRAI/TCCCPR changes

Treat an unsolicited RFQ invitation to a researched supplier as promotional outreach unless counsel and the telecom provider confirm another classification. A public phone number is not telecom consent.

### Must complete before live voice/SMS/WhatsApp outreach

- Register Vprocly/the correct sender as a Principal Entity on a telecom provider's DLT platform.
- Use a registered telemarketer/communications provider and contractually assign compliance, complaint and evidence responsibilities.
- Register required sender identities, headers, consent templates and content templates for each channel and purpose.
- Use the numbering series required for the communication class; confirm Sarvam supports the applicable 140/160 series and passes the correct PE/template/CLI metadata.
- When the 2026 amendment takes effect, declare all application-to-person/AI calling and CLI ranges to the Originating Access Provider before enabling automated campaigns.
- Store verifiable, channel-specific explicit consent and its DLT/consent-register reference. Consent must include recipient, sender, purpose, channel, wording/version, source, time and revocation.
- Check consent, registered preference/DND eligibility, suppression, permitted time window and frequency cap at send time, not only when a prospect is discovered.
- Preserve a supplier-originated written/digital enquiry when relying on the limited enquiry relationship; when the 2026 amendment takes effect, that relationship is narrowed to seven days.
- Implement STOP/opt-out ingestion, global and per-channel suppression, complaint handling, audit export and immediate campaign cancellation.
- Separate each tenant/sender's approved identity and telecom resources where required; never let one customer's campaign silently use another customer's consent or sender identity.

### Immediate code policy

- Keep `VOICE_DELIVERY_MODE=capture` for researched/unclaimed prospects.
- Allow live automated calls only after a centralized `OutreachPolicy` returns an auditable allow decision.
- Prefer a single transparent claim invitation to a generic company email until telecom compliance is operational. Do not treat named personal addresses as generic business mailboxes.

## DPDP changes

Most substantive notice, security, rights and retention rules are scheduled to apply from 2027-05-13, but the data model and workflows should be ready before then.

- Classify fields as company data, generic business contact data, or personal data. Names, named emails, direct mobiles, call recordings and transcripts are personal data.
- Record a processing purpose and basis for every personal-data source. Do not assume that appearing on a directory proves the individual made the data public.
- Add `contact_consents` rather than relying on the unused `supplier_contacts.consent_at`: purpose, channel, notice version, evidence, source, granted/withdrawn/expiry times and DLT reference.
- Add `contact_suppressions`: scope, channel, reason, source and effective time. Suppression must override opportunity-alert preferences.
- Default opportunity alerts to off until the supplier affirmatively opts in. Separate required transactional messages from optional opportunity marketing.
- Deliver a clear privacy notice at collection/first direct interaction with itemised data, purposes, withdrawal, rights and grievance contact.
- Add self-service access, correction, export, deletion and grievance workflows; support an unclaimed-person request without requiring account creation.
- Define retention schedules for unclaimed prospects, failed outreach, consent evidence, call recordings/transcripts, source snapshots and inactive accounts. Run deletion jobs and retain only legally required evidence.
- Minimise voice data: avoid storing full transcripts unless required, redact unnecessary identifiers and set short retention.
- Add purpose-based access control, encryption, audit logs, processor contracts and a breach-response workflow with required notifications.
- Review cross-border processing and vendor regions for Gemini, Google Places, Sarvam, SMTP, hosting and analytics.
- Maintain a record of processors, data flows, notice versions and deletion evidence.

## External-data licensing

- Do not use IndiaMART scraping or an unofficial IndiaMART API for the catalogue.
- Obtain written bulk-use, storage, derivative-use and redistribution rights before importing any marketplace data.
- Review Google Maps Platform terms before persisting Places business fields. Prefer storing a permitted stable identifier and supplier-confirmed facts rather than using Places content as a permanent directory.
- Require any data vendor to provide provenance, permitted uses, refresh/deletion feeds, warranties and indemnity.

## Delivery sequence

### P0 — before enabling production discovery outreach

- Central outreach policy and suppression checks.
- Voice remains capture-only for unclaimed prospects.
- Source/licence/provenance fields and retention dates.
- Fix local matching to fill from cached prospects before new research.
- Legal review of Google Places persistence and supplier-site email extraction.

### P1 — claimable supplier directory

- Supplier source, claim, consent and suppression tables.
- Claim verification and correction/takedown flows.
- Supplier-authored company profile and capability publication.
- Privacy notice, grievance and data-rights endpoints.

### P2 — catalogue MVP

- Products, categories, variants, prices and media.
- CSV/XLSX import using the existing document scan and Excel parsing infrastructure.
- Draft/review/publish workflow and buyer catalogue search.

### P3 — compliant multichannel outreach

- PE/DLT/provider setup, registered templates and numbering.
- Consent registry integration, preference checks, scheduling and frequency controls.
- Complaint and revocation webhooks, evidence export and compliance dashboards.
