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

  private async applyDelta(
    tx: Tx,
    platformSupplierId: string,
    delta: number,
    type: 'grant' | 'debit' | 'credit',
    refType: string,
    refId: string,
  ): Promise<number> {
    const [row] = await tx
      .insert(walletBalances)
      .values({ platformSupplierId, balance: delta })
      .onConflictDoUpdate({ target: walletBalances.platformSupplierId, set: { balance: sql`${walletBalances.balance} + ${delta}` } })
      .returning({ balance: walletBalances.balance });
    await tx.insert(walletLedger).values({ platformSupplierId, type, points: delta, refType, refId, balanceAfter: row!.balance });
    return row!.balance;
  }

  async balance(tx: Tx, platformSupplierId: string): Promise<number> {
    const [row] = await tx.select({ balance: walletBalances.balance }).from(walletBalances).where(eq(walletBalances.platformSupplierId, platformSupplierId));
    return row?.balance ?? 0;
  }
}
