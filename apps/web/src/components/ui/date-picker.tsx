"use client"

import * as React from "react"
import { CalendarIcon, XIcon } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/** Local calendar date, not UTC -- avoids the off-by-one day shift `new Date(isoString)` gets in
 *  timezones behind UTC. */
function parseDateValue(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const [, y, m, d] = match
  return new Date(Number(y), Number(m) - 1, Number(d))
}

function formatDateValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

type DatePickerProps = {
  id?: string
  /** yyyy-mm-dd, or "" for no date -- matches the plain <input type="date"> value shape callers already use. */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

function DatePicker({ id, value, onChange, placeholder = "Pick a date", className, disabled }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = parseDateValue(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("h-8 w-full justify-start gap-2 px-2.5 font-normal tabular-nums", !selected && "text-muted-foreground", className)}
          >
            <CalendarIcon data-icon="inline-start" />
            {selected ? selected.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : placeholder}
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={6} className="w-auto overflow-hidden p-0 shadow-lg">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(date ? formatDateValue(date) : "")
            setOpen(false)
          }}
        />
        <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => {
            onChange(formatDateValue(new Date()))
            setOpen(false)
          }}>
            Today
          </Button>
          {selected && (
            <Button type="button" variant="ghost" size="sm" onClick={() => {
              onChange("")
              setOpen(false)
            }}>
              <XIcon data-icon="inline-start" />
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
