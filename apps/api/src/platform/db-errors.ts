/** Drizzle wraps driver errors; returns the Postgres SQLSTATE if present. */
export function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

export const PG_UNIQUE_VIOLATION = '23505';
