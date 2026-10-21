import { differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from "date-fns"

export function formatMoney(amount: number | undefined, currency = "USD", options: { compact?: boolean; decimals?: number } = {}) {
  if (amount === undefined || Number.isNaN(amount)) return "—"
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      notation: options.compact ? "compact" : "standard",
      maximumFractionDigits: options.compact ? 1 : (options.decimals ?? 2),
      minimumFractionDigits: options.compact ? 0 : Math.min(options.decimals ?? 2, 2),
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export function formatUnitPrice(amount: number | undefined, currency = "USD") {
  if (amount === undefined) return "—"
  return formatMoney(amount, currency, { decimals: amount < 1 ? 4 : 2 })
}

export function formatNumber(value: number | undefined, decimals = 0) {
  if (value === undefined || Number.isNaN(value)) return "—"
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals }).format(value)
}

export function formatPct(value: number | undefined, decimals = 0, signed = false) {
  if (value === undefined || !Number.isFinite(value)) return "—"
  const text = `${value.toFixed(decimals)}%`
  return signed && value > 0 ? `+${text}` : text
}

export function toDate(value?: string) {
  return value ? parseISO(value) : undefined
}

export function formatDate(value?: string, pattern = "d MMM yyyy") {
  const d = toDate(value)
  return d ? format(d, pattern) : "—"
}

export function daysUntil(value?: string) {
  const d = toDate(value)
  return d ? differenceInCalendarDays(d, new Date()) : undefined
}

export function relativeDeadline(value?: string) {
  const days = daysUntil(value)
  if (days === undefined) return { label: "No deadline", tone: "muted" as const }
  if (days < 0) return { label: `Closed ${Math.abs(days)}d ago`, tone: "warning" as const }
  if (days === 0) return { label: "Due today", tone: "danger" as const }
  if (days <= 3) return { label: `${days}d left`, tone: "warning" as const }
  if (days <= 7) return { label: `${days}d left`, tone: "info" as const }
  return { label: `${days}d left`, tone: "muted" as const }
}

export function timeAgo(value?: string) {
  const d = toDate(value)
  return d ? formatDistanceToNowStrict(d, { addSuffix: true }) : "—"
}

export function initials(name: string) {
  return name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")
}

const VENDOR_HUES = [264, 170, 25, 320, 70, 210, 140, 0, 290, 100]

/** Stable accent color per vendor, used for avatars and chart series. */
export function vendorHue(key: string) {
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return VENDOR_HUES[Math.abs(hash) % VENDOR_HUES.length]
}

export function vendorColor(key: string, lightness = 0.62, chroma = 0.17) {
  return `oklch(${lightness} ${chroma} ${vendorHue(key)})`
}

/** Distinct colors for the vendors currently being compared. */
export const SERIES_COLORS = [
  "oklch(0.56 0.2 264)",
  "oklch(0.66 0.15 170)",
  "oklch(0.72 0.16 65)",
  "oklch(0.6 0.22 320)",
  "oklch(0.62 0.2 25)",
  "oklch(0.6 0.13 220)",
]
