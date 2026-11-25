import { useMemo, useState } from "react"
import { toast } from "sonner"
import { HelpCircle, Megaphone, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, SectionCard } from "@/components/app/page-parts"
import { useCompany } from "@/hooks/use-company"
import { useCurrentUser, useSendInvites } from "@/hooks/use-rfq-data"
import { clarificationStore, useCollection } from "@/hooks/use-sourcing"
import type { RfqCaseDetail, Vendor } from "@/domain/types"
import { buildPublishEmail, clarificationStatus, newClarification, publishRecipientStatuses, summarizeClarifications, type Clarification } from "@/lib/sourcing/clarifications"
import { plainMessageHtml } from "@/lib/sourcing/email"
import { cn } from "@/lib/utils"

const STATUS_STYLE = {
  open: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  answered: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  published: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
} as const

function ClarificationItem({ item, detail, vendors }: { item: Clarification; detail: RfqCaseDetail; vendors: Vendor[] }) {
  const { data: user } = useCurrentUser()
  const send = useSendInvites()
  const [answer, setAnswer] = useState(item.answer ?? "")
  const [wording, setWording] = useState(item.publishedQuestion ?? item.question)
  const [approved, setApproved] = useState(false)
  const status = clarificationStatus(item)
  const emailOf = useMemo(() => new Map(vendors.map((v) => [v.accountNumber, v.email])), [vendors])
  const recipients = detail.replies
    .filter((r) => publishRecipientStatuses(r.status) && emailOf.get(r.vendorAccount))
    .map((r) => ({ rfqId: r.rfqId, vendorAccount: r.vendorAccount, vendorName: r.vendorName, email: emailOf.get(r.vendorAccount)! }))
  const email = buildPublishEmail({ caseId: detail.header.rfqCaseId, caseName: detail.header.name, question: wording, answer: item.answer ?? answer, senderName: user?.fullName || "Procurement" })

  const persist = (next: Clarification) => {
    try {
      clarificationStore.upsert(next)
    } catch {
      toast.error("This browser could not save the clarification.")
    }
  }

  const publish = async () => {
    try {
      const results = await send.mutateAsync({
        rfqCaseId: detail.header.rfqCaseId,
        recipients: recipients.map((r) => ({ vendorAccount: r.vendorAccount, vendorName: r.vendorName, email: r.email })),
        subject: email.subject,
        sentBy: user?.fullName,
        buildBody: (r) => plainMessageHtml(email.message, r.vendorName, detail.header.rfqCaseId),
      })
      const delivered = new Set(results.filter((r) => r.ok).map((r) => r.recipient))
      if (delivered.size) {
        persist({ ...item, publishedQuestion: wording, publishedAt: new Date().toISOString(), publishedToRfqIds: recipients.filter((r) => delivered.has(r.email)).map((r) => r.rfqId) })
        toast.success(`Clarification sent to ${delivered.size} vendor${delivered.size === 1 ? "" : "s"}.`)
      }
      if (delivered.size < results.length) toast.error(`${results.length - delivered.size} e-mail${results.length - delivered.size === 1 ? "" : "s"} failed.`)
      setApproved(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sending failed.")
    }
  }

  return (
    <li className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={cn("rounded-full px-2 py-0.5 font-medium capitalize", STATUS_STYLE[status])}>{status}</span>
        <span className="text-muted-foreground">{item.source === "vendor" ? `Question from ${item.vendorName ?? "a vendor"}` : "Buyer note"} · {new Date(item.createdAt).toLocaleString()}</span>
        <Button className="ml-auto" variant="ghost" size="sm" onClick={() => clarificationStore.remove(item.id)}>Delete</Button>
      </div>
      <p className="text-sm font-medium">{item.question}</p>
      <div className="space-y-1.5">
        <Label htmlFor={`answer-${item.id}`}>Answer</Label>
        <Textarea id={`answer-${item.id}`} rows={2} disabled={status === "published"} value={answer} onChange={(e) => setAnswer(e.target.value)} />
        {status !== "published" && (
          <Button size="sm" variant="outline" disabled={!answer.trim() || answer.trim() === item.answer} onClick={() => persist({ ...item, answer: answer.trim(), answeredAt: new Date().toISOString() })}>Save answer</Button>
        )}
      </div>
      {status === "answered" && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Share with all invited vendors</div>
          <Label htmlFor={`wording-${item.id}`} className="text-xs">Published question (remove names and confidential details)</Label>
          <Textarea id={`wording-${item.id}`} rows={2} value={wording} onChange={(e) => { setWording(e.target.value); setApproved(false) }} />
          <p className="text-xs text-muted-foreground">Goes to {recipients.length} vendor{recipients.length === 1 ? "" : "s"} with an e-mail address. The asking vendor is not named.</p>
          <label className="flex items-start gap-2 text-sm"><Checkbox className="mt-0.5" checked={approved} onCheckedChange={(v) => setApproved(v === true)} disabled={!recipients.length} /> I reviewed the wording and approve sending it to every invited vendor.</label>
          <Button size="sm" disabled={!approved || !recipients.length || send.isPending} onClick={publish}><Megaphone /> {send.isPending ? "Sending…" : "Publish answer"}</Button>
        </div>
      )}
      {status === "published" && <p className="text-xs text-muted-foreground">Published {new Date(item.publishedAt!).toLocaleString()} to {item.publishedToRfqIds?.length ?? 0} vendor(s) as: “{item.publishedQuestion ?? item.question}”.</p>}
    </li>
  )
}

export function ClarificationPanel({ detail, vendors }: { detail: RfqCaseDetail; vendors: Vendor[] }) {
  const { company = "" } = useCompany()
  const caseId = detail.header.rfqCaseId
  const items = useCollection(clarificationStore).filter((c) => c.caseId === caseId)
  const [source, setSource] = useState<"vendor" | "buyer">("vendor")
  const [vendorRfq, setVendorRfq] = useState("")
  const [question, setQuestion] = useState("")
  const summary = summarizeClarifications(items)

  const add = () => {
    const reply = detail.replies.find((r) => r.rfqId === vendorRfq)
    try {
      clarificationStore.upsert(newClarification(company, caseId, source, question, source === "vendor" && reply ? { account: reply.vendorAccount, name: reply.vendorName } : undefined))
      setQuestion("")
    } catch {
      toast.error("This browser could not save the clarification.")
    }
  }

  return (
    <div className="space-y-5">
      <SectionCard title="Log a question" description="Record vendor questions received by e-mail or phone, or add a buyer note. Answers can be shared with every invited vendor so all bid on the same information.">
        <div className="grid gap-3 md:grid-cols-[180px_240px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="clar-source">Source</Label>
            <select id="clar-source" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={source} onChange={(e) => setSource(e.target.value as "vendor" | "buyer")}>
              <option value="vendor">Vendor question</option>
              <option value="buyer">Buyer note</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clar-vendor">Vendor</Label>
            <select id="clar-vendor" disabled={source !== "vendor"} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={vendorRfq} onChange={(e) => setVendorRfq(e.target.value)}>
              <option value="">Not specified</option>
              {detail.replies.map((r) => <option key={r.rfqId} value={r.rfqId}>{r.vendorName}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="clar-question">Question</Label><Textarea id="clar-question" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} /></div>
        </div>
        <Button className="mt-3" disabled={!question.trim()} onClick={add}><Plus /> Add</Button>
      </SectionCard>

      {items.length === 0 ? (
        <EmptyState icon={HelpCircle} title="No clarifications yet" description="Questions and answers for this RFQ will be tracked here." />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{summary.open} open · {summary.answered} answered, not shared · {summary.published} published</p>
          <ul className="space-y-3">{items.map((c) => <ClarificationItem key={c.id} item={c} detail={detail} vendors={vendors} />)}</ul>
        </>
      )}
    </div>
  )
}
