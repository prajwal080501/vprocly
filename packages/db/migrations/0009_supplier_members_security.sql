-- supplier_members is platform-level like platform_suppliers (no tenant_id): no RLS, scoped by the service
-- layer instead. AuthGuard never queries it -- see the comment on the table in marketplace.ts.
GRANT SELECT, INSERT, UPDATE ON supplier_members TO vprocly_app;
