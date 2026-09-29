"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { DayPicker, type DayButtonProps, getDefaultClassNames } from "react-day-picker"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("w-fit bg-background p-3", className)}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: "relative flex flex-col gap-4",
        month: "flex flex-col gap-4",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground"),
        button_next: cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground"),
        month_caption: "flex h-7 items-center justify-center px-8 text-sm font-semibold",
        caption_label: "text-sm font-semibold",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "flex size-9 items-center justify-center text-center text-xs font-medium text-muted-foreground",
        week: "mt-1.5 flex w-full",
        day: "relative size-9 p-0 text-center text-sm",
        range_start: "rounded-l-md",
        range_end: "rounded-r-md",
        today: "rounded-md bg-accent text-accent-foreground",
        outside: "text-muted-foreground/40",
        disabled: "text-muted-foreground/40 opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) =>
          orientation === "left" ? <ChevronLeftIcon className="size-4" {...chevronProps} /> : <ChevronRightIcon className="size-4" {...chevronProps} />,
        DayButton: CalendarDayButton,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({ className, day, modifiers, ...props }: DayButtonProps) {
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle}
      className={cn(
        "size-9 rounded-md font-normal data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[selected-single=true]:shadow-sm data-[selected-single=true]:hover:bg-primary/90",
        modifiers.today && !modifiers.selected && "bg-accent text-accent-foreground",
        className,
      )}
      {...props}
    />
  )
}

export { Calendar }
