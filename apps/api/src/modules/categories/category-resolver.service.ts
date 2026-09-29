import { Inject, Injectable, Logger } from '@nestjs/common';
import { categories, type Tx } from '@vprocly/db';
import { cosineDistance, eq, isNotNull, sql } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { PlatformDb } from '../../platform/platform-db.service.js';

/** Below this cosine similarity, two category texts are treated as different categories, not a spelling
 *  variant of the same one. Deliberately conservative: sprawl (near-duplicate categories) is a cheap,
 *  recoverable failure mode; wrongly merging "Brake Pads" into "Brake Discs" is not. */
const SIMILARITY_THRESHOLD = 0.86;

/**
 * The category taxonomy used to be a fixed, migration-grown list (0004, 0010) -- every new industry meant a
 * human hand-writing a migration. This makes it open-ended: free text gets embedded and matched against
 * existing categories by meaning, not spelling, so "Steel Products" and "Steel & Metal Products" collapse
 * onto one row instead of sprawling, while a genuinely new domain ("Textile Dyes") just creates a new row.
 *
 * `categories` has no RLS (platform-level, shared across every tenant, exactly like `platform_suppliers` --
 * see marketplace.ts), so this always goes through PlatformDb, never a tenant transaction, regardless of
 * which module calls it.
 *
 * Resilience: if the embeddings API is unset, unreachable, or errors, resolution falls back to a plain
 * case-insensitive exact-name match/create. An AI-provider outage should degrade category quality, never
 * break a buyer's BOM commit or a supplier's signup.
 */
@Injectable()
export class CategoryResolverService {
  private readonly logger = new Logger(CategoryResolverService.name);

  constructor(
    private readonly platformDb: PlatformDb,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  list() {
    return this.platformDb.run((tx) => tx.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.isPredefined, true)).orderBy(categories.name));
  }

  /** Read-only nearest-neighbor lookup for a type-ahead -- never creates anything. Falls back to a substring
   *  search when there's no embedding available (API unset, or a row predates/missed embedding). */
  async suggest(query: string, limit = 5): Promise<{ id: string; name: string }[]> {
    const text = query.trim();
    if (!text) return [];
    const embedding = await this.embed(text);
    if (embedding) {
      return this.platformDb.run((tx) =>
        tx
          .select({ id: categories.id, name: categories.name })
          .from(categories)
          .where(isNotNull(categories.embedding))
          .orderBy(cosineDistance(categories.embedding, embedding))
          .limit(limit),
      );
    }
    return this.platformDb.run((tx) =>
      tx
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(sql`${categories.name} ILIKE ${`%${text}%`}`)
        .orderBy(categories.name)
        .limit(limit),
    );
  }

  /** Free text in, a `categoryId` out -- reusing an existing category when one is close enough in meaning,
   *  otherwise creating a new one. This is the only place a new category row is ever created. */
  async resolve(text: string): Promise<string> {
    const trimmed = text.trim();
    const embedding = await this.embed(trimmed);
    if (embedding) return this.resolveWithEmbedding(trimmed, embedding);
    return this.resolveByExactName(trimmed);
  }

  private async resolveWithEmbedding(name: string, embedding: number[]): Promise<string> {
    return this.platformDb.run(async (tx) => {
      const [nearest] = await tx
        .select({ id: categories.id, distance: cosineDistance(categories.embedding, embedding) })
        .from(categories)
        .where(isNotNull(categories.embedding))
        .orderBy(cosineDistance(categories.embedding, embedding))
        .limit(1);
      if (nearest && 1 - Number(nearest.distance) >= SIMILARITY_THRESHOLD) return nearest.id;
      return this.insertOrReuseByName(tx, name, embedding);
    });
  }

  private async resolveByExactName(name: string): Promise<string> {
    return this.platformDb.run(async (tx) => {
      const [existing] = await tx.select({ id: categories.id }).from(categories).where(sql`lower(${categories.name}) = lower(${name})`);
      if (existing) return existing.id;
      return this.insertOrReuseByName(tx, name, null);
    });
  }

  /** `categories.name` is UNIQUE, so a race with another request resolving the exact same new name loses the
   *  insert, not the row -- fall back to reading it back rather than erroring. */
  private async insertOrReuseByName(tx: Tx, name: string, embedding: number[] | null): Promise<string> {
    const [inserted] = await tx.insert(categories).values({ name, embedding }).onConflictDoNothing({ target: categories.name }).returning({ id: categories.id });
    if (inserted) return inserted.id;
    const [raced] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.name, name));
    return raced!.id;
  }

  private async embed(text: string): Promise<number[] | null> {
    if (!this.config.GEMINI_API_KEY) return null;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.config.GEMINI_EMBEDDING_MODEL}:embedContent?key=${this.config.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: { parts: [{ text }] } }),
        },
      );
      if (!res.ok) {
        this.logger.warn(`Gemini embedding request failed (${res.status}); falling back to exact-name matching for "${text}"`);
        return null;
      }
      const data = (await res.json()) as { embedding?: { values?: number[] } };
      return data.embedding?.values ?? null;
    } catch (err) {
      this.logger.warn(`Gemini embedding request errored; falling back to exact-name matching for "${text}": ${String(err)}`);
      return null;
    }
  }
}
