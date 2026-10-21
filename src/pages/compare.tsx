import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { BarChart3, Check, ClipboardCopy, Crown, Download, Grid3x3, Hourglass, Layers, MousePointerClick, Radar, Scale, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState, ErrorState, PageHeader } from "@/components/app/page-parts"
import { DeadlinePill, StatusBadge, VendorAvatar } from "@/components/rfq/rfq-badges"
import { RfqPicker } from "@/components/compare/rfq-picker"
import { WeightsPanel } from "@/components/compare/scoring"
import { OfferCard } from "@/components/compare/offer-card"
import { LineMatrix } from "@/components/compare/line-matrix"
import { ComparisonBriefPanel } from "@/components/compare/comparison-brief"
import { AwardPackPanel } from "@/components/compare/award-pack"
import { PriceAnalysis, ScoreBreakdown, SplitAwardView } from "@/components/compare/analysis"
import { useReplies, useRfqCase, useRfqCases, useVendors } from "@/hooks/use-rfq-data"
import { hasReplied, isOpenStatus } from "@/domain/types"
import { BADGE_LABELS, compareReplies, comparisonToCsv, downloadText, WEIGHT_PRESETS, type Weights } from "@/lib/comparison"
import { formatMoney, formatPct, SERIES_COLORS } from "@/lib/format"
import { cn } from "@/lib/utils"

const MAX_SELECTED = 6
const WEIGHTS_KEY = "rfq-compare-weights"

function loadWeights(): Weights {
  try {
    const raw = localStorage.getItem(WEIGHTS_KEY)
    if (raw) return { ...WEIGHT_PRESETS.balanced.weights, ...(JSON.parse(raw) as Partial<Weights>) }
  } catch {
    // ignore corrupt settings
  }
  return { ...WEIGHT_PRESETS.balanced.weights }
}

export default function ComparePage() {
  const [params, setParams] = useSearchParams()
  const rfqCaseId = params.get("rfq") ?? undefined
  const cases = useRfqCases()
  const allReplies = useReplies()
  const vendors = useVendors()
  const detail = useRfqCase(rfqCaseId)
  const [weights, setWeights] = useState<Weights>(loadWeights)

  useEffect(() => {
    localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights))
  }, [weights])

  const answered = useMemo(() => (detail.data?.replies ?? []).filter((r) => hasReplied(r.status)), [detail.data])
  const pending = useMemo(() => (detail.data?.replies ?? []).filter((r) => !hasReplied(r.status)), [detail.data])

  // Selection lives in the URL so a comparison can be bookmarked or shared.
  const repliesParam = params.get("replies")
  const selectedIds = useMemo(() => {
    if (repliesParam === null) return answered.slice(0, 4).map((r) => r.rfqId)
    const wanted = repliesParam.split(",").filter(Boolean)
    return answered.filter((r) => wanted.includes(r.rfqId)).map((r) => r.rfqId)
  }, [repliesParam, answered])

  const setSelected = (ids: string[]) => {
    const next = new URLSearchParams(params)
    next.set("replies", ids.join(","))
    setParams(next, { replace: true })
  }

  const toggle = (rfqId: string) => {
    if (selectedIds.includes(rfqId)) setSelected(selectedIds.filter((id) => id !== rfqId))
    else if (selectedIds.length >= MAX_SELECTED) toast.info(`Compare up to ${MAX_SELECTED} replies at a time`)
    else setSelected([...selectedIds, rfqId])
  }

  const selectRfq = (id: string) => setParams(new URLSearchParams({ rfq: id }))

  const result = useMemo(() => {
    if (!detail.data || selectedIds.length < 2) return undefined
    const chosen = answered.filter((r) => selectedIds.includes(r.rfqId))
    const res = compareReplies(detail.data.lines, chosen, vendors.data ?? [], weights)
    // Keep each vendor's color stable while the selection changes.
    res.metrics.forEach((m) => (m.colorIndex = answered.findIndex((r) => r.rfqId === m.reply.rfqId)))
    return res
  }, [detail.data, answered, selectedIds, vendors.data, weights])

  const header = detail.data?.header
  const currency = header?.currency || "USD"
  const ranked = result ? [...result.metrics].sort((a, b) => a.rank - b.rank) : []
  const winner = ranked[0]
  const avgTotal = result ? result.metrics.reduce((s, m) => s + m.normalizedTotal, 0) / result.metrics.length : 0
  const savingsVsAvg = winner ? avgTotal - winner.normalizedTotal : 0
  const bestLead = result ? Math.min(...result.metrics.map((m) => m.maxLeadTimeDays ?? Infinity)) : undefined

  const exportCsv = () => {
    if (!result || !header) return
    downloadText(`${header.rfqCaseId}-comparison.csv`, comparisonToCsv(header.rfqCaseId, result))
  }

  const copySummary = async () => {
    if (!result || !header || !winner) return
    const lines = [
      `RFQ ${header.rfqCaseId} – ${header.name}`,
      `Compared ${result.metrics.length} replies (weights: ${Object.entries(weights).map(([k, v]) => `${k} ${v}`).join(", ")})`,
      "",
      ...ranked.map(
        (m) =>
          `#${m.rank} ${m.reply.vendorName} (${m.reply.rfqId}) – score ${m.weighted.toFixed(1)}, total ${formatMoney(m.total, currency)}, lead ${m.maxLeadTimeDays ?? "—"}d, ${m.quotedLines}/${m.totalLines} lines${m.badges.length ? ` [${m.badges.map((b) => BADGE_LABELS[b]).join(", ")}]` : ""}`,
      ),
      "",
      `Recommendation: award to ${winner.reply.vendorName}.`,
      result.split.savings > 0 ? `Split award alternative saves ${formatMoney(result.split.savings, currency)} across ${result.split.vendorsUsed} vendors.` : "",
    ]
    await navigator.clipboard.writeText(lines.filter((l, i, arr) => l || arr[i - 1]).join("\n"))
    toast.success("Comparison summary copied to clipboard")
  }

  if (cases.error || allReplies.error || detail.error || vendors.error) {
    return <ErrorState error={cases.error ?? allReplies.error ?? detail.error ?? vendors.error} />
  }

  const readyCases = (cases.data ?? [])
    .filter((c) => isOpenStatus(c.status))
    .map((c) => ({ rfq: c, count: (allReplies.data ?? []).filter((r) => r.rfqCaseId === c.rfqCaseId && hasReplied(r.status)).length }))
    .filter((x) => x.count >= 2)
    .sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Reply comparison"
        description="Select vendor replies and compare price, delivery, terms and vendor performance side by side."
        actions={<RfqPicker cases={cases.data ?? []} replies={allReplies.data ?? []} value={rfqCaseId} onChange={selectRfq} />}
      />

      {!rfqCaseId ? (
        <div className="space-y-4">
          <EmptyState
            icon={Scale}
            title="Pick an RFQ to start comparing"
            description="Choose an RFQ with at least two vendor replies. You can also start a comparison from any RFQ page."
          />
          {readyCases.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Ready to compare</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(cases.isLoading ? [] : readyCases.slice(0, 9)).map(({ rfq, count }) => (
                  <button
                    key={rfq.rfqCaseId}
                    type="button"
                    onClick={() => selectRfq(rfq.rfqCaseId)}
                    className="group flex items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                  >
                    <span className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Layers className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium group-hover:text-primary">{rfq.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {rfq.rfqCaseId} · {count} replies
                      </div>
                      <div className="mt-2">
                        <DeadlinePill date={rfq.expiryDate} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : detail.isLoading || !detail.data ? (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Skeleton className="h-[420px]" />
          <div className="space-y-4">
            <Skeleton className="h-24" />
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-80" />
              <Skeleton className="h-80" />
              <Skeleton className="h-80" />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-20">
            <div className="rounded-2xl border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">{header!.rfqCaseId}</span>
                <StatusBadge status={header!.status} />
              </div>
              <Link to={`/rfqs/${encodeURIComponent(header!.rfqCaseId)}`} className="mt-1 block font-semibold hover:text-primary">
                {header!.name}
              </Link>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{detail.data.lines.length} lines</span>·<span>{header!.procurementCategory ?? "—"}</span>
                {isOpenStatus(header!.status) && <DeadlinePill date={header!.expiryDate} />}
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-xs">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">Replies</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedIds.length} of {answered.length} selected
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setSelected(answered.slice(0, MAX_SELECTED).map((r) => r.rfqId))}>
                    All
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setSelected([])}>
                    Clear
                  </Button>
                </div>
              </div>
              <ul className="max-h-[52dvh] space-y-1.5 overflow-y-auto p-2 scrollbar-thin">
                {answered.map((r, index) => {
                  const active = selectedIds.includes(r.rfqId)
                  const color = SERIES_COLORS[index % SERIES_COLORS.length]
                  const m = result?.metrics.find((x) => x.reply.rfqId === r.rfqId)
                  return (
                    <li key={r.rfqId}>
                      <button
                        type="button"
                        onClick={() => toggle(r.rfqId)}
                        aria-pressed={active}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all",
                          active ? "border-transparent bg-primary/5 ring-2" : "border-transparent hover:bg-muted/60",
                        )}
                        style={active ? ({ "--tw-ring-color": color } as CSSProperties) : undefined}
                      >
                        <span className="relative">
                          <VendorAvatar name={r.vendorName} id={r.vendorAccount} size="md" />
                          <span
                            className={cn(
                              "absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border-2 border-card text-white transition-transform",
                              active ? "scale-100" : "scale-0",
                            )}
                            style={{ background: color }}
                          >
                            <Check className="size-2.5" strokeWidth={3} />
                          </span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{r.vendorName}</div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="tabular">{formatMoney(r.totalAmount, r.currency || currency, { compact: true })}</span>
                            {m && <span>· #{m.rank}</span>}
                            {m?.rank === 1 && <Crown className="size-3 text-amber-500" />}
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
                {answered.length === 0 && <li className="p-3 text-sm text-muted-foreground">No replies received yet.</li>}
              </ul>
              {pending.length > 0 && (
                <div className="border-t px-4 py-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Hourglass className="size-3" /> Awaiting reply ({pending.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pending.map((r) => (
                      <span key={r.rfqId} className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-xs text-muted-foreground" title={r.vendorName}>
                        <VendorAvatar name={r.vendorName} id={r.vendorAccount} size="sm" className="size-5 rounded-full text-[8px]" />
                        <span className="max-w-[110px] truncate">{r.vendorName}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

          <div className="min-w-0 space-y-5">
            {!result ? (
              <EmptyState
                icon={MousePointerClick}
                title="Select at least two replies"
                description="Click vendors in the replies panel to add them to the comparison. Up to six replies can be compared side by side."
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    Comparing <span className="font-semibold text-foreground">{result.metrics.length}</span> replies · ranked by weighted score
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <ComparisonBriefPanel key={`${header!.company}:${header!.rfqCaseId}`} detail={detail.data} selectedIds={selectedIds} vendors={vendors.data ?? []} weights={weights} />
                    <AwardPackPanel key={`award:${header!.company}:${header!.rfqCaseId}`} detail={detail.data} selectedIds={selectedIds} vendors={vendors.data ?? []} weights={weights} reload={async () => {
                      const fresh = await detail.refetch()
                      if (fresh.error) throw fresh.error
                      if (!fresh.data) throw new Error("The RFQ is no longer accessible.")
                      return fresh.data
                    }} />
                    <WeightsPanel weights={weights} onChange={setWeights} />
                    <Button variant="outline" onClick={copySummary}>
                      <ClipboardCopy /> Copy summary
                    </Button>
                    <Button variant="outline" onClick={exportCsv}>
                      <Download /> Export
                    </Button>
                  </div>
                </div>

                {winner && (
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 p-5 text-white shadow-lg shadow-indigo-500/20">
                    <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
                    <div className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-white/10 blur-2xl" />
                    <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-4">
                        <span className="rounded-2xl bg-white/15 p-3 backdrop-blur">
                          <Sparkles className="size-6" />
                        </span>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-wider text-white/75">Recommended award</div>
                          <div className="text-xl font-semibold">{winner.reply.vendorName}</div>
                          <div className="mt-0.5 text-sm text-white/85">
                            Score {winner.weighted.toFixed(1)} · {formatMoney(winner.total, currency)}
                            {savingsVsAvg > 0 && ` · ${formatMoney(savingsVsAvg, currency, { compact: true })} below the average offer`}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-sm">
                        <div className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur">
                          <div className="text-[11px] text-white/75">Spread lowest → highest</div>
                          <div className="font-semibold tabular">
                            {formatPct(Math.max(...result.metrics.map((m) => m.deltaVsLowestPct)), 1)}
                          </div>
                        </div>
                        {result.split.savings > 0 && (
                          <div className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur">
                            <div className="text-[11px] text-white/75">Split award saves</div>
                            <div className="font-semibold tabular">{formatMoney(result.split.savings, currency, { compact: true })}</div>
                          </div>
                        )}
                        {result.targetTotal && (
                          <div className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur">
                            <div className="text-[11px] text-white/75">vs. target cost</div>
                            <div className="font-semibold tabular">{formatPct(winner.vsTargetPct, 1, true)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="-mx-1 overflow-x-auto px-1 pb-2 scrollbar-thin snap-x snap-mandatory">
                  <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${result.metrics.length}, minmax(${result.metrics.length >= 4 ? 215 : 250}px, 1fr))` }}>
                    {[...result.metrics]
                      .sort((a, b) => a.rank - b.rank)
                      .map((m) => (
                        <div key={m.reply.rfqId} className="snap-start">
                          <OfferCard metrics={m} currency={currency} bestLead={bestLead} compact={result.metrics.length >= 4} onRemove={() => toggle(m.reply.rfqId)} />
                        </div>
                      ))}
                  </div>
                </div>

                <Tabs defaultValue="lines">
                  <TabsList className="h-10">
                    <TabsTrigger value="lines" className="gap-1.5 px-3">
                      <Grid3x3 className="size-4" /> Line by line
                    </TabsTrigger>
                    <TabsTrigger value="scores" className="gap-1.5 px-3">
                      <Radar className="size-4" /> Scores
                    </TabsTrigger>
                    <TabsTrigger value="price" className="gap-1.5 px-3">
                      <BarChart3 className="size-4" /> Price analysis
                    </TabsTrigger>
                    <TabsTrigger value="split" className="gap-1.5 px-3">
                      <Layers className="size-4" /> Split award
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="lines" className="mt-3">
                    <LineMatrix result={result} currency={currency} />
                  </TabsContent>
                  <TabsContent value="scores" className="mt-3">
                    <ScoreBreakdown result={result} weights={weights} />
                  </TabsContent>
                  <TabsContent value="price" className="mt-3">
                    <PriceAnalysis result={result} currency={currency} />
                  </TabsContent>
                  <TabsContent value="split" className="mt-3">
                    <SplitAwardView result={result} currency={currency} />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
