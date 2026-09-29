'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { createSupplier, type CreateSupplierState } from './actions';

export function CreateSupplierForm() {
  const [state, action, pending] = useActionState<CreateSupplierState, FormData>(createSupplier, {});
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      form.current?.reset();
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        Add supplier
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className="border-b pb-4">
          <DialogTitle>Add supplier</DialogTitle>
          <DialogDescription>Create a supplier record in this tenant catalog.</DialogDescription>
        </DialogHeader>
        <form ref={form} action={action}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="supplier-code">Code</FieldLabel>
              <Input id="supplier-code" name="code" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-name">Name</FieldLabel>
              <Input id="supplier-name" name="name" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-tax-id">GSTIN</FieldLabel>
              <Input id="supplier-tax-id" name="taxId" placeholder="Optional" />
            </Field>
            {state.error && <FieldError>{state.error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={pending}>{pending ? 'Adding' : 'Add supplier'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
