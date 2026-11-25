import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { PiggyBank, Plus, Target, TrendingDown, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState, ErrorState, KpiCard, PageHeader, SectionCard } from "@/components/app/page-parts"
import { getDataContext } from "@/data"
import { useCompany } from "@/hooks/use-company"
import { useReplies, useRfqCases } from "@/hooks/use-rfq-data"
import { initiativeStore, useCollection } from "@/hooks/use-sourcing"
import { formatMoney, formatPct } from "@/lib/format"
import { deriveAwardedSavings, summarizeSavings, type InitiativeStatus, type SavingsInitiative } from "@/lib/sourcing/savings"
import type { RfqCaseDetail } from "@/domain/types"

const MAX_CASES = 100

async function loadAwardedDetails(company: string, caseIds: string[], signal?: AbortSignal) {
  const { repository } = await getDataContext()
  const details: RfqCaseDetail[] = []
  for (let offset = 0; offset < caseIds.length; offset += 4) {
    signal?.throwIfAborted()
    const batch = await Promise.all(caseIds.slice(offset, offset + 4).map((id) => repository.getRfqCase(id, company)))
    details.push(...batch.filter((d): d is RfqCaseDetail => !!d))
  }
  return details
}

function InitiativeForm({ company, currency }: { company: string; currency: string }) {
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [baseline, setBaseline] = useState("")
  const [negotiated, setNegotiated] = useState("")
  const [status, setStatus] = useState<InitiativeStatus>("negotiated")
  const valid = title.trim() && Number(baseline) > 0 && negotiated !== "" && Number(negotiated) >= 0

  const add = () => {
    try {
      initiativeStore.upsert({ id: crypto.randomUUID(), company, updatedAt: "", title: title.trim(), category: category.trim() || undefined, currency, baseline: Number(baseline), negotiated: Number(negotiated), status })
      setTitle(""); setCategory(""); setBaseline(""); setNegotiated("")
    } catch {
      toast.error("This browser could not save the initiative.")
    }
  }

  return (
    <div className="grid gap-3 md:grid-cols-6">
      <div className="space-y-1.5 md:col-span-2"><Label htmlFor="ini-title">Initiative</Label><Input id="ini-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Renegotiated licence renewal" /></div>
      <div className="space-y-1.5"><Label htmlFor="ini-cat">Category</Label><Input id="ini-cat" value={category} onChange={(e) => setCategory(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="ini-base">Baseline ({currency})</Label><Input id="ini-base" type="number" min={0} value={baseline} onChange={(e) => setBaseline(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="ini-neg">Negotiated ({currency})</Label><Input id="ini-neg" type="number" min={0} value={negotiated} onChange={(e) => setNegotiated(e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label htmlFor="ini-status">Status</Label>
        <select id="ini-status" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as InitiativeStatus)}>
          <option value="identified">Identified</option>
          <option value="negotiated">Negotiated</option>
          <option value="realized">Realized</option>
        </select>
      </div>
      <div className="md:col-span-6"><Button disabled={!valid} onClick={add}><Plus /> Add initiative</Button></div>
    </div>
  )
}

export default function SavingsPage() {
  const { company = "" } = useCompany()
  const cases = useRfqCases()
  const replies = useReplies()
  const initiatives = useCollection(initiativeStore)

  const acceptedCaseIds = useMemo(
    () => [...new Set((replies.data ?? []).filter((r) => r.status === "Accepted").map((r) => r.rfqCaseId))].sort().slice(0, MAX_CASES),
    [replies.data],
  )
  const details = useQuery({
    queryKey: ["savings-details", company, acceptedCaseIds.join(",")],
    queryFn: ({ signal }) => loadAwardedDetails(company, acceptedCaseIds, signal),
    enabled: !!company && replies.isSuccess && acceptedCaseIds.length > 0,
  })

  const derived = useMemo(() => deriveAwardedSavings(details.data ?? []), [details.data])
  const totals = useMemo(() => summarizeSavings(derived.savings, initiatives), [derived.savings, initiatives])
  const currency = cases.data?.[0]?.currency || totals[0]?.currency || "USD"
  const loading = cases.isLoading || replies.isLoading || details.isLoading

  if (cases.error || replies.error) return <ErrorState error={cases.error ?? replies.error} />

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Sourcing" title="Savings tracker" description="Savings on awarded RFQs, measured against target price or the average comparable bid, plus initiatives you record by hand." />

      {details.error && <ErrorState error={details.error} />}
      {loading ? <Skeleton className="h-28" /> : totals.length === 0 ? (
        <EmptyState icon={PiggyBank} title="No measured savings yet" description="Savings appear once an RFQ has an accepted vendor reply with a target price or at least two comparable bids, or when you add an initiative below." />
      ) : totals.map((t) => (
        <div key={t.currency} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label={`Savings (${t.currency})`} value={formatMoney(t.savings, t.currency, { compact: true })} hint={`${formatPct(t.savingsPct, 1)} of ${formatMoney(t.baseline, t.currency, { compact: true })} baseline`} icon={PiggyBank} accent="emerald" />
            <KpiCard label="From awarded RFQs" value={formatMoney(t.awardedSavings, t.currency, { compact: true })} hint={`${derived.savings.filter((s) => s.currency === t.currency).length} RFQs`} icon={TrendingDown} accent="primary" />
            <KpiCard label="From initiatives" value={formatMoney(t.initiativeSavings, t.currency, { compact: true })} hint="Negotiated or realized only" icon={Target} accent="violet" />
            <KpiCard label="Items measured" value={t.count} icon={Target} accent="sky" />
          </div>
          <SectionCard title={`Savings by category (${t.currency})`}>
            <ul className="space-y-2">
              {t.byCategory.map((c) => {
                const max = Math.max(...t.byCategory.map((x) => Math.abs(x.savings)), 1)
                return (
                  <li key={c.category} className="grid grid-cols-[160px_1fr_200px] items-center gap-3 text-sm">
                    <span className="truncate">{c.category}</span>
                    <div className="h-2 rounded-full bg-muted"><div className={c.savings >= 0 ? "h-2 rounded-full bg-emerald-500" : "h-2 rounded-full bg-destructive"} style={{ width: `${(Math.abs(c.savings) / max) * 100}%` }} /></div>
                    <span className="text-right text-xs tabular">{formatMoney(c.savings, t.currency)} · {formatPct(c.baseline > 0 ? (c.savings / c.baseline) * 100 : 0, 1)} · {c.count}</span>
                  </li>
                )
              })}
            </ul>
          </SectionCard>
        </div>
      ))}

      {derived.savings.length > 0 && (
        <SectionCard title="Awarded RFQs" description="Baseline is the target total when every line has a target price, otherwise the average of comparable bids.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="pb-2">RFQ</th><th className="pb-2">Awarded to</th><th className="pb-2 text-right">Baseline</th><th className="pb-2 text-right">Awarded</th><th className="pb-2 text-right">Saving</th><th className="pb-2 pl-3">Basis</th></tr></thead>
              <tbody>
                {derived.savings.map((s) => (
                  <tr key={s.caseId} className="border-b">
                    <td className="py-2"><Link className="font-medium hover:underline" to={`/rfqs/${encodeURIComponent(s.caseId)}`}>{s.caseId}</Link> <span className="text-muted-foreground">{s.name}</span></td>
                    <td className="py-2">{s.vendors.join(", ")}</td>
                    <td className="py-2 text-right tabular">{formatMoney(s.baseline, s.currency)}</td>
                    <td className="py-2 text-right tabular">{formatMoney(s.awardedTotal, s.currency)}</td>
                    <td className={s.savings >= 0 ? "py-2 text-right tabular text-emerald-600 dark:text-emerald-400" : "py-2 text-right tabular text-destructive"}>{formatMoney(s.savings, s.currency)} ({formatPct(s.savingsPct, 1)})</td>
                    <td className="py-2 pl-3 text-xs text-muted-foreground">{s.basis === "target" ? "Target price" : `Avg of ${s.bids} bids`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
      {derived.skipped.length > 0 && (
        <details className="rounded-xl border bg-card px-5 py-3 text-sm">
          <summary className="cursor-pointer font-medium">{derived.skipped.length} awarded RFQ{derived.skipped.length === 1 ? "" : "s"} could not be measured</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{derived.skipped.map((s) => <li key={s.caseId}>{s.caseId} {s.name}: {s.reason}</li>)}</ul>
        </details>
      )}
      {acceptedCaseIds.length === MAX_CASES && <p className="text-xs text-muted-foreground">Showing the first {MAX_CASES} awarded RFQs.</p>}

      <SectionCard title="Savings initiatives" description={`Stored in this browser. Identified items are not counted until negotiated. Amounts are in ${currency}.`}>
        <InitiativeForm company={company} currency={currency} />
        {initiatives.length > 0 && (
          <ul className="mt-4 divide-y text-sm">
            {initiatives.map((i: SavingsInitiative) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate font-medium">{i.title} <span className="font-normal text-muted-foreground">· {i.category ?? "Uncategorised"} · {i.status}</span></span>
                <span className="tabular text-xs">{formatMoney(i.baseline, i.currency)} → {formatMoney(i.negotiated, i.currency)} ({formatMoney(i.baseline - i.negotiated, i.currency)})</span>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${i.title}`} onClick={() => initiativeStore.remove(i.id)}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
