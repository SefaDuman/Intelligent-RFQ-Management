import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Handshake, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, SectionCard } from "@/components/app/page-parts"
import { useCurrentUser, useSendInvites } from "@/hooks/use-rfq-data"
import { roundStore, useCollection } from "@/hooks/use-sourcing"
import { useCompany } from "@/hooks/use-company"
import { hasReplied, type RfqCaseDetail, type RfqReply, type Vendor } from "@/domain/types"
import { formatMoney, formatPct } from "@/lib/format"
import { plainMessageHtml } from "@/lib/sourcing/email"
import { buildRequestEmail, buildTargets, measureRound, newRound, roundSavings, STRATEGY_LABELS, type BidSnapshot, type NegotiationRound, type TargetStrategy } from "@/lib/sourcing/negotiation"
import { cn } from "@/lib/utils"

const replyTotal = (r: RfqReply) => r.totalAmount ?? r.lines?.filter((l) => l.quoted).reduce((s, l) => s + l.netAmount, 0) ?? 0

export function NegotiationPanel({ detail, vendors }: { detail: RfqCaseDetail; vendors: Vendor[] }) {
  const { company = "" } = useCompany()
  const { data: user } = useCurrentUser()
  const send = useSendInvites()
  const caseId = detail.header.rfqCaseId
  const currency = detail.header.currency || "USD"
  const rounds = useCollection(roundStore).filter((r) => r.caseId === caseId).sort((a, b) => b.number - a.number)
  const [selectedId, setSelectedId] = useState<string>()
  const round = rounds.find((r) => r.id === selectedId) ?? rounds[0]
  const [approved, setApproved] = useState(false)

  const emailOf = useMemo(() => new Map(vendors.map((v) => [v.accountNumber, v.email])), [vendors])
  const bids: BidSnapshot[] = useMemo(
    () => detail.replies.filter((r) => hasReplied(r.status) && replyTotal(r) > 0).map((r) => ({ rfqId: r.rfqId, vendorAccount: r.vendorAccount, vendorName: r.vendorName, email: emailOf.get(r.vendorAccount), total: replyTotal(r) })),
    [detail.replies, emailOf],
  )
  const live = useMemo(() => Object.fromEntries(detail.replies.map((r) => [r.rfqId, replyTotal(r) || undefined])), [detail.replies])
  const movements = useMemo(() => (round ? measureRound(round, live) : []), [round, live])
  const gain = roundSavings(movements)

  const save = (next: NegotiationRound) => {
    try {
      roundStore.upsert(next)
    } catch {
      toast.error("This browser could not save the negotiation round.")
    }
  }

  if (bids.length < 2 && !round) {
    return <EmptyState icon={Handshake} title="Need at least two priced bids" description="Negotiation rounds start from the vendor replies already received on this RFQ." />
  }

  const open = () => {
    const created = newRound(company, caseId, (rounds[0]?.number ?? 0) + 1, bids)
    save(created)
    setSelectedId(created.id)
    setApproved(false)
  }

  const patchTarget = (rfqId: string, patch: Partial<NegotiationRound["targets"][number]>) => round && save({ ...round, targets: round.targets.map((t) => (t.rfqId === rfqId ? { ...t, ...patch } : t)) })
  const setStrategy = (strategy: TargetStrategy, percent: number) => {
    if (!round) return
    const fresh = buildTargets(round.targets.map((t) => ({ rfqId: t.rfqId, vendorAccount: t.vendorAccount, vendorName: t.vendorName, email: t.email, total: t.snapshotTotal })), strategy, percent)
    save({ ...round, strategy, percent, targets: fresh.map((f) => ({ ...f, included: round.targets.find((t) => t.rfqId === f.rfqId)?.included ?? f.included })) })
  }

  const recipients = round ? round.targets.filter((t) => t.included && t.email && !round.requestedRfqIds.includes(t.rfqId)) : []
  const emailFor = (t: NonNullable<typeof round>["targets"][number]) =>
    buildRequestEmail({ caseId, caseName: detail.header.name, vendorName: t.vendorName, roundNumber: round!.number, replyBy: round!.replyBy, currency, ownTotal: t.snapshotTotal, targetTotal: t.targetTotal, senderName: user?.fullName || "Procurement", note: round!.note })

  const sendRequests = async () => {
    if (!round || !recipients.length || !approved) return
    try {
      const results = await send.mutateAsync({
        rfqCaseId: caseId,
        recipients: recipients.map((t) => ({ vendorAccount: t.vendorAccount, vendorName: t.vendorName, email: t.email! })),
        subject: emailFor(recipients[0]).subject,
        sentBy: user?.fullName,
        buildBody: (r) => {
          const target = recipients.find((t) => t.email === r.email)!
          return plainMessageHtml(emailFor(target).message, r.vendorName, caseId)
        },
      })
      const delivered = new Set(results.filter((r) => r.ok).map((r) => r.recipient))
      const sent = recipients.filter((t) => delivered.has(t.email!)).map((t) => t.rfqId)
      save({ ...round, requestedRfqIds: [...round.requestedRfqIds, ...sent] })
      setApproved(false)
      const failed = results.length - delivered.size
      if (failed) toast.error(`${failed} request${failed === 1 ? "" : "s"} failed. Sent ones are recorded; retry for the rest.`)
      else toast.success(`Best-and-final-offer request sent to ${delivered.size} vendor${delivered.size === 1 ? "" : "s"}.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sending failed.")
    }
  }

  if (!round) {
    return (
      <EmptyState icon={Handshake} title="No negotiation round yet" description="Open a round to snapshot today's bids, set target totals and request best and final offers."
        action={<Button onClick={open}>Open round 1</Button>} />
    )
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title={`Round ${round.number}`}
        description="Targets are suggestions for the buyer. Vendors see only their own total and target, never competing bids."
        action={
          <div className="flex items-center gap-2">
            {rounds.length > 1 && (
              <select aria-label="Select round" className="h-8 rounded-md border bg-background px-2 text-sm" value={round.id} onChange={(e) => { setSelectedId(e.target.value); setApproved(false) }}>
                {rounds.map((r) => <option key={r.id} value={r.id}>Round {r.number}</option>)}
              </select>
            )}
            <Button size="sm" variant="outline" onClick={open}>Open next round</Button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="strategy">Target strategy</Label>
            <select id="strategy" className="h-9 rounded-md border bg-background px-2 text-sm" value={round.strategy} onChange={(e) => setStrategy(e.target.value as TargetStrategy, round.percent)}>
              {(Object.keys(STRATEGY_LABELS) as TargetStrategy[]).map((s) => <option key={s} value={s}>{STRATEGY_LABELS[s]}</option>)}
            </select>
          </div>
          {round.strategy === "percent" && (
            <div className="space-y-1.5"><Label htmlFor="pct">Reduction %</Label><Input id="pct" className="w-24" type="number" min={0} max={50} value={round.percent} onChange={(e) => setStrategy("percent", Math.min(50, Math.max(0, Number(e.target.value))))} /></div>
          )}
          <div className="space-y-1.5"><Label htmlFor="round-reply">Reply by</Label><Input id="round-reply" type="date" value={round.replyBy ?? ""} onChange={(e) => save({ ...round, replyBy: e.target.value || undefined })} /></div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="w-8 pb-2" /><th className="pb-2">Vendor</th><th className="pb-2 text-right">Round-start total</th><th className="pb-2 text-right">Target</th><th className="pb-2 text-right">Current total</th><th className="pb-2 text-right">Change</th><th className="pb-2 pl-3">Request</th></tr></thead>
            <tbody>
              {round.targets.map((t) => {
                const m = movements.find((x) => x.target.rfqId === t.rfqId)
                return (
                  <tr key={t.rfqId} className={cn("border-b", !t.included && "opacity-60")}>
                    <td className="py-2"><Checkbox aria-label={`Include ${t.vendorName}`} checked={t.included} onCheckedChange={(v) => patchTarget(t.rfqId, { included: v === true })} /></td>
                    <td className="py-2">{t.vendorName}{!t.email && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">no e-mail</span>}</td>
                    <td className="py-2 text-right tabular">{formatMoney(t.snapshotTotal, currency)}</td>
                    <td className="py-2 text-right"><Input aria-label={`Target for ${t.vendorName}`} className="ml-auto h-8 w-32 text-right" type="number" min={0} step="0.01" placeholder="None" value={t.targetTotal ?? ""} onChange={(e) => patchTarget(t.rfqId, { targetTotal: e.target.value === "" ? undefined : Number(e.target.value) })} /></td>
                    <td className="py-2 text-right tabular">{m ? formatMoney(m.current, currency) : "—"}</td>
                    <td className={cn("py-2 text-right tabular", m?.status === "improved" && "text-emerald-600 dark:text-emerald-400", m?.status === "worse" && "text-destructive")}>
                      {m ? (m.status === "unchanged" ? "No change" : `${formatMoney(m.delta, currency, { compact: true })} (${formatPct(m.deltaPct, 1, true)})`) : "—"}
                      {m?.metTarget && <span className="ml-2 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">Target met</span>}
                    </td>
                    <td className="py-2 pl-3 text-xs text-muted-foreground">{round.requestedRfqIds.includes(t.rfqId) ? "Sent" : "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm">
          {gain.improvedVendors > 0
            ? <>Improved bids so far: <strong>{formatMoney(gain.amount, currency)}</strong> ({formatPct(gain.pct, 1)}) across {gain.improvedVendors} vendor{gain.improvedVendors === 1 ? "" : "s"}.</>
            : <span className="text-muted-foreground">No improved bids yet. Vendors re-quote in Dynamics 365; refresh this page to see new totals.</span>}
        </p>
      </SectionCard>

      <SectionCard title="Request best and final offers" description="Sends one personalised e-mail per vendor through your connected mailbox, and records it in the invitation history.">
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="round-note">Message to vendors (optional)</Label><Textarea id="round-note" rows={2} value={round.note ?? ""} onChange={(e) => save({ ...round, note: e.target.value || undefined })} /></div>
          {recipients[0] ? (
            <details className="rounded-lg border p-3 text-sm" open>
              <summary className="cursor-pointer font-medium">Preview for {recipients[0].vendorName}</summary>
              <p className="mt-2 text-xs text-muted-foreground">Subject: {emailFor(recipients[0]).subject}</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{emailFor(recipients[0]).message}</pre>
            </details>
          ) : <p className="text-sm text-muted-foreground">No pending recipients. Include vendors with an e-mail address to send requests.</p>}
          <label className="flex items-start gap-2 text-sm"><Checkbox className="mt-0.5" checked={approved} onCheckedChange={(v) => setApproved(v === true)} disabled={!recipients.length} /> I reviewed the message and targets and approve sending to {recipients.length} vendor{recipients.length === 1 ? "" : "s"}.</label>
          <Button disabled={!approved || !recipients.length || send.isPending} onClick={sendRequests}><Send /> {send.isPending ? "Sending…" : "Send requests"}</Button>
        </div>
      </SectionCard>
    </div>
  )
}
