-- GST registration is not universal (and may not be available during first-touch onboarding), so an active
-- supplier account must be allowed to finish signup without it. The profile/passport flow still lets the
-- supplier add and later verify a GSTIN.
ALTER TABLE platform_suppliers
  DROP CONSTRAINT IF EXISTS platform_suppliers_gst_required_unless_prospect;
