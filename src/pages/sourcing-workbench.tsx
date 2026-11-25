import { Link, useNavigate, useParams } from "react-router-dom"
import { ClipboardCheck, FilePlus2, HelpCircle, Handshake, Layers, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState, ErrorState, PageHeader } from "@/components/app/page-parts"
import { StatusBadge } from "@/components/rfq/rfq-badges"
import { ClarificationPanel } from "@/components/sourcing/clarification-panel"
import { EvaluationPanel } from "@/components/sourcing/evaluation-panel"
import { NegotiationPanel } from "@/components/sourcing/negotiation-panel"
import { ScenarioPanel } from "@/components/sourcing/scenario-panel"
import { useRfqCase, useRfqCases, useVendors } from "@/hooks/use-rfq-data"
import { isOpenStatus } from "@/domain/types"

function CasePicker({ value }: { value?: string }) {
  const navigate = useNavigate()
  const cases = useRfqCases()
  const sorted = [...(cases.data ?? [])].sort((a, b) => Number(isOpenStatus(b.status)) - Number(isOpenStatus(a.status)) || a.rfqCaseId.localeCompare(b.rfqCaseId))
  return (
    <select aria-label="Select RFQ" className="h-10 w-full rounded-md border bg-background px-3 text-sm md:w-[380px]" value={value ?? ""} onChange={(e) => e.target.value && navigate(`/sourcing/${encodeURIComponent(e.target.value)}`)}>
      <option value="">{cases.isLoading ? "Loading RFQs…" : "Select an RFQ…"}</option>
      {sorted.map((c) => <option key={c.rfqCaseId} value={c.rfqCaseId}>{c.rfqCaseId} · {c.name} ({c.status})</option>)}
    </select>
  )
}

export default function SourcingWorkbenchPage() {
  const { id } = useParams()
  const rfqCaseId = id ? decodeURIComponent(id) : undefined
  const detail = useRfqCase(rfqCaseId)
  const vendors = useVendors()

  const header = (
    <PageHeader
      eyebrow="Sourcing"
      title="Sourcing workbench"
      description="Evaluate bids, model award scenarios, negotiate and manage supplier questions for one RFQ."
      actions={<><CasePicker value={rfqCaseId} /><Button variant="outline" asChild><Link to="/rfq-draft"><FilePlus2 /> New RFQ draft</Link></Button></>}
    />
  )

  if (!rfqCaseId) {
    return <div className="space-y-5">{header}<EmptyState icon={Wrench} title="Select an RFQ" description="Pick an RFQ to open its evaluation scorecard, award scenarios, negotiation rounds and clarification log." /></div>
  }
  if (detail.error || vendors.error) return <div className="space-y-5">{header}<ErrorState error={detail.error ?? vendors.error} /></div>
  if (detail.isLoading || vendors.isLoading) return <div className="space-y-5">{header}<Skeleton className="h-96" /></div>
  if (!detail.data) return <div className="space-y-5">{header}<EmptyState icon={Wrench} title="RFQ not found" description={`No RFQ case with id ${rfqCaseId}.`} /></div>

  const { header: rfq } = detail.data
  return (
    <div className="space-y-5">
      {header}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4 text-sm">
        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{rfq.rfqCaseId}</span>
        <StatusBadge status={rfq.status} />
        <Link to={`/rfqs/${encodeURIComponent(rfq.rfqCaseId)}`} className="font-medium hover:underline">{rfq.name}</Link>
        <span className="text-muted-foreground">· {rfq.procurementCategory ?? "No category"} · {detail.data.replies.length} vendor RFQs · {detail.data.lines.length} lines</span>
      </div>
      <Tabs defaultValue="evaluation" className="space-y-4">
        <TabsList>
          <TabsTrigger value="evaluation"><ClipboardCheck /> Evaluation</TabsTrigger>
          <TabsTrigger value="scenarios"><Layers /> Award scenarios</TabsTrigger>
          <TabsTrigger value="negotiation"><Handshake /> Negotiation</TabsTrigger>
          <TabsTrigger value="clarifications"><HelpCircle /> Clarifications</TabsTrigger>
        </TabsList>
        <TabsContent value="evaluation"><EvaluationPanel detail={detail.data} vendors={vendors.data ?? []} /></TabsContent>
        <TabsContent value="scenarios"><ScenarioPanel detail={detail.data} /></TabsContent>
        <TabsContent value="negotiation"><NegotiationPanel detail={detail.data} vendors={vendors.data ?? []} /></TabsContent>
        <TabsContent value="clarifications"><ClarificationPanel detail={detail.data} vendors={vendors.data ?? []} /></TabsContent>
      </Tabs>
    </div>
  )
}
