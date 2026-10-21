import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wider text-primary">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

const ACCENTS = {
  primary: "from-primary/15 text-primary",
  emerald: "from-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  amber: "from-amber-500/20 text-amber-600 dark:text-amber-400",
  violet: "from-violet-500/15 text-violet-600 dark:text-violet-400",
  rose: "from-rose-500/15 text-rose-600 dark:text-rose-400",
  sky: "from-sky-500/15 text-sky-600 dark:text-sky-400",
}

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "primary",
  loading,
  onClick,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: LucideIcon
  accent?: keyof typeof ACCENTS
  loading?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card p-4 text-left shadow-xs transition-all",
        onClick && "hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none",
        !onClick && "cursor-default",
      )}
    >
      <div className={cn("pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-gradient-to-br to-transparent opacity-80", ACCENTS[accent])} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : (
            <div className="mt-1 text-2xl font-semibold tracking-tight tabular">{value}</div>
          )}
          {hint && <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div>}
        </div>
        <span className={cn("relative rounded-lg bg-background/70 p-2 ring-1 ring-border", ACCENTS[accent].split(" ").slice(1).join(" "))}>
          <Icon className="size-4" />
        </span>
      </div>
    </button>
  )
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border bg-card shadow-xs", className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      <div className={cn("p-5 pt-3", contentClassName)}>{children}</div>
    </section>
  )
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 px-6 py-14 text-center">
      <span className="mb-3 rounded-2xl bg-primary/10 p-3 text-primary">
        <Icon className="size-6" />
      </span>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
      <div className="font-semibold text-destructive">Couldn't load data</div>
      <p className="mt-1 text-muted-foreground break-words">{message}</p>
    </div>
  )
}
