# MVP pivot: BOM-to-bid sourcing marketplace

## Context

The original 18-week plan (see `~/.claude/plans/analyse-the-docs-and-zesty-fiddle.md`, Sprints S1–S8) built toward a
procurement-to-finance **control** platform: Excel-first master data, internal approval chains, invite-only RFQ, ERP as
system of record. Sprint 0 (the platform foundation — tenancy, RLS, audit, events, documents, Keycloak) is done and
stays as the base for whatever ships next.

This document is a different, more focused wedge the user asked for on 2026-09-26: a **blind-bid sourcing marketplace**.
A buyer posts a BOM or manually-entered line items; the platform matches and emails potential suppliers; suppliers
self-register, bid without seeing who the buyer is, and only learn the buyer's identity once a bid is accepted. Bidding
costs wallet points.

This is not additive to S1–S3 — it **replaces the near-term priority**. It reuses S0's foundation directly and reuses
most of what S1 (Excel import) would have built, just applied to sourcing lines instead of generic master data.

**Confirmed decisions** (user, 2026-09-26):
1. Wallet: 1 point = ₹1 (conceptually). New supplier gets **1000 points free** on signup. Each line-item bid **debits 1
   point**. Non-refundable if not selected.
2. Matching: rule-based (category + location) for v1. AI/semantic ranking (pgvector, already provisioned) is a
   fast-follow, not MVP.
3. Cold start: buyer can invite specific supplier emails per line, in addition to auto-matching against the registered
   pool.

**Flagged, not blocking:** a wallet with real cash value can trigger India's RBI prepaid-instrument (PPI) rules.
Recommendation: ship the MVP wallet as **points-only, no real-money top-up** (free grant only). Real top-up via a
payment gateway is a fast-follow once checked with counsel — do not build it into the MVP.

---

## Architecture decision: supplier identity is platform-level, not tenant-scoped

Every table built in Sprint 0 assumes `tenant_id` + Postgres RLS. Suppliers break that assumption — the same supplier
bids across many buyer tenants, so a supplier cannot be *owned* by one tenant's RLS partition.

**Decision:** two separate concepts, not one:
- `suppliers` (already exists, tenant-scoped) — a buyer's own vendor master, used for POs/ERP sync. Unchanged.
- `platform_suppliers` (new, platform-level, no `tenant_id`, no RLS) — the marketplace identity: global account, GST,
  categories, location, wallet.

When a buyer accepts a bid, the platform auto-creates/links a row in *that buyer's* `suppliers` table from the winning
`platform_suppliers` record. This feeds the existing vendor-master/PO module instead of duplicating it.

**Auth (as actually built):** one realm, one client (`vprocly`/`vprocly-web` — a separate `vprocly-suppliers` realm
turned out unnecessary), issuing tokens with a `platform_supplier_id` claim and **no** `tenant_id` claim for a
supplier login. Two independent guards fork on which claim is present, and never both run on the same route:
- `AuthGuard` (global, `tenant_id` required) → existing tenant-RLS path (buyers, internal users). Unchanged.
- `SupplierAuthGuard` (`@UseGuards`, applied per-route alongside `@Public()` to skip the global guard entirely,
  `platform_supplier_id` + `supplier` role required) → supplier endpoints only (`/supplier/me`, `/supplier/lines`,
  `/supplier/lines/:id/bids`), never queries tenant tables directly.

---

## Data model (additions)

New module `marketplace-suppliers` (platform-level, not RLS-protected by tenant; protected instead by
`platform_supplier_id = caller` checks):
- `platform_suppliers(id, name, gst, email, phone, city, state, country, keycloak_subject, status, created_at)`
- `supplier_categories(platform_supplier_id, category_id)` — many-to-many against the existing `categories` table.

New module `sourcing` (tenant-scoped, RLS as usual):
- `sourcing_requests(id, tenant_id, title, source ['bom_upload'|'manual'], import_batch_id nullable, status, created_by, created_at)`
- `sourcing_lines(id, sourcing_request_id, item_code, description, category_id, qty, uom, delivery_city, delivery_state, need_by, status ['open'|'awarded'|'closed'])`

New module `bidding` (mixed access: tenant-scoped reads for the buyer side, supplier-scoped for the supplier side —
this is where the blind-identity rule lives):
- `bids(id, tenant_id, sourcing_line_id, platform_supplier_id, unit_price, lead_time_days, notes, status ['submitted'|'accepted'|'rejected'|'withdrawn'], created_at, updated_at)` — tenant-scoped + RLS like the line it bids on (see migration 0012); one active bid per (line, supplier), enforced by a unique constraint. A resubmission updates it while the line is open, via `submit_supplier_bid` (SECURITY DEFINER, since the caller has no tenant session at all).
- `sourcing_line_notifications` (already built in Phase A) doubles as the "cold-start invite" and the "matched supplier can see this on their dashboard" record — no separate `bid_invites` table was needed.

New module `wallet` (platform-level, append-only — same pattern as the `budget_ledger` already built):
- `wallet_ledger(id, platform_supplier_id, type ['grant'|'debit'|'credit'], points, ref_type, ref_id, balance_after, created_at)` — `ref_id` on a debit is the `bid.id`, with a unique constraint so a bid is only ever charged once, even on retry.
- Balance is derived from the ledger (or cached in a `wallet_balances` row updated in the same transaction as each ledger insert, mirroring `budgets`/`budget_ledger`).

**Categories/location for matching:** reuses the `categories` table already sketched in the original plan. Matching
query: `sourcing_line.category_id` must match one of the supplier's `supplier_categories`; rank by
`delivery_city == supplier.city` > `delivery_state == supplier.state` > no location match. A category match is
required for auto-matching; a buyer's manual email-invite bypasses this entirely (cold start).

---

## Flow

**Buyer** (existing tenant/Keycloak login):
1. "New sourcing request" → Upload BOM (reuses the Excel service's inspect/map/validate/stage pipeline as-is,
   committing into `sourcing_lines` instead of generic master data) **or** add lines manually (simple repeating form:
   item code/description, category, qty, UOM, delivery city/state, need-by).
2. On commit, each line is matched against `platform_suppliers` (category + location). Matched, already-registered
   suppliers see the line on their dashboard immediately. The buyer can also type in specific supplier emails per line
   to invite directly (cold start).
3. Unregistered invited suppliers get an email with a signed, expiring link to that specific line.

**Supplier:**
4. Clicks the link → if no account, a lightweight signup (name, GST, category, email prefilled from the invite) →
   dropped straight into that line's bid screen. Sees item spec, qty, delivery location, need-by — **never the buyer's
   company name.**
5. Returning suppliers log in to a dashboard: open items to bid on, "My Bids" with status, wallet balance always
   visible.
6. Submits a price → wallet debited 1 point (checked and debited atomically with bid creation; insufficient balance
   blocks the bid with a clear message) → bid recorded. Suppliers never see competing bids on the same line.

**Buyer, again:**
7. Reviews all bids on a line (sees supplier name/GST/price — the buyer is *not* blinded) → accepts one.
8. On accept: the line closes, other bids on it are marked "not selected" (losing suppliers never learn the buyer's
   identity), the winner gets an email + dashboard reveal of company name/contacts/delivery details, and a row is
   created/linked in the buyer's `suppliers` vendor-master table plus a draft PO (feeding the existing procurement
   module).

---

## Phased build (reuses S0; ~6 weeks, 3 phases)

| Phase | Weeks | Scope |
|---|---|---|
| **A** | 3–4 | Done. `sourcing` module: BOM upload (Excel pipeline retargeted to `sourcing_lines`) + manual line entry. `marketplace-suppliers` module + `platform_suppliers` table + rule-based category/location matching. |
| **B** | 5–6 | Done. Supplier self-serve signup (`POST /supplier-signup`, no invite needed) and invite-gated signup both work; login uses the same Keycloak realm/client as buyers, forked on `platform_supplier_id` vs `tenant_id` (`SupplierAuthGuard`, not a separate realm — the plan's original two-realm idea turned out unnecessary). Dashboard (`/supplier/dashboard`): open lines matched via `sourcing_line_notifications`, blind (item code/description/qty/uom/need-by only). Bidding (`submit_supplier_bid`, migration 0012) debits `BID_FEE_POINTS` once per (line, supplier) atomically with the bid write; a price revision on an existing bid is free. Deleting a sourcing request with any bid on it is now blocked (`sourcing.service.ts` `remove()`). |
| **C** | 7–8 | Buyer-side bid review/accept, blind-identity enforcement (tested explicitly — see below), reveal-on-accept email, auto-create vendor-master row + draft PO, "not selected" notification for losing bids. |

This reorders (does not discard) the original plan: S1's Excel pipeline is built here, just aimed at sourcing lines.
Generic master-data import (items/UOM/cost-centres/budgets) and the internal approval/budget-control flow (original
S3) are deferred until after this marketplace wedge proves out.

---

## Required tests (beyond the usual RLS/audit/event coverage already in place)

- **Blind-identity enforcement**: an explicit test that a supplier-authenticated request for a line with no accepted
  bid from that supplier never contains the buyer's tenant name/contact fields anywhere in the response — this is a
  security property, not just a UI concern, so it must be enforced and tested at the API layer.
- **Wallet**: debit is atomic with bid creation (no bid without a debit, no debit without a bid); a bid is never
  charged twice on retry; insufficient balance blocks the bid before any write.
- **Accept flow**: accepting one bid closes the line and rejects the others in the same transaction; the reveal email
  only fires for the accepted supplier.

## Deferred / open items

- Real-money wallet top-up (payment gateway) — blocked on legal review of PPI implications.
- Semantic/AI-assisted supplier matching (pgvector) — v1.1, once rule-based matching is live and its match quality is
  measured.
- Refund policy for a line the buyer cancels without awarding — not specified yet; current default is non-refundable
  same as a normal unselected bid, but this should be confirmed before it comes up with a real pilot supplier.
- Multiple bids per supplier per line (e.g. revising a price) — MVP allows updating the one active bid while the line
  is open; a full bid-history/audit-trail view is not in scope yet.
