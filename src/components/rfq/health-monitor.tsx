import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Activity, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ErrorState, SectionCard } from "@/components/app/page-parts"
import { useRfqHealth } from "@/hooks/use-rfq-health"
import { evaluateRfqHealth, type HealthFinding, type HealthSeverity } from "@/lib/rfq-health"
import type { RfqCaseDetail } from "@/domain/types"
import { cn } from "@/lib/utils"

const ORDER: Record<HealthSeverity, number> = { high: 0, medium: 1, info: 2 }
const COLORS: Record<HealthSeverity, string> = {
  high: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
}

function Finding({ finding, caseId }: { finding: HealthFinding; caseId: string }) {
  return <div className="flex flex-col justify-between gap-3 border-t py-3 sm:flex-row sm:items-start">
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", COLORS[finding.severity])}>{finding.severity}</span><h4 className="text-sm font-medium">{finding.title}</h4></div>
      <p className="break-words text-xs leading-relaxed text-muted-foreground">{finding.evidence}</p>
    </div>
    <Button asChild size="sm" variant="outline" className="shrink-0 self-start"><Link to={finding.action === "Compare offers" ? `/compare?rfq=${encodeURIComponent(caseId)}` : `/rfqs/${encodeURIComponent(caseId)}`}>{finding.action}</Link></Button>
  </div>
}

function useHealthClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])
  return now
}

export function RfqHealthDetail({ detail }: { detail: RfqCaseDetail }) {
  const now = useHealthClock()
  const health = evaluateRfqHealth(detail, now)
  return <SectionCard title="RFQ health" description="Rule-based checks on the currently loaded RFQ. Unavailable fields are not assumed complete.">
    {health.findings.length ? health.findings.map((finding) => <Finding key={finding.id} finding={finding} caseId={health.caseId} />) : <p className="text-sm text-muted-foreground">No configured health rules flagged this RFQ. This is not a compliance certification.</p>}
  </SectionCard>
}

export function HealthMonitor() {
  const scan = useRfqHealth()
  const now = useHealthClock()
  const [filter, setFilter] = useState<"all" | HealthSeverity>("all")
  const [search, setSearch] = useState("")
  const [limit, setLimit] = useState(8)
  const health = useMemo(() => (scan.data?.details ?? []).map((detail) => evaluateRfqHealth(detail, now)), [scan.data, now])
  const findings = health.flatMap((rfq) => rfq.findings.map((finding) => ({ rfq, finding })))
  const filtered = findings.filter(({ rfq, finding }) => (filter === "all" || finding.severity === filter) &&
    `${rfq.caseId} ${rfq.name} ${finding.title} ${finding.evidence}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => ORDER[a.finding.severity] - ORDER[b.finding.severity] || a.rfq.caseId.localeCompare(b.rfq.caseId) || a.finding.id.localeCompare(b.finding.id))
  return <SectionCard title={<span className="flex items-center gap-2"><Activity className="size-4 text-primary" /> RFQ health monitoring</span>}
    description="Actionable attention queue for open RFQs in the selected company. Deterministic rules, not AI judgments."
    action={<Button size="sm" variant="outline" disabled={scan.isFetching} onClick={() => { void scan.refetch() }}><RefreshCw className={cn(scan.isFetching && "animate-spin")} />{scan.isFetching ? "Scanning..." : "Refresh"}</Button>}>
    <div className="space-y-3">
      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Monitoring rules and coverage</summary>
        <p className="mt-2 leading-relaxed">Deadlines within 7 calendar days (high priority within 2 days) or overdue; fewer than 2 received replies and response below 50% near/after deadline; incomplete offers; comparable quote spreads of at least 20% above the lowest. Closed RFQs are excluded. Missing data is flagged, never invented. Refreshes every 5 minutes while this overview is open, not in the background after closing the app. No emails or ERP updates are performed.</p>
      </details>
      {scan.isPending && <p role="status" className="text-sm text-muted-foreground">Checking open RFQs and their reply lines...</p>}
      {scan.error && <ErrorState error={scan.error} />}
      {scan.data && <>
        <p className="text-xs text-muted-foreground" role="status">{scan.data.details.length} of {scan.data.total} open RFQs checked · {findings.length} findings across {health.filter((rfq) => rfq.findings.length).length} RFQs · Last scan {new Date(scan.data.checkedAt).toLocaleString()}{scan.isFetching ? " · Refresh in progress; showing previous scan" : ""}{scan.error ? " · Refresh failed; showing previous scan" : ""}</p>
        {scan.data.errors.length > 0 && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="font-medium">Scan incomplete — {scan.data.errors.length} RFQ(s) could not be checked.</p>
          <ul className="mt-1 list-disc pl-4">{scan.data.errors.map((error) => <li key={error.caseId}>{error.caseId}: {error.message}</li>)}</ul>
        </div>}
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "high", "medium", "info"] as const).map((value) => <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(8) }} className="capitalize">{value} ({value === "all" ? findings.length : findings.filter(({ finding }) => finding.severity === value).length})</Button>)}
          <Input aria-label="Search health findings" placeholder="Search RFQ or finding..." value={search} onChange={(event) => { setSearch(event.target.value); setLimit(8) }} className="sm:ml-auto sm:max-w-xs" />
        </div>
        {filtered.slice(0, limit).map(({ rfq, finding }) => <article key={`${rfq.caseId}:${finding.id}`}>
          <Link to={`/rfqs/${encodeURIComponent(rfq.caseId)}`} className="text-xs font-medium text-primary hover:underline">{rfq.caseId} · {rfq.name}</Link>
          <Finding finding={finding} caseId={rfq.caseId} />
        </article>)}
        {filtered.length > limit && <Button variant="outline" onClick={() => setLimit((value) => value + 8)}>Show more ({filtered.length - limit} remaining)</Button>}
        {!filtered.length && !scan.error && <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">{findings.length ? "No findings match these filters." : scan.data.errors.length ? "No findings in the successfully checked RFQs. The scan is incomplete." : "No configured health rules flagged the scanned RFQs. This is not a compliance certification."}</p>}
      </>}
    </div>
  </SectionCard>
}
