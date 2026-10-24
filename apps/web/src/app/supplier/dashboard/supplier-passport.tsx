'use client';

import { useActionState, useEffect, useState } from 'react';
import { BadgeCheckIcon, MapPinIcon, PackageSearchIcon, PencilIcon, PhoneIcon, ScanTextIcon, TagsIcon } from 'lucide-react';
import { CategoryPicker } from '@/components/category-picker';
import { IconTile } from '@/components/icon-tile';
import { MotionReveal } from '@/components/motion-reveal';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { Category, SupplierMe, SupplierPassport as Passport } from '@/lib/types';
import { updateSupplierPassport, type UpdatePassportState } from './actions';

export function SupplierPassport({ passport, supplier, categories }: { passport: Passport; supplier: SupplierMe; categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(passport.capabilities.map((row) => row.categoryName));
  const [state, action, pending] = useActionState<UpdatePassportState, FormData>(updateSupplierPassport, {});
  useEffect(() => { if (state.success) setOpen(false); }, [state.success]);
  const identifier = (type: string) => passport.identifiers.find((row) => row.type === type)?.value ?? '';
  const location = passport.locations.find((row) => row.isPrimary) ?? passport.locations[0];
  const contact = passport.contacts.find((row) => row.isPrimary) ?? passport.contacts[0];
  const categoryIds = categories.filter((category) => selected.includes(category.name)).map((category) => category.id);

  return (
    <MotionReveal delay={0.05} className="flex items-center gap-3 border-b pb-5">
      <IconTile icon={BadgeCheckIcon} tone="green" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">Supplier passport</div>
        <div className="truncate text-xs text-muted-foreground">{passport.capabilities.length} {passport.capabilities.length === 1 ? 'category' : 'categories'} · {location?.city ?? supplier.city}, {location?.state ?? supplier.state}{contact?.phone || supplier.phone ? ` · ${contact?.phone ?? supplier.phone}` : ''}</div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="outline" size="sm" />}><PencilIcon data-icon="inline-start" />Edit</DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader className="pr-8">
            <div className="flex items-center gap-3">
              <IconTile icon={BadgeCheckIcon} tone="green" />
              <div className="min-w-0">
                <DialogTitle>Supplier passport</DialogTitle>
                <DialogDescription>Keep the essentials buyers use to match your business.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form action={action}>
            <FieldGroup>
              <Field><FieldLabel htmlFor="passport-gstin"><ScanTextIcon className="size-3.5" />GSTIN</FieldLabel><Input id="passport-gstin" name="gstin" defaultValue={identifier('gstin')} placeholder="Business GST number" /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="passport-city"><MapPinIcon className="size-3.5" />City</FieldLabel><Input id="passport-city" name="city" defaultValue={location?.city ?? supplier.city} required /></Field>
                <Field><FieldLabel htmlFor="passport-state"><MapPinIcon className="size-3.5" />State</FieldLabel><Input id="passport-state" name="state" defaultValue={location?.state ?? supplier.state} required /></Field>
              </div>
              <Field>
                <FieldLabel htmlFor="passport-phone"><PhoneIcon className="size-3.5" />Mobile number</FieldLabel>
                <Input id="passport-phone" name="contactPhone" type="tel" autoComplete="tel" maxLength={32} defaultValue={contact?.phone ?? supplier.phone ?? ''} placeholder="+91 98765 43210" />
              </Field>
              <Field><FieldLabel><TagsIcon className="size-3.5" />Categories</FieldLabel><CategoryPicker id="passport-categories" categories={categories} value={selected} onChange={setSelected} multiple />{categoryIds.map((id) => <input key={id} type="hidden" name="categoryIds" value={id} />)}</Field>
              <Field><FieldLabel htmlFor="passport-materials"><PackageSearchIcon className="size-3.5" />Products or materials</FieldLabel><Input id="passport-materials" name="materials" defaultValue={passport.capabilities.flatMap((row) => row.materials ?? []).join(', ')} placeholder="Steel plates, fasteners, aluminium" /></Field>
              <Field><FieldLabel htmlFor="passport-certifications"><BadgeCheckIcon className="size-3.5" />Certifications <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="passport-certifications" name="certifications" defaultValue={passport.certifications.map((row) => row.name).join(', ')} placeholder="ISO 9001, IATF 16949" /></Field>
              <input type="hidden" name="country" value={location?.country ?? supplier.country ?? 'India'} />
              <input type="hidden" name="contactEmail" value={supplier.email} />
              {state.error && <FieldError>{state.error}</FieldError>}
              <DialogFooter><Button type="submit" disabled={pending || categoryIds.length === 0}>{pending ? 'Saving passport' : 'Save passport'}</Button></DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
    </MotionReveal>
  );
}
