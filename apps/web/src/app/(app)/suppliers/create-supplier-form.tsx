'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createSupplier, type CreateSupplierState } from './actions';

const input = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent';

export function CreateSupplierForm() {
  const [state, action, pending] = useActionState<CreateSupplierState, FormData>(createSupplier, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-5">
      <input name="code" placeholder="Code" className={input} required />
      <input name="name" placeholder="Name" className={`${input} sm:col-span-2`} required />
      <input name="taxId" placeholder="GSTIN (optional)" className={input} />
      <button
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
      >
        {pending ? 'Adding…' : 'Add supplier'}
      </button>
      {state.error && <p className="text-sm text-danger sm:col-span-5">{state.error}</p>}
    </form>
  );
}
