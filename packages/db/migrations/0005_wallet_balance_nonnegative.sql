-- Defense in depth: even if a future caller forgets to check balance before debiting, the database refuses
-- to let a supplier's wallet go negative.
ALTER TABLE wallet_balances ADD CONSTRAINT wallet_balances_nonnegative CHECK (balance >= 0);
