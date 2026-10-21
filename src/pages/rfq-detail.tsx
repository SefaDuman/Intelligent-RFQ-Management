import { useMemo, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, CalendarDays, Clock, ExternalLink, Mail, MailX, Package, Scale, Tag, Truck, User, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState, ErrorState, SectionCard } from "@/components/app/page-parts"
import { DeadlinePill, StatusBadge, VendorAvatar } from "@/components/rfq/rfq-badges"
import { InviteDialog } from "@/components/rfq/invite-dialog"
import { RfqHealthDetail } from "@/components/rfq/health-monitor"
import { useInvitations, useRfqCase } from "@/hooks/use-rfq-data"
import { hasReplied, isOpenStatus } from "@/domain/types"
import { formatDate, formatMoney, formatNumber, formatUnitPrice, timeAgo } from "@/lib/format"
import { fnoRfqCaseUrl } from "@/config/app-config"
import { cn } from "@/lib/utils"

function Fact({ icon: Icon, label, children }: { icon: typeof Tag; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 rounded-md bg-muted p-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium">{children}</div>
      </div>
    </div>
  )
}

export default function RfqDetailPage() {
  const { id = "" } = useParams()
  const rfqCaseId = decodeURIComponent(id)
  const navigate = useNavigate()
  const { data, isLoading, error } = useRfqCase(rfqCaseId)
  const invitations = useInvitations(rfqCaseId)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const stats = useMemo(() => {
    if (!data) return undefined
    const answered = data.replies.filter((r) => hasReplied(r.status))
    const totals = answered.map((r) => r.totalAmount).filter((t): t is number => !!t)
    const target = data.lines.reduce((s, l) => s + (l.targetUnitPrice ?? 0) * l.quantity, 0)
    return {
      invited: data.replies.filter((r) => r.status !== "Created").length,
      notSent: data.replies.filter((r) => r.status === "Created").length,
      replied: answered.length,
      min: totals.length ? Math.min(...totals) : undefined,
      max: totals.length ? Math.max(...totals) : undefined,
      avg: totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : undefined,
      target: target || undefined,
    }
  }, [data])

  if (error) return <ErrorState error={error} />
  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    )
  if (!data || !stats)
    return <EmptyState icon={Package} title="RFQ not found" description={`No RFQ case with id ${rfqCaseId}.`} action={<Button asChild variant="outline"><Link to="/rfqs">Back to RFQs</Link></Button>} />

  const { header, lines, replies } = data
  const currency = header.currency
  const fnoUrl = fnoRfqCaseUrl(header.company)
  const answeredIds = replies.filter((r) => hasReplied(r.status)).map((r) => r.rfqId)
  const progress = stats.invited ? (stats.replied / stats.invited) * 100 : 0

  const toggle = (rfqId: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rfqId)) next.delete(rfqId)
      else next.add(rfqId)
      return next
    })

  const compareUrl = (ids: string[]) => `/compare?rfq=${encodeURIComponent(header.rfqCaseId)}${ids.length ? `&replies=${ids.map(encodeURIComponent).join(",")}` : ""}`

  return (
    <div className="space-y-5">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground" onClick={() => navigate(-1)}>
          <ArrowLeft /> Back
        </Button>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{header.rfqCaseId}</span>
              <StatusBadge status={header.status} />
              {isOpenStatus(header.status) && <DeadlinePill date={header.expiryDate} />}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{header.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {fnoUrl && (
              <Button variant="outline" asChild>
                <a href={fnoUrl} target="_blank" rel="noreferrer">
                  <ExternalLink /> Open in F&SC
                </a>
              </Button>
            )}
            {isOpenStatus(header.status) && (
              <Button variant="outline" onClick={() => setInviteOpen(true)}>
                <Mail /> Invite vendors
              </Button>
            )}
            <Button disabled={answeredIds.length < 2} onClick={() => navigate(compareUrl(selected.size >= 2 ? [...selected] : answeredIds))}>
              <Scale /> {selected.size >= 2 ? `Compare ${selected.size} selected` : "Compare replies"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-4 shadow-xs md:grid-cols-4 xl:grid-cols-7">
        <Fact icon={Tag} label="Category">{header.procurementCategory ?? "—"}</Fact>
        <Fact icon={User} label="Requester">{header.requester ?? "—"}</Fact>
        <Fact icon={CalendarDays} label="Created">{formatDate(header.createdDate)}</Fact>
        <Fact icon={Clock} label="Reply deadline">{formatDate(header.expiryDate)}</Fact>
        <Fact icon={Truck} label="Requested delivery">{formatDate(header.requestedDeliveryDate)}</Fact>
        <Fact icon={Package} label="Delivery terms">{header.deliveryTerms ?? "—"}</Fact>
        <Fact icon={Wallet} label="Company · Currency">{`${header.company} · ${currency || "—"}`}</Fact>
      </div>

      {isOpenStatus(header.status) && <RfqHealthDetail detail={data} />}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <Tabs defaultValue="replies">
            <TabsList>
              <TabsTrigger value="replies">Vendor replies ({replies.length})</TabsTrigger>
              <TabsTrigger value="lines">Lines ({lines.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="replies" className="mt-3">
              {replies.length === 0 ? (
                <EmptyState
                  icon={MailX}
                  title="No vendors on this RFQ yet"
                  description="Invite vendors by e-mail to start collecting quotations."
                  action={isOpenStatus(header.status) && <Button onClick={() => setInviteOpen(true)}><Mail /> Invite vendors</Button>}
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {replies.map((r) => {
                    const answered = hasReplied(r.status)
                    const lead = Math.max(0, ...(r.lines ?? []).map((l) => l.leadTimeDays ?? 0))
                    const quoted = (r.lines ?? []).filter((l) => l.quoted).length
                    const isMin = answered && r.totalAmount !== undefined && r.totalAmount === stats.min && stats.replied > 1
                    return (
                      <div
                        key={r.rfqId}
                        className={cn(
                          "relative rounded-xl border bg-card p-4 shadow-xs transition-all",
                          selected.has(r.rfqId) && "border-primary ring-2 ring-primary/20",
                          !answered && "bg-muted/30",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <VendorAvatar name={r.vendorName} id={r.vendorAccount} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{r.vendorName}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.vendorAccount} · {r.rfqId}
                            </div>
                          </div>
                          {answered && (
                            <Checkbox checked={selected.has(r.rfqId)} onCheckedChange={() => toggle(r.rfqId)} aria-label={`Select ${r.vendorName} for comparison`} />
                          )}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <StatusBadge status={r.status} vendor />
                          {isMin && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Lowest total</span>}
                        </div>
                        {answered ? (
                          <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-xs">
                            <div>
                              <dt className="text-muted-foreground">Total</dt>
                              <dd className="text-sm font-semibold tabular">{formatMoney(r.totalAmount, r.currency || currency, { compact: true })}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Lead time</dt>
                              <dd className="text-sm font-semibold tabular">{lead ? `${lead}d` : "—"}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Lines</dt>
                              <dd className="text-sm font-semibold tabular">
                                {quoted}/{lines.length}
                              </dd>
                            </div>
                            <div className="col-span-3 text-muted-foreground">
                              Replied {timeAgo(r.replyDate)} · {r.paymentTerms ?? "—"} · {r.deliveryTerms ?? "—"}
                            </div>
                          </dl>
                        ) : (
                          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                            {r.status === "Created" ? "Not sent to vendor yet." : r.sentDate ? `Sent ${timeAgo(r.sentDate)} – waiting for reply.` : "Waiting for reply."}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="lines" className="mt-3">
              <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">#</th>
                      <th className="px-3 py-2.5 text-left font-medium">Item</th>
                      <th className="px-3 py-2.5 text-right font-medium">Quantity</th>
                      <th className="px-3 py-2.5 text-right font-medium">Target price</th>
                      <th className="px-3 py-2.5 text-right font-medium">Best quote</th>
                      <th className="px-4 py-2.5 text-left font-medium">Delivery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const prices = replies
                        .flatMap((r) => r.lines ?? [])
                        .filter((rl) => rl.lineNumber === l.lineNumber && rl.quoted && rl.unitPrice > 0)
                        .map((rl) => rl.unitPrice * (1 - rl.discountPct / 100))
                      const best = prices.length ? Math.min(...prices) : undefined
                      return (
                        <tr key={l.recordId} className="border-t">
                          <td className="px-4 py-3 tabular text-muted-foreground">{l.lineNumber}</td>
                          <td className="px-3 py-3">
                            <div className="font-medium">{l.itemName}</div>
                            <div className="font-mono text-xs text-muted-foreground">{l.itemNumber}</div>
                          </td>
                          <td className="px-3 py-3 text-right tabular">
                            {formatNumber(l.quantity)} <span className="text-muted-foreground">{l.unit}</span>
                          </td>
                          <td className="px-3 py-3 text-right tabular text-muted-foreground">{formatUnitPrice(l.targetUnitPrice, currency)}</td>
                          <td className={cn("px-3 py-3 text-right tabular", best !== undefined && l.targetUnitPrice && best <= l.targetUnitPrice && "text-emerald-600 dark:text-emerald-400")}>
                            {formatUnitPrice(best, currency)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(l.requestedDeliveryDate)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <SectionCard title="Reply progress">
            <div className="flex items-center gap-5">
              <div className="relative size-24 shrink-0">
                <svg viewBox="0 0 36 36" className="size-24 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" className="stroke-muted" strokeWidth="3.5" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    className="stroke-primary transition-all"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeDasharray={`${(progress / 100) * 97.4} 97.4`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-semibold tabular">{stats.replied}</span>
                  <span className="text-[10px] text-muted-foreground">of {stats.invited}</span>
                </div>
              </div>
              <ul className="space-y-1.5 text-sm">
                <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500" /> {stats.replied} replied</li>
                <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary/40" /> {stats.invited - stats.replied} awaiting</li>
                <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-muted-foreground/40" /> {stats.notSent} not sent</li>
              </ul>
            </div>
          </SectionCard>

          {stats.min !== undefined && (
            <SectionCard title="Quote range" description="Totals across replies received">
              <div className="space-y-3">
                {[
                  { label: "Lowest", value: stats.min, cls: "bg-emerald-500" },
                  { label: "Average", value: stats.avg, cls: "bg-primary" },
                  { label: "Highest", value: stats.max, cls: "bg-rose-500" },
                  ...(stats.target ? [{ label: "Target", value: stats.target, cls: "bg-muted-foreground/50" }] : []),
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-medium tabular">{formatMoney(row.value, currency)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", row.cls)} style={{ width: `${((row.value ?? 0) / Math.max(stats.max ?? 1, stats.target ?? 0)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard title="Invitation activity">
            {invitations.data?.length ? (
              <ol className="space-y-3">
                {invitations.data.slice(0, 10).map((inv) => (
                  <li key={inv.id} className="flex gap-3">
                    <span className={cn("mt-1 rounded-full p-1", inv.status === "sent" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600")}>
                      {inv.status === "sent" ? <Mail className="size-3" /> : <MailX className="size-3" />}
                    </span>
                    <div className="min-w-0 text-sm">
                      <div className="truncate font-medium">{inv.vendorName}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {inv.email} · {timeAgo(inv.sentAt)}
                        {inv.channel === "simulated" && " · simulated"}
                      </div>
                      {inv.error && <div className="text-xs text-rose-600">{inv.error}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No e-mail invitations sent from the app yet.</p>
            )}
          </SectionCard>
        </div>
      </div>

      <InviteDialog rfqCaseId={header.rfqCaseId} open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}
