import { useMemo, useState } from "react"
import { Layers } from "lucide-react"
import { EmptyState, SectionCard } from "@/components/app/page-parts"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { hasReplied, type RfqCaseDetail } from "@/domain/types"
import { formatMoney, formatPct, SERIES_COLORS } from "@/lib/format"
import { consolidationCurve, optimizeAward, type ScenarioConstraints, type ScenarioResult } from "@/lib/sourcing/scenarios"
import { cn } from "@/lib/utils"

type Stance = "neutral" | "required" | "excluded"

const parseOptional = (value: string) => {
  const n = Number(value)
  return value.trim() === "" || !Number.isFinite(n) ? undefined : n
}

function ScenarioCard({ title, subtitle, result, currency, target, reference, highlight }: { title: string; subtitle: string; result: ScenarioResult; currency: string; target?: number; reference?: number; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", highlight && "border-primary/40 ring-1 ring-primary/20")}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
      {!result.feasible ? (
        <p role="alert" className="mt-3 text-sm text-destructive">Not feasible. {result.reason}</p>
      ) : (
        <>
          <div className="mt-3 text-2xl font-semibold tabular">{formatMoney(result.total, currency)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {result.vendorsUsed} vendor{result.vendorsUsed === 1 ? "" : "s"}
            {result.maxLeadTimeDays !== undefined && ` · longest lead time ${result.maxLeadTimeDays}d`}
            {target ? ` · ${formatPct(((result.total - target) / target) * 100, 1, true)} vs target` : ""}
            {reference !== undefined && reference - result.total > 0.005 ? ` · saves ${formatMoney(reference - result.total, currency)} vs one vendor` : ""}
          </div>
          <ul className="mt-3 space-y-1.5">
            {result.shares.map((s) => (
              <li key={s.rfqId} className="text-xs">
                <div className="flex justify-between gap-2"><span className="truncate">{s.vendorName} · {s.lines} line{s.lines === 1 ? "" : "s"}</span><span className="tabular">{formatPct(s.sharePct, 0)} · {formatMoney(s.amount, currency, { compact: true })}</span></div>
                <div className="mt-0.5 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, s.sharePct)}%` }} /></div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function ScenarioPanel({ detail }: { detail: RfqCaseDetail }) {
  const bids = useMemo(() => detail.replies.filter((r) => hasReplied(r.status) && r.lines?.length), [detail.replies])
  const [stance, setStance] = useState<Record<string, Stance>>({})
  const [maxVendors, setMaxVendors] = useState("")
  const [maxShare, setMaxShare] = useState("")
  const [minShare, setMinShare] = useState("")
  const [maxLead, setMaxLead] = useState("")
  const currency = detail.header.currency || "USD"
  const target = detail.lines.reduce((s, l) => s + (l.targetUnitPrice ?? 0) * l.quantity, 0) || undefined

  const eligibility: ScenarioConstraints = useMemo(() => ({
    requiredRfqIds: [],
    excludedRfqIds: bids.filter((b) => stance[b.rfqId] === "excluded").map((b) => b.rfqId),
    maxLeadTimeDays: parseOptional(maxLead),
  }), [bids, stance, maxLead])
  const custom: ScenarioConstraints = useMemo(() => ({
    ...eligibility,
    requiredRfqIds: bids.filter((b) => stance[b.rfqId] === "required").map((b) => b.rfqId),
    maxVendors: parseOptional(maxVendors),
    maxSharePct: parseOptional(maxShare),
    minSharePct: parseOptional(minShare),
  }), [eligibility, bids, stance, maxVendors, maxShare, minShare])

  const single = useMemo(() => optimizeAward(detail.lines, bids, { ...eligibility, maxVendors: 1 }), [detail.lines, bids, eligibility])
  const split = useMemo(() => optimizeAward(detail.lines, bids, eligibility), [detail.lines, bids, eligibility])
  const scenario = useMemo(() => optimizeAward(detail.lines, bids, custom), [detail.lines, bids, custom])
  const curve = useMemo(() => consolidationCurve(detail.lines, bids, eligibility), [detail.lines, bids, eligibility])
  const hasCustom = custom.maxVendors !== undefined || custom.maxSharePct !== undefined || custom.minSharePct !== undefined || custom.requiredRfqIds.length > 0

  if (bids.length < 2) return <EmptyState icon={Layers} title="Need at least two priced bids" description="Scenarios compare award options across vendor replies that include line prices." />
  if (bids.length > 10) return <EmptyState icon={Layers} title="Too many bids for scenario search" description="Scenario optimization supports up to 10 priced bids. Exclude some bids in the comparison first." />

  const maxPremium = Math.max(...curve.map((p) => p.premium ?? 0), 0.0001)

  return (
    <div className="space-y-5">
      <SectionCard title="Constraints" description="Set business rules and see the cheapest award that respects them. Unquoted lines and unknown lead times are not eligible.">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5"><Label htmlFor="sc-vendors">Max vendors</Label><Input id="sc-vendors" type="number" min={1} value={maxVendors} onChange={(e) => setMaxVendors(e.target.value)} placeholder="No limit" /></div>
          <div className="space-y-1.5"><Label htmlFor="sc-max">Max share per vendor (%)</Label><Input id="sc-max" type="number" min={1} max={100} value={maxShare} onChange={(e) => setMaxShare(e.target.value)} placeholder="No cap" /></div>
          <div className="space-y-1.5"><Label htmlFor="sc-min">Min share per used vendor (%)</Label><Input id="sc-min" type="number" min={0} max={100} value={minShare} onChange={(e) => setMinShare(e.target.value)} placeholder="None" /></div>
          <div className="space-y-1.5"><Label htmlFor="sc-lead">Max lead time (days)</Label><Input id="sc-lead" type="number" min={1} value={maxLead} onChange={(e) => setMaxLead(e.target.value)} placeholder="No cap" /></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {bids.map((b, i) => (
            <div key={b.rfqId} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm">
              <span className="size-2.5 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
              <span>{b.vendorName}</span>
              <select aria-label={`Treatment of ${b.vendorName}`} className="h-7 rounded border bg-background px-1 text-xs" value={stance[b.rfqId] ?? "neutral"} onChange={(e) => setStance({ ...stance, [b.rfqId]: e.target.value as Stance })}>
                <option value="neutral">Optional</option>
                <option value="required">Must receive business</option>
                <option value="excluded">Exclude</option>
              </select>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <ScenarioCard title="One vendor" subtitle="Lowest total from a single supplier" result={single} currency={currency} target={target} />
        <ScenarioCard title="Best split" subtitle="Cheapest vendor per line, no limits" result={split} currency={currency} target={target} reference={single.feasible ? single.total : undefined} />
        <ScenarioCard title="Your scenario" subtitle={hasCustom ? "Applies all constraints above" : "Add a constraint to differ from the best split"} result={scenario} currency={currency} target={target} reference={single.feasible ? single.total : undefined} highlight />
      </div>
      {custom.maxSharePct !== undefined && <p className="text-xs text-muted-foreground">With a concentration cap the engine moves lines off over-cap vendors at the smallest extra cost. That step is a heuristic, so treat the result as a strong option, not a proven optimum.</p>}

      <SectionCard title="Cost of consolidation" description="Lowest total when the award is limited to this many vendors.">
        <ul className="space-y-2">
          {curve.map((p) => (
            <li key={p.vendors} className="grid grid-cols-[90px_1fr_190px] items-center gap-3 text-sm">
              <span>{p.vendors} vendor{p.vendors === 1 ? "" : "s"}</span>
              <div className="h-2 rounded-full bg-muted">{p.premium !== undefined && <div className="h-2 rounded-full bg-amber-500" style={{ width: `${(p.premium / maxPremium) * 100}%` }} />}</div>
              <span className="text-right tabular text-xs">{p.result.feasible ? `${formatMoney(p.result.total, currency)}${p.premium ? ` · +${formatMoney(p.premium, currency, { compact: true })}` : " · lowest"}` : "Not feasible"}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      {scenario.feasible && (
        <SectionCard title="Line allocation (your scenario)" description="Review before recording the award in Dynamics 365. This page never creates purchase orders or agreements.">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-2">Line</th><th className="pb-2">Item</th><th className="pb-2">Vendor</th><th className="pb-2 text-right">Net amount</th></tr></thead>
            <tbody>
              {scenario.assignments.map((a) => {
                const line = detail.lines.find((l) => l.lineNumber === a.lineNumber)
                return <tr key={a.lineNumber} className="border-t"><td className="py-1.5">{a.lineNumber}</td><td>{line?.itemName}</td><td>{a.vendorName}</td><td className="text-right tabular">{formatMoney(a.netAmount, currency)}</td></tr>
              })}
            </tbody>
          </table>
        </SectionCard>
      )}
    </div>
  )
}
