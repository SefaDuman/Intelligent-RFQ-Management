import { cn } from "@/lib/utils"
import type { RfqStatus } from "@/domain/types"
import { initials, relativeDeadline, vendorColor } from "@/lib/format"
import { CalendarClock } from "lucide-react"

const STATUS_STYLES: Record<RfqStatus, string> = {
  Created: "bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300",
  Sent: "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300",
  Received: "bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-300",
  Accepted: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
  Rejected: "bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300",
  Canceled: "bg-zinc-500/10 text-zinc-500 ring-zinc-500/20 line-through",
  Declined: "bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300",
  Removed: "bg-zinc-500/10 text-zinc-500 ring-zinc-500/20",
}

const STATUS_DOT: Record<RfqStatus, string> = {
  Created: "bg-slate-400",
  Sent: "bg-sky-500",
  Received: "bg-violet-500",
  Accepted: "bg-emerald-500",
  Rejected: "bg-rose-500",
  Canceled: "bg-zinc-400",
  Declined: "bg-rose-500",
  Removed: "bg-zinc-400",
}

const STATUS_LABEL: Partial<Record<RfqStatus, string>> = {
  Received: "Replies received",
}

export function StatusBadge({ status, className, vendor }: { status: RfqStatus; className?: string; vendor?: boolean }) {
  const label = vendor && status === "Received" ? "Replied" : vendor && status === "Sent" ? "Awaiting reply" : (STATUS_LABEL[status] ?? status)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        STATUS_STYLES[status],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />
      {label}
    </span>
  )
}

export function VendorAvatar({ name, id, size = "md", className }: { name: string; id?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const key = id ?? name
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-white shadow-sm",
        size === "sm" && "size-7 text-[11px]",
        size === "md" && "size-9 text-xs",
        size === "lg" && "size-11 text-sm",
        className,
      )}
      style={{ background: `linear-gradient(135deg, ${vendorColor(key, 0.6)}, ${vendorColor(key, 0.48, 0.2)})` }}
      aria-hidden
    >
      {initials(name) || "?"}
    </span>
  )
}

const TONES = {
  danger: "text-rose-700 bg-rose-500/10 dark:text-rose-300",
  warning: "text-amber-700 bg-amber-500/15 dark:text-amber-300",
  info: "text-sky-700 bg-sky-500/10 dark:text-sky-300",
  muted: "text-muted-foreground bg-muted",
}

export function DeadlinePill({ date, className }: { date?: string; className?: string }) {
  const { label, tone } = relativeDeadline(date)
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular whitespace-nowrap", TONES[tone], className)}>
      <CalendarClock className="size-3" />
      {label}
    </span>
  )
}
