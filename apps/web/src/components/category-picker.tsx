'use client';

import { useMemo, useState } from 'react';
import { CheckIcon, ChevronDownIcon, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import type { Category } from '@/lib/types';

type CategoryPickerProps = {
  categories: Category[];
  value: string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
  max?: number;
  placeholder?: string;
  id?: string;
};

export function CategoryPicker({ categories, value, onChange, multiple = false, max = 20, placeholder = 'Select a category', id }: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? categories.filter((category) => category.name.toLowerCase().includes(needle)) : categories;
  }, [categories, query]);
  const summary = value.length === 0
    ? placeholder
    : value.length <= 2
      ? value.join(', ')
      : `${value.slice(0, 2).join(', ')} +${value.length - 2}`;

  function toggle(name: string) {
    if (!multiple) {
      onChange([name]);
      setOpen(false);
      return;
    }
    if (value.includes(name)) onChange(value.filter((category) => category !== name));
    else if (value.length < max) onChange([...value, name]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button id={id} type="button" variant="outline" className="group h-8 w-full justify-between px-2.5 font-normal" />}>
        <span className={value.length ? 'truncate text-left' : 'truncate text-left text-muted-foreground'}>{summary}</span>
        <ChevronDownIcon data-icon="inline-end" className="transition-transform duration-200 group-aria-expanded:rotate-180" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-(--anchor-width) min-w-72 gap-0 overflow-hidden p-0 shadow-lg">
        <PopoverHeader className="border-b bg-muted/30 px-3 py-2.5">
          <PopoverTitle>{multiple ? 'Select categories' : 'Select category'}</PopoverTitle>
          <PopoverDescription>{multiple ? `Choose up to ${max} categories.` : 'Choose the closest category for this item.'}</PopoverDescription>
        </PopoverHeader>
        <div className="relative border-b p-2"><SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search categories" className="bg-background pl-8" /></div>
        <div className="max-h-72 overscroll-contain overflow-y-auto p-1.5">
          {filtered.map((category) => {
            const checked = value.includes(category.name);
            return (
              <button key={category.id} type="button" role={multiple ? 'checkbox' : 'option'} aria-checked={multiple ? checked : undefined} aria-selected={multiple ? undefined : checked} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground" onClick={() => toggle(category.name)}>
                {multiple && <span className={checked ? 'flex size-4 shrink-0 items-center justify-center rounded border border-primary bg-primary text-primary-foreground' : 'flex size-4 shrink-0 items-center justify-center rounded border bg-background'}>{checked && <CheckIcon />}</span>}
                <span className="min-w-0 flex-1 truncate">{category.name}</span>
                {!multiple && checked && <CheckIcon className="shrink-0 text-primary" />}
              </button>
            );
          })}
          {filtered.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">No matching category.</p>}
        </div>
        {multiple && <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground"><span>{value.length} of {max} selected</span>{value.length > 0 && <Button type="button" variant="ghost" size="xs" onClick={() => onChange([])}>Clear</Button>}</div>}
      </PopoverContent>
    </Popover>
  );
}
