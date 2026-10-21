import { AlertTriangle, Award, CalendarClock, Crown, FileCheck2, Gauge, Handshake, Star, Timer, Truck, X, Zap } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { BADGE_LABELS, type Badge, type ReplyMetrics } from "@/lib/comparison"
import { daysUntil, formatDate, formatMoney, formatPct, SERIES_COLORS } from "@/lib/format"
import { cn } from "@/lib/utils"
import { VendorAvatar } from "@/components/rfq/rfq-badges"
import { ScoreRing } from "./scoring"

const BADGE_ICONS: Record<Badge, LucideIcon> = {
  "best-value": Crown,
  "lowest-price": Award,
  fastest: Zap,
  "top-rated": Star,
  "best-terms": Handshake,
  "full-coverage": FileCheck2,
}

const BADGE_STYLES: Record<Badge, string> = {
  "best-value": "bg-gradient-to-r from-amber-400 to-orange-500 text-white",
  "lowest-price": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  fastest: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "top-rated": "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  "best-terms": "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  "full-coverage": "bg-muted text-muted-foreground",
}

export function OfferBadge({ badge }: { badge: Badge }) {
  const Icon = BADGE_ICONS[badge]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", BADGE_STYLES[badge])}>
      <Icon className="size-3" />
      {BADGE_LABELS[badge]}
    </span>
  )
}

function Metric({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: ReactNode; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span
        className={cn(
          "font-medium tabular text-right",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "bad" && "text-rose-600 dark:text-rose-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function OfferCard({
  metrics,
  currency,
  onRemove,
  bestLead,
  compact,
}: {
  metrics: ReplyMetrics
  currency: string
  onRemove: () => void
  bestLead?: number
  compact?: boolean
}) {
  const { reply, vendor } = metrics
  const color = SERIES_COLORS[metrics.colorIndex % SERIES_COLORS.length]
  const isWinner = metrics.rank === 1
  const validDays = daysUntil(reply.validUntil)
  const isLowest = metrics.badges.includes("lowest-price")

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-all hover:shadow-lg",
        isWinner && "border-transparent ring-2 ring-amber-400/70 shadow-lg shadow-amber-500/10",
      )}
    >
      <div className="h-1.5" style={{ background: color }} />
      {isWinner && <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-amber-400/10 to-transparent" />}

      <div className="relative flex items-start gap-3 p-4 pb-3">
        <VendorAvatar name={reply.vendorName} id={reply.vendorAccount} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular", isWinner ? "bg-amber-400 text-amber-950" : "bg-muted text-muted-foreground")}>
              #{metrics.rank}
            </span>
            <span className="truncate text-xs text-muted-foreground">{reply.rfqId}</span>
          </div>
          <h3 className="mt-0.5 line-clamp-2 font-semibold leading-snug" title={reply.vendorName}>
            {reply.vendorName}
          </h3>
          {vendor?.rating !== undefined && (
            <div className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
              <Star className="size-3 fill-amber-400 text-amber-400" />
              {vendor.rating.toFixed(1)}
              {vendor.onTimeDeliveryPct !== undefined && <span title="On-time delivery">· {vendor.onTimeDeliveryPct}% {compact ? "OTD" : "on time"}</span>}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Remove ${reply.vendorName} from comparison`}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className={cn("relative flex items-center px-4", compact ? "gap-3" : "gap-4")}>
        <ScoreRing score={metrics.weighted} size={compact ? 56 : 68} color={color} label="score" />
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total offer</div>
          <div className={cn("truncate font-semibold tracking-tight tabular", compact ? "text-xl" : "text-2xl")}>{formatMoney(metrics.total, reply.currency || currency)}</div>
          <div
            className={cn(
              "text-xs font-medium tabular",
              isLowest || metrics.deltaVsLowestPct < 0.05
                ? "text-emerald-600 dark:text-emerald-400"
                : metrics.deltaVsLowestPct <= 2
                  ? "text-muted-foreground"
                  : metrics.deltaVsLowestPct <= 7
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-rose-600 dark:text-rose-400",
            )}
          >
            {isLowest ? "Lowest normalised total" : `${formatPct(metrics.deltaVsLowestPct, 1, true)} vs. lowest`}
          </div>
          {metrics.coveragePct < 100 && (
            <div className="text-[11px] text-muted-foreground" title="Unquoted lines are filled with the average of other offers">
              Normalised {formatMoney(metrics.normalizedTotal, reply.currency || currency, { compact: true })}
            </div>
          )}
        </div>
      </div>

      <div className="relative mt-3 flex min-h-6 flex-wrap gap-1 px-4">
        {metrics.badges.map((b) => (
          <OfferBadge key={b} badge={b} />
        ))}
      </div>

      <div className="relative mt-3 divide-y border-t px-4 py-1">
        <Metric
          icon={Timer}
          label="Lead time"
          value={metrics.maxLeadTimeDays !== undefined ? `${metrics.maxLeadTimeDays} days` : "—"}
          tone={bestLead !== undefined && metrics.maxLeadTimeDays === bestLead ? "good" : undefined}
        />
        <Metric icon={Gauge} label="Lines quoted" value={`${metrics.quotedLines} / ${metrics.totalLines}`} tone={metrics.coveragePct < 100 ? "warn" : undefined} />
        <Metric icon={Handshake} label="Payment" value={reply.paymentTerms ?? "—"} />
        <Metric icon={Truck} label="Delivery terms" value={reply.deliveryTerms ?? "—"} />
        <Metric
          icon={CalendarClock}
          label="Valid until"
          value={
            <span className="inline-flex items-center gap-1">
              {validDays !== undefined && validDays < 7 && <AlertTriangle className="size-3" />}
              {formatDate(reply.validUntil, "d MMM")}
            </span>
          }
          tone={validDays !== undefined && validDays < 0 ? "bad" : validDays !== undefined && validDays < 7 ? "warn" : undefined}
        />
      </div>

      {reply.notes && <p className="relative mx-4 mb-4 mt-1 rounded-lg bg-muted/60 px-3 py-2 text-xs italic text-muted-foreground">“{reply.notes}”</p>}
    </article>
  )
}
