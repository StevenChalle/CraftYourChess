import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** A labelled date input (yyyy-mm-dd, see lib/dateInput.ts); `hideLabel`: for screen readers only. */
export function DateField({
  label,
  value,
  min,
  max,
  hideLabel = false,
  onChange,
}: {
  label: string
  value: string
  min?: string
  max?: string
  hideLabel?: boolean
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <span className="flex items-center gap-1.5">
      <Label htmlFor={id} className={hideLabel ? 'sr-only' : 'font-normal text-muted-foreground'}>
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-auto bg-muted [color-scheme:dark]"
      />
    </span>
  )
}
