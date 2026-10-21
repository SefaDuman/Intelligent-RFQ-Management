import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { Bot, Loader2, Send, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader } from "@/components/app/page-parts"
import { useCompany } from "@/hooks/use-company"
import { useRfqCases } from "@/hooks/use-rfq-data"
import { getDataContext } from "@/data"
import { askRfqAssistant, loadInquiryEvidence } from "@/data/rfq-inquiry"
import type { InquiryAnswer, InquirySnapshot } from "@/lib/rfq-inquiry"

interface Turn { question: string; answer: InquiryAnswer; snapshot: InquirySnapshot; errors: { caseId: string; message: string }[] }
const EXAMPLES = ["Which open RFQs need attention?", "Which RFQs expire in the next seven days?", "Which received offers have a known lead time of 14 days or less?"]

export default function AssistantPage() {
  const { company } = useCompany()
  const cases = useRfqCases()
  const [caseId, setCaseId] = useState("")
  const [question, setQuestion] = useState("")
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [phase, setPhase] = useState("")
  const [today, setToday] = useState(() => new Date().toDateString())
  const active = useRef<AbortController | undefined>(undefined)
  useEffect(() => {
    const timer = setInterval(() => setToday(new Date().toDateString()), 30000)
    return () => { clearInterval(timer); active.current?.abort(); active.current = undefined }
  }, [])
  const ask = async (event: FormEvent) => {
    event.preventDefault()
    if (!company || !question.trim() || busy) return
    const controller = new AbortController()
    active.current = controller
    setBusy(true)
    setError(undefined)
    setPhase("Reading current RFQ evidence...")
    let timer: ReturnType<typeof setTimeout> | undefined
    const text = question.trim()
    try {
      const run = async () => {
        const { repository } = await getDataContext()
        const evidence = await loadInquiryEvidence(repository, company, caseId || undefined, controller.signal)
        controller.signal.throwIfAborted()
        setPhase("Asking the read-only Copilot Studio agent...")
        const answer = await askRfqAssistant(text, evidence.snapshot, turns.slice(-3))
        controller.signal.throwIfAborted()
        return { question: text, answer, ...evidence }
      }
      const turn = await Promise.race([run(), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("The assistant took too long. Retry or select one RFQ.")) }, 180000) })])
      setTurns((previous) => [...previous.slice(-9), turn])
      setQuestion("")
    } catch (cause) {
      if (active.current === controller) setError(cause instanceof Error ? cause.message : "Unable to answer the question.")
    } finally {
      clearTimeout(timer)
      if (active.current === controller) { active.current = undefined; setBusy(false) }
    }
  }
  return <div className="space-y-5">
    <PageHeader eyebrow="Read-only Copilot Studio agent" title="RFQ assistant" description={`Ask about accessible RFQs, deadlines, replies and offer facts in ${company?.toUpperCase()}. Every answer includes source evidence.`}
      actions={<Button variant="outline" disabled={busy || !turns.length} onClick={() => { setTurns([]); setError(undefined) }}><Trash2 /> Clear conversation</Button>} />
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <p className="text-sm text-muted-foreground">Each question reads current ERP-backed virtual-table data. Only RFQ facts for this company and up to three prior turns are sent to the dedicated agent. No email, ERP writes, awards, external search or approval actions. Answers are AI-generated and need buyer verification.</p>
      <Label htmlFor="assistant-scope">Evidence scope</Label>
      <select id="assistant-scope" disabled={busy || cases.isLoading} value={caseId} onChange={(event) => { setCaseId(event.target.value); setTurns([]); setError(undefined) }} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
        <option value="">All accessible RFQs (up to 50)</option>
        {(cases.data ?? []).map((rfq) => <option key={rfq.rfqCaseId} value={rfq.rfqCaseId}>{rfq.rfqCaseId} - {rfq.name}</option>)}
      </select>
      {cases.error && <p role="alert" className="text-sm text-destructive">{cases.error.message}</p>}
      <div className="flex flex-wrap gap-2">{EXAMPLES.map((example) => <Button variant="outline" size="sm" className="h-auto whitespace-normal text-left" disabled={busy} key={example} onClick={() => setQuestion(example)}>{example}</Button>)}</div>
    </div>
    <div aria-live="polite" className="space-y-4">
      {!turns.length && <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground"><Bot className="mx-auto mb-2 size-8" /><p>Ask a question or select a suggestion to get started.</p></div>}
      {turns.map((turn, index) => <article key={index} className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="whitespace-pre-wrap break-words font-semibold">{turn.question}</h2>
        <p className="text-xs text-muted-foreground">Evidence read {new Date(turn.snapshot.checkedAt).toLocaleString()} · {turn.snapshot.company.toUpperCase()} · {turn.snapshot.scope}. Point-in-time answer; ask again to refresh.{new Date(turn.snapshot.checkedAt).toDateString() !== today ? " Date changed; this answer is stale." : ""}</p>
        {turn.errors.length > 0 && <div role="alert" className="rounded-md border border-amber-500 p-3 text-sm">Incomplete evidence; conclusions do not cover these RFQs:<ul className="list-disc pl-4">{turn.errors.map((failure) => <li key={failure.caseId}>{failure.caseId}: {failure.message}</li>)}</ul></div>}
        {turn.answer.claims.map((claim, claimIndex) => <div key={claimIndex} className="rounded-lg bg-muted/40 p-3">
          <p className="whitespace-pre-wrap break-words text-sm">{claim.text}</p>
          <div className="mt-2 space-y-2">{claim.evidenceIds.map((id) => {
            const evidence = turn.snapshot.evidence.find((item) => item.id === id)!
            return <details key={id} className="rounded border bg-background p-2 text-xs"><summary className="cursor-pointer font-medium text-primary">{evidence.label}</summary>
              {evidence.caseId && <div className="my-2 flex gap-4"><Link className="underline" to={`/rfqs/${encodeURIComponent(evidence.caseId)}`}>Open RFQ</Link><Link className="underline" to={`/compare?rfq=${encodeURIComponent(evidence.caseId)}`}>Compare replies</Link></div>}
              <pre className="overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(evidence.facts, null, 2)}</pre>
            </details>
          })}</div>
        </div>)}
      </article>)}
    </div>
    <form onSubmit={ask} className="space-y-3 rounded-xl border bg-card p-5">
      <Label htmlFor="rfq-question">Your RFQ question</Label>
      <Textarea id="rfq-question" rows={3} maxLength={2000} disabled={busy} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="For RFQ 000432, what are the vendor reply totals and known lead times?" />
      <div className="flex items-center justify-between gap-3"><span role="status" className="text-xs text-muted-foreground">{busy ? phase : `${question.length}/2000 characters · Conversation stays in this page only`}</span><Button disabled={busy || !question.trim() || !!cases.error} type="submit">{busy ? <Loader2 className="animate-spin" /> : <Send />}Ask assistant</Button></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  </div>
}
