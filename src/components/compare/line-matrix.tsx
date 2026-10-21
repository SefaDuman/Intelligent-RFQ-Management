import { useState } from "react"
import { Trophy } from "lucide-react"
import type { ComparisonResult } from "@/lib/comparison"
import { formatMoney, formatNumber, formatPct, formatUnitPrice, SERIES_COLORS } from "@/lib/format"
import { cn } from "@/lib/utils"
import { VendorAvatar } from "@/components/rfq/rfq-badges"

type Mode = "unit" | "total"

/** Heatmap tint: green for the best price, fading to rose as the gap grows. */
function heat(deltaPct?: number) {
  if (deltaPct === undefined) return undefined
  if (deltaPct === 0) return "color-mix(in oklch, oklch(0.7 0.16 155) 18%, transparent)"
  const t = Math.min(deltaPct / 25, 1)
  return `color-mix(in oklch, oklch(0.65 0.2 20) ${Math.round(4 + t * 16)}%, transparent)`
}

export function LineMatrix({ result, currency }: { result: ComparisonResult; currency: string }) {
  const [mode, setMode] = useState<Mode>("unit")
  const [heatmap, setHeatmap] = useState(true)
  const { metrics, lineRows } = result

  return (
    <div className="rounded-2xl border bg-card shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Line-by-line comparison</h3>
          <p className="text-xs text-muted-foreground">Effective prices after discounts. Best price per line is highlighted.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium">
            {(["unit", "total"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn("rounded-md px-2.5 py-1 transition-colors", mode === m ? "bg-background shadow-xs" : "text-muted-foreground")}
              >
                {m === "unit" ? "Unit price" : "Line total"}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={heatmap} onChange={(e) => setHeatmap(e.target.checked)} className="accent-[var(--primary)]" />
            Heatmap
          </label>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-[220px] border-b bg-card px-4 py-3 text-left font-medium">Line</th>
              <th className="border-b px-3 py-3 text-right font-medium">Qty</th>
              <th className="border-b px-3 py-3 text-right font-medium">Target</th>
              {metrics.map((m) => (
                <th key={m.reply.rfqId} className="min-w-[150px] border-b px-3 py-3 text-right font-medium">
                  <div className="flex items-center justify-end gap-2">
                    <span className="truncate text-foreground" title={m.reply.vendorName}>
                      {m.reply.vendorName}
                    </span>
                    <VendorAvatar name={m.reply.vendorName} id={m.reply.vendorAccount} size="sm" />
                  </div>
                  <div className="mt-1.5 h-0.5 rounded-full" style={{ background: SERIES_COLORS[m.colorIndex % SERIES_COLORS.length] }} />
                </th>
              ))}
              <th className="border-b px-4 py-3 text-right font-medium">Spread</th>
            </tr>
          </thead>
          <tbody>
            {lineRows.map((row) => (
              <tr key={row.caseLine.lineNumber} className="group">
                <td className="sticky left-0 z-10 border-b bg-card px-4 py-3 group-hover:bg-muted/40">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 rounded bg-muted px-1.5 text-[10px] font-semibold tabular text-muted-foreground">{row.caseLine.lineNumber}</span>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{row.caseLine.itemName}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{row.caseLine.itemNumber}</div>
                    </div>
                  </div>
                </td>
                <td className="border-b px-3 py-3 text-right tabular text-muted-foreground group-hover:bg-muted/40">
                  {formatNumber(row.caseLine.quantity)} {row.caseLine.unit}
                </td>
                <td className="border-b px-3 py-3 text-right tabular text-muted-foreground group-hover:bg-muted/40">
                  {mode === "unit"
                    ? formatUnitPrice(row.caseLine.targetUnitPrice, currency)
                    : formatMoney(row.caseLine.targetUnitPrice ? row.caseLine.targetUnitPrice * row.caseLine.quantity : undefined, currency, { compact: true })}
                </td>
                {row.cells.map((cell) => (
                  <td
                    key={cell.rfqId}
                    className="border-b px-3 py-2.5 text-right align-middle transition-colors"
                    style={{ background: heatmap ? heat(cell.deltaPct) : undefined }}
                  >
                    {cell.line ? (
                      <div>
                        <div className={cn("flex items-center justify-end gap-1 font-semibold tabular", cell.isBest && "text-emerald-700 dark:text-emerald-300", cell.isWorst && "text-rose-700 dark:text-rose-300")}>
                          {cell.isBest && <Trophy className="size-3.5" />}
                          {mode === "unit" ? formatUnitPrice(cell.effectiveUnitPrice, currency) : formatMoney(cell.line.netAmount, currency, { compact: true })}
                        </div>
                        <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
                          {cell.line.discountPct > 0 && <span className="rounded bg-emerald-500/10 px-1 text-emerald-700 dark:text-emerald-300">-{cell.line.discountPct}%</span>}
                          {cell.line.leadTimeDays !== undefined && <span>{cell.line.leadTimeDays}d</span>}
                          {!cell.isBest && cell.deltaPct !== undefined && <span className="tabular">{formatPct(cell.deltaPct, 1, true)}</span>}
                        </div>
                      </div>
                    ) : (
                      <span className="inline-block rounded-md border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">No quote</span>
                    )}
                  </td>
                ))}
                <td className="border-b px-4 py-3 text-right group-hover:bg-muted/40">
                  {row.spreadPct !== undefined ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium tabular",
                        row.spreadPct > 15 ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : row.spreadPct > 5 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {formatPct(row.spreadPct, 0)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-sm font-semibold">
              <td className="sticky left-0 z-10 bg-muted/60 px-4 py-3">Total</td>
              <td className="bg-muted/60" />
              <td className="bg-muted/60 px-3 py-3 text-right tabular text-muted-foreground">{formatMoney(result.targetTotal, currency, { compact: true })}</td>
              {metrics.map((m) => (
                <td key={m.reply.rfqId} className="bg-muted/60 px-3 py-3 text-right tabular">
                  <div className={cn(m.badges.includes("lowest-price") && "text-emerald-700 dark:text-emerald-300")}>{formatMoney(m.total, currency)}</div>
                  {m.coveragePct < 100 && <div className="text-[11px] font-normal text-muted-foreground">{m.quotedLines}/{m.totalLines} lines</div>}
                </td>
              ))}
              <td className="bg-muted/60" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
