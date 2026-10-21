import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { MailCheck, RefreshCw, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { getDataContext } from "@/data"
import { defaultFollowupDraft, draftFollowup, FollowupJournal, followupBlock, scanFollowups, sendApprovedFollowup } from "@/data/vendor-followup"
import { validFollowupEmail, type FollowupCandidate } from "@/lib/vendor-followup"
import { useCompany } from "@/hooks/use-company"
import { useDataContext } from "@/hooks/use-rfq-data"
import { PageHeader } from "@/components/app/page-parts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

function ReminderReview({ candidate, onSent, onClose }: { candidate: FollowupCandidate; onSent: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState(() => defaultFollowupDraft(candidate))
  const [approved, setApproved] = useState(false)
  const [aiDraft, setAiDraft] = useState(false)
  const context = useDataContext()
  const history = useQuery({ queryKey: ["followup-history"], queryFn: () => new FollowupJournal().list(), staleTime: 0 })
  const generation = useMutation({
    mutationFn: () => {
      let timer: ReturnType<typeof setTimeout>
      return Promise.race([draftFollowup(candidate), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Drafting timed out. Retry or use the standard draft.")), 180000) })]).finally(() => clearTimeout(timer))
    },
    onSuccess: (value) => { setDraft(value); setApproved(false); setAiDraft(true) },
  })
  const sending = useMutation({
    mutationFn: async () => sendApprovedFollowup(await getDataContext(), candidate, draft, approved),
    onSuccess: () => { toast.success("Outlook accepted the follow-up email. This is not a delivery/read receipt."); onSent() },
    onError: (error) => toast.error(error.message),
    onSettled: () => { setApproved(false); void history.refetch() },
  })
  const busy = generation.isPending || sending.isPending
  const block = history.data ? followupBlock(candidate, history.data) : undefined
  const unavailable = !validFollowupEmail(candidate.email) ? "No unique valid vendor email is available. Correct the company vendor directory and scan again." :
    context.data?.email.channel !== "outlook" ? "Live Outlook is unavailable. Drafting is available, but follow-up sending is disabled." : undefined
  return <Dialog open onOpenChange={(open) => { if (!open && !sending.isPending) onClose() }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
    <DialogHeader><DialogTitle>Review vendor reminder</DialogTitle><DialogDescription>Review the recipient and exact content before approving one email.</DialogDescription></DialogHeader>
    <section className="space-y-4">
    <div>
      <h2 className="text-lg font-semibold">Review reminder: {candidate.vendorName}</h2>
      <p className="text-sm text-muted-foreground">{candidate.company.toUpperCase()} · Case {candidate.caseId} · Vendor RFQ {candidate.rfqId}</p>
      <p className="mt-2 text-sm">To: <strong>{candidate.email || "Unavailable"}</strong> · Recorded deadline: <strong>{candidate.deadline}</strong></p>
      <p className="mt-2 text-sm text-muted-foreground">Recipients come from the current company vendor directory. No CC/BCC, competitors, quote values or attachments. Sending rechecks status, source facts and recipient.</p>
      {candidate.daysRemaining < 0 && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Deadline passed. Confirm that contacting this vendor is appropriate; this email cannot extend the ERP deadline.</p>}
    </div>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => { setApproved(false); generation.mutate() }}><Sparkles />{generation.isPending ? "Drafting..." : "Draft with AI"}</Button>
      <Button variant="outline" disabled={busy} onClick={() => { setDraft(defaultFollowupDraft(candidate)); setApproved(false); setAiDraft(false); generation.reset() }}>Use standard draft</Button>
    </div>
    <p className="text-xs text-muted-foreground">{aiDraft ? "AI-generated wording: verify every statement before approving." : "Standard factual draft: edit and review before approving."} AI only drafts; it has no email or ERP tools.</p>
    <div className="space-y-2"><Label htmlFor="reminder-subject">Email subject</Label><Input id="reminder-subject" maxLength={200} disabled={busy} value={draft.subject} onChange={(event) => { setDraft({ ...draft, subject: event.target.value }); setApproved(false) }} /></div>
    <div className="space-y-2"><Label htmlFor="reminder-message">Email message</Label><Textarea id="reminder-message" rows={12} maxLength={4000} disabled={busy} value={draft.message} onChange={(event) => { setDraft({ ...draft, message: event.target.value }); setApproved(false) }} /></div>
    <details className="rounded-md border p-3 text-sm"><summary className="cursor-pointer font-medium">Plain-text email preview</summary><p className="mt-3 font-semibold">{draft.subject}</p><p className="mt-3 whitespace-pre-wrap break-words">{draft.message}</p></details>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" disabled={busy || sending.isSuccess} checked={approved} onChange={(event) => setApproved(event.target.checked)} />I checked the recipient, deadline and exact message above. I approve sending this one reminder now from the connected Outlook mailbox.</label>
    {(unavailable || block || history.error) && <p role="alert" className="text-sm text-destructive">{unavailable || block || history.error?.message}</p>}
    {generation.error && <p role="alert" className="text-sm text-destructive">{generation.error.message}</p>}
    {sending.error && <p role="alert" className="text-sm text-destructive">{sending.error.message}</p>}
    {sending.isSuccess && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">Outlook accepted this reminder. A 24-hour follow-up guard now applies.</p>}
    <Button className="h-auto whitespace-normal text-left" disabled={busy || !approved || !!unavailable || !!block || !history.data || !!history.error || sending.isSuccess} onClick={() => sending.mutate()}><MailCheck />{sending.isPending ? "Rechecking and sending..." : "Approve and send one email"}</Button>
    </section>
  </DialogContent></Dialog>
}

export default function VendorFollowupPage() {
  const { company } = useCompany()
  const [selected, setSelected] = useState<FollowupCandidate>()
  const history = useQuery({ queryKey: ["followup-history"], queryFn: () => new FollowupJournal().list(), staleTime: 0 })
  const scan = useQuery({
    queryKey: ["vendor-followup-scan", company],
    queryFn: async ({ signal }) => scanFollowups((await getDataContext()).repository, company!, signal),
    enabled: false, retry: false,
  })
  const refresh = () => { setSelected(undefined); void scan.refetch(); void history.refetch() }
  const attempts = (history.data ?? []).filter((attempt) => attempt.company.toLowerCase() === company?.toLowerCase())
  return <div className="space-y-5">
    <PageHeader eyebrow="Supervised agent" title="Vendor follow-up" description={`Find outstanding vendor RFQs in ${company?.toUpperCase()}, draft reminders and approve each email.`}
      actions={<Button disabled={scan.isFetching} onClick={refresh}><RefreshCw className={scan.isFetching ? "animate-spin" : ""} />{scan.isFetching ? "Scanning..." : "Scan outstanding replies"}</Button>} />
    <div className="rounded-xl border bg-card p-5 text-sm space-y-2">
      <p>Open RFQs only, recorded deadline within seven calendar days or overdue, and vendor RFQ status <strong>Sent</strong>. Received, declined, canceled and draft vendor RFQs are excluded. Missing deadlines are not assumed overdue.</p>
      <p className="text-muted-foreground">Runs only when you scan. AI drafts are optional and never sent automatically. No ERP changes, deadline extensions, awards or purchase orders.</p>
      <p className="text-muted-foreground">The 24-hour guard and attempt history are browser-local, not shared across buyers or devices. Do not use another device or clear storage to bypass a guard. Outlook acceptance is not proof of delivery.</p>
    </div>
    {scan.error && <p role="alert" className="rounded-xl border border-destructive p-4 text-sm text-destructive">Scan failed: {scan.error.message}. Previous results, if shown, are stale; scan again before review.</p>}
    {history.error && <p role="alert" className="text-sm text-destructive">History unavailable; sending is blocked: {history.error.message}</p>}
    {!scan.data && !scan.isFetching && !scan.error && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Scan to identify vendor RFQs that need a buyer-reviewed reminder.</p>}
    {scan.data && <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Checked {scan.data.checked}/{scan.data.total} eligible RFQs · {new Date(scan.data.checkedAt).toLocaleString()} · {scan.data.candidates.length} outstanding vendor RFQs · {scan.data.unknownDeadlines} open RFQs excluded because deadlines are unavailable.</p>
      {scan.data.errors.length > 0 && <div role="alert" className="rounded-xl border border-amber-500 p-4 text-sm">Incomplete coverage. Failed RFQs:<ul className="list-disc pl-5">{scan.data.errors.map((failure) => <li key={failure.caseId}>{failure.caseId}: {failure.message}</li>)}</ul></div>}
      {!scan.data.candidates.length && <p className="rounded-xl border p-6">No eligible outstanding vendor RFQs in the successfully checked data. {scan.data.errors.length > 0 && "Failed RFQs remain unknown."}</p>}
      <div className="grid gap-3 lg:grid-cols-2">{scan.data.candidates.map((candidate) => {
        const blocked = history.data ? followupBlock(candidate, history.data) : undefined
        return <div key={`${candidate.caseId}:${candidate.rfqId}:${candidate.vendorAccount}`} className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex justify-between gap-3"><div><h2 className="font-semibold">{candidate.vendorName}</h2><p className="text-sm">{candidate.caseId} · {candidate.caseName}</p></div><span className="text-xs text-muted-foreground">{candidate.daysRemaining < 0 ? `${-candidate.daysRemaining}d overdue` : `${candidate.daysRemaining}d left`}</span></div>
          <p className="text-xs text-muted-foreground">Vendor RFQ {candidate.rfqId} · Sent · Due {candidate.deadline}<br />{candidate.email || "Vendor email unavailable"}</p>
          {blocked && <p className="text-xs text-amber-700 dark:text-amber-300">{blocked}</p>}
          <div className="flex items-center gap-4"><Button variant="outline" size="sm" disabled={scan.isFetching || !!scan.error} onClick={() => setSelected(candidate)}>Review reminder</Button><Link className="text-sm text-primary underline" to={`/rfqs/${encodeURIComponent(candidate.caseId)}`}>Open RFQ</Link></div>
        </div>
      })}</div>
    </div>}
    {selected && <ReminderReview key={selected.sourceKey} candidate={selected} onSent={() => { void history.refetch() }} onClose={() => setSelected(undefined)} />}
    <details className="rounded-xl border bg-card p-5"><summary className="cursor-pointer font-medium">Browser-local follow-up history ({attempts.length})</summary>
      <p className="mt-3 text-xs text-muted-foreground">Stores recipient, subject, time and delivery state in this browser. Pending/unknown outcomes block further reminders until independently reconciled with Outlook; no automatic retry. Not an immutable audit record or approval workflow.</p>
      <ul className="mt-3 space-y-2 text-sm">{attempts.slice(0, 50).map((attempt) => <li key={attempt.id} className="rounded border p-3">{attempt.caseId} / {attempt.rfqId} · {attempt.email} · {attempt.status === "sent" ? "Outlook accepted" : "Delivery uncertain - check Sent Items"}<br /><span className="text-xs text-muted-foreground">{new Date(attempt.at).toLocaleString()} · {attempt.subject}</span></li>)}</ul>
      {attempts.length > 50 && <p className="mt-2 text-xs">Showing the latest 50 attempts. Older records still enforce the sending guard.</p>}
    </details>
  </div>
}
