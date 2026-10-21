import { Bar, BarChart, CartesianGrid, PolarAngleAxis, PolarGrid, Radar, RadarChart, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { CRITERIA, type ComparisonResult, type Weights } from "@/lib/comparison"
import { formatMoney, SERIES_COLORS } from "@/lib/format"
import { cn } from "@/lib/utils"

function seriesConfig(result: ComparisonResult): ChartConfig {
  return Object.fromEntries(
    result.metrics.map((m) => [`v${m.colorIndex}`, { label: m.reply.vendorName, color: SERIES_COLORS[m.colorIndex % SERIES_COLORS.length] }]),
  )
}

export function ScoreBreakdown({ result, weights }: { result: ComparisonResult; weights: Weights }) {
  const config = seriesConfig(result)
  const radarData = CRITERIA.map((c) => ({
    criterion: c.label,
    ...Object.fromEntries(result.metrics.map((m) => [`v${m.colorIndex}`, Math.round(m.scores[c.key])])),
  }))
  const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0) || 1
  const ranked = [...result.metrics].sort((a, b) => a.rank - b.rank)

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="rounded-2xl border bg-card p-4 shadow-xs lg:col-span-2">
        <h3 className="text-sm font-semibold">Score profile</h3>
        <p className="text-xs text-muted-foreground">Each criterion scored 0–100 relative to the best offer</p>
        <ChartContainer config={config} className="mx-auto aspect-square max-h-[340px]">
          <RadarChart data={radarData} outerRadius="72%">
            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
            <PolarGrid />
            <PolarAngleAxis dataKey="criterion" tick={{ fontSize: 11 }} />
            {result.metrics.map((m) => (
              <Radar key={m.colorIndex} dataKey={`v${m.colorIndex}`} stroke={`var(--color-v${m.colorIndex})`} fill={`var(--color-v${m.colorIndex})`} fillOpacity={0.12} strokeWidth={2} />
            ))}
            <ChartLegend content={<ChartLegendContent />} />
          </RadarChart>
        </ChartContainer>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-xs lg:col-span-3">
        <h3 className="text-sm font-semibold">Weighted score breakdown</h3>
        <p className="text-xs text-muted-foreground">How each criterion contributes to the final score</p>
        <div className="mt-4 space-y-4">
          {ranked.map((m) => (
            <div key={m.reply.rfqId}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <span className="size-2.5 rounded-sm" style={{ background: SERIES_COLORS[m.colorIndex % SERIES_COLORS.length] }} />
                  #{m.rank} {m.reply.vendorName}
                </span>
                <span className="font-semibold tabular">{m.weighted.toFixed(1)}</span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                {CRITERIA.map((c, i) => {
                  const contribution = (m.scores[c.key] * weights[c.key]) / weightTotal
                  return (
                    <div
                      key={c.key}
                      title={`${c.label}: ${m.scores[c.key].toFixed(0)} × ${Math.round((weights[c.key] / weightTotal) * 100)}% = ${contribution.toFixed(1)}`}
                      className="h-full border-r border-card last:border-0"
                      style={{ width: `${contribution}%`, background: `var(--chart-${(i % 5) + 1})` }}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 border-t pt-3 text-xs text-muted-foreground">
          {CRITERIA.map((c, i) => (
            <span key={c.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: `var(--chart-${(i % 5) + 1})` }} />
              {c.label} <span className="tabular">({Math.round((weights[c.key] / weightTotal) * 100)}%)</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function PriceAnalysis({ result, currency }: { result: ComparisonResult; currency: string }) {
  const config = seriesConfig(result)
  const indexData = result.lineRows.map((row) => ({
    line: row.caseLine.itemNumber,
    ...Object.fromEntries(
      row.cells.map((cell) => {
        const m = result.metrics.find((x) => x.reply.rfqId === cell.rfqId)!
        return [`v${m.colorIndex}`, cell.effectiveUnitPrice && row.bestUnitPrice ? Math.round((cell.effectiveUnitPrice / row.bestUnitPrice) * 1000) / 10 : null]
      }),
    ),
  }))
  const totals = [...result.metrics]
    .sort((a, b) => a.normalizedTotal - b.normalizedTotal)
    .map((m) => ({ vendor: m.reply.vendorName, total: Math.round(m.normalizedTotal), fill: SERIES_COLORS[m.colorIndex % SERIES_COLORS.length] }))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border bg-card p-4 shadow-xs">
        <h3 className="text-sm font-semibold">Price index per line</h3>
        <p className="text-xs text-muted-foreground">Best price on each line = 100. Lower is better.</p>
        <ChartContainer config={config} className="mt-2 aspect-auto h-72 w-full">
          <BarChart data={indexData} margin={{ left: -12, right: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="line" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
            <YAxis tickLine={false} axisLine={false} domain={[90, "auto"]} allowDataOverflow />
            <ReferenceLine y={100} stroke="var(--success)" strokeDasharray="4 4" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {result.metrics.map((m) => (
              <Bar key={m.colorIndex} dataKey={`v${m.colorIndex}`} fill={`var(--color-v${m.colorIndex})`} radius={[4, 4, 0, 0]} maxBarSize={22} />
            ))}
          </BarChart>
        </ChartContainer>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-xs">
        <h3 className="text-sm font-semibold">Normalised totals</h3>
        <p className="text-xs text-muted-foreground">
          Apples-to-apples totals{result.targetTotal ? " vs. target cost (dashed)" : ""}. Missing lines use the average of other offers.
        </p>
        <ChartContainer config={{ total: { label: "Total" } }} className="mt-2 aspect-auto h-72 w-full">
          <BarChart data={totals} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })} />
            <YAxis type="category" dataKey="vendor" tickLine={false} axisLine={false} width={130} tick={{ fontSize: 11 }} />
            {result.targetTotal && <ReferenceLine x={result.targetTotal} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "Target", position: "top", fontSize: 10, fill: "var(--muted-foreground)" }} />}
            <ChartTooltip
              content={<ChartTooltipContent hideLabel formatter={(value, _name, item) => (
                <div className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">{(item.payload as { vendor: string }).vendor}</span>
                  <span className="font-mono font-medium">{formatMoney(Number(value), currency)}</span>
                </div>
              )} />}
            />
            <Bar dataKey="total" radius={[0, 6, 6, 0]} maxBarSize={28} />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  )
}

export function SplitAwardView({ result, currency }: { result: ComparisonResult; currency: string }) {
  const { split } = result
  const pct = split.bestSingleVendorTotal ? (split.savings / split.bestSingleVendorTotal) * 100 : 0
  const colorOf = (rfqId?: string) => {
    const m = result.metrics.find((x) => x.reply.rfqId === rfqId)
    return m ? SERIES_COLORS[m.colorIndex % SERIES_COLORS.length] : "var(--muted)"
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Split award total", value: formatMoney(split.total, currency), accent: "text-primary" },
          { label: `Best single vendor${split.bestSingleVendor ? ` (${split.bestSingleVendor})` : ""}`, value: formatMoney(split.bestSingleVendorTotal, currency) },
          { label: "Additional savings", value: `${formatMoney(Math.max(split.savings, 0), currency)} (${pct.toFixed(1)}%)`, accent: split.savings > 0 ? "text-emerald-600 dark:text-emerald-400" : "" },
          { label: "Vendors involved", value: String(split.vendorsUsed) },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4 shadow-xs">
            <div className="truncate text-xs text-muted-foreground" title={k.label}>
              {k.label}
            </div>
            <div className={cn("mt-1 text-xl font-semibold tabular", k.accent)}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-card shadow-xs">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Cherry-picked award per line</h3>
          <p className="text-xs text-muted-foreground">
            Awards each line to the lowest effective price. Weigh the savings against the overhead of managing {split.vendorsUsed} purchase orders.
          </p>
        </div>
        <div className="divide-y">
          {split.lines.map((l) => {
            const share = split.total ? (l.netAmount / split.total) * 100 : 0
            return (
              <div key={l.caseLine.lineNumber} className="flex items-center gap-4 px-4 py-3">
                <span className="rounded bg-muted px-1.5 text-[10px] font-semibold tabular text-muted-foreground">{l.caseLine.lineNumber}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{l.caseLine.itemName}</div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${share}%`, background: colorOf(l.rfqId) }} />
                  </div>
                </div>
                <div className="w-44 truncate text-right text-sm">
                  {l.vendorName ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: colorOf(l.rfqId) }} />
                      {l.vendorName}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No quote</span>
                  )}
                </div>
                <div className="w-28 text-right text-sm font-semibold tabular">{formatMoney(l.netAmount, currency, { compact: true })}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
