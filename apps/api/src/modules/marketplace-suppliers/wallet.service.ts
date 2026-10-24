import { Injectable } from '@nestjs/common';
import { walletBalances, walletLedger, type Tx } from '@vprocly/db';
import { eq, sql } from 'drizzle-orm';

export const SIGNUP_GRANT_POINTS = 1000;
export const BID_FEE_POINTS = 1; // spent in Phase B when a supplier submits a bid

/** Append-only ledger (mirrors budget_ledger): every balance change is a row, the cache is just for fast reads. */
@Injectable()
export class WalletService {
  async grant(tx: Tx, platformSupplierId: string, points: number, refType: string, refId: string): Promise<number> {
    return this.applyDelta(tx, platformSupplierId, points, 'grant', refType, refId);
  }

  async debit(tx: Tx, platformSupplierId: string, points: number, refType: string, refId: string): Promise<number> {
    return this.applyDelta(tx, platformSupplierId, -points, 'debit', refType, refId);
  }

  async credit(tx: Tx, platformSupplierId: string, points: number, refType: string, refId: string): Promise<number> {
    return this.applyDelta(tx, platformSupplierId, points, 'credit', refType, refId);
  }

  private async applyDelta(
    tx: Tx,
    platformSupplierId: string,
    delta: number,
    type: 'grant' | 'debit' | 'credit',
    refType: string,
    refId: string,
  ): Promise<number> {
    // Deliberately not `INSERT ... ON CONFLICT DO UPDATE`: Postgres validates a CHECK constraint against
    // the raw INSERT values while resolving the speculative insert, before it even checks for a conflict --
    // so a debit that would land on an existing row just fine (balance stays >= 0 after the update) still
    // throws, because the *insert* branch's literal value (a negative delta) fails the check on its own.
    // A plain UPDATE only ever checks the constraint against the actual final row.
    const [updated] = await tx
      .update(walletBalances)
      .set({ balance: sql`${walletBalances.balance} + ${delta}` })
      .where(eq(walletBalances.platformSupplierId, platformSupplierId))
      .returning({ balance: walletBalances.balance });
    const balance = updated
      ? updated.balance
      : (await tx.insert(walletBalances).values({ platformSupplierId, balance: delta }).returning({ balance: walletBalances.balance }))[0]!.balance;
    await tx.insert(walletLedger).values({ platformSupplierId, type, points: delta, refType, refId, balanceAfter: balance });
    return balance;
  }

  async balance(tx: Tx, platformSupplierId: string): Promise<number> {
    const [row] = await tx.select({ balance: walletBalances.balance }).from(walletBalances).where(eq(walletBalances.platformSupplierId, platformSupplierId));
    return row?.balance ?? 0;
  }
}
