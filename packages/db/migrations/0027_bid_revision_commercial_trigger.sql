DROP TRIGGER IF EXISTS bids_revision_history ON bids;
--> statement-breakpoint
CREATE TRIGGER bids_revision_history
AFTER INSERT OR UPDATE OF unit_price, minimum_order_qty, lead_time_days, currency, tax_percent, freight_amount, quote_validity_date, notes ON bids
FOR EACH ROW EXECUTE FUNCTION record_bid_revision();
