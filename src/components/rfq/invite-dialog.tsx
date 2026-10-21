import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, AtSign, Check, Loader2, Mail, Plus, Search, Send, Sparkles, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useCurrentUser, useDataContext, useRfqCase, useSendInvites, useVendors } from "@/hooks/use-rfq-data"
import type { InviteRecipient } from "@/domain/types"
import { buildInviteHtml, defaultInviteMessage, defaultInviteSubject } from "@/lib/email-template"
import { VendorAvatar } from "./rfq-badges"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function InviteDialog({ rfqCaseId, open, onOpenChange }: { rfqCaseId?: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: detail, isLoading } = useRfqCase(open ? rfqCaseId : undefined)
  const { data: vendors = [], isLoading: vendorsLoading } = useVendors()
  const { data: user } = useCurrentUser()
  const { data: ctx } = useDataContext()
  const send = useSendInvites()

  const [step, setStep] = useState<"recipients" | "compose">("recipients")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState<InviteRecipient[]>([])
  const [extraEmail, setExtraEmail] = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [cc, setCc] = useState("")
  const [replyBy, setReplyBy] = useState("")
  const [includeLines, setIncludeLines] = useState(true)

  const invitedAccounts = useMemo(
    () => new Map((detail?.replies ?? []).map((r) => [r.vendorAccount, r.status])),
    [detail],
  )

  // Initialise the form once per dialog opening (not on background refetches).
  const initializedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!open) {
      initializedFor.current = null
      return
    }
    if (!detail || initializedFor.current === detail.header.rfqCaseId) return
    initializedFor.current = detail.header.rfqCaseId
    setStep("recipients")
    setSearch("")
    setExtra([])
    setExtraEmail("")
    setSubject(defaultInviteSubject(detail.header))
    setMessage(defaultInviteMessage(detail.header))
    setReplyBy(detail.header.expiryDate?.slice(0, 10) ?? "")
    setIncludeLines(true)
    setCc("")
    setSelected(new Set(detail.replies.filter((r) => r.status === "Created").map((r) => r.vendorAccount)))
  }, [open, detail])

  const category = detail?.header.procurementCategory
  const sortedVendors = useMemo(() => {
    const q = search.trim().toLowerCase()
    return vendors
      .filter((v) => !q || [v.name, v.accountNumber, v.email, v.vendorGroup].some((f) => f?.toLowerCase().includes(q)))
      .map((v) => ({ vendor: v, suggested: !!category && v.vendorGroup === category, status: invitedAccounts.get(v.accountNumber) }))
      .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.vendor.name.localeCompare(b.vendor.name))
  }, [vendors, search, category, invitedAccounts])

  const recipients: InviteRecipient[] = useMemo(
    () => [
      ...vendors
        .filter((v) => selected.has(v.accountNumber) && v.email)
        .map((v) => ({ vendorAccount: v.accountNumber, vendorName: v.name, email: v.email! })),
      ...extra,
    ],
    [vendors, selected, extra],
  )

  const toggle = (account: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(account)) next.delete(account)
      else next.add(account)
      return next
    })

  const addExtra = () => {
    const email = extraEmail.trim()
    if (!EMAIL_RE.test(email)) {
      toast.error("Enter a valid e-mail address")
      return
    }
    if (recipients.some((r) => r.email.toLowerCase() === email.toLowerCase())) return
    setExtra((prev) => [...prev, { vendorName: email.split("@")[1]?.split(".")[0] ?? email, email }])
    setExtraEmail("")
  }

  const templateInput = detail
    ? {
        rfq: detail.header,
        lines: detail.lines,
        message,
        includeLines,
        senderName: user?.fullName || "Procurement",
        replyBy: replyBy || undefined,
      }
    : undefined

  const previewHtml = useMemo(
    () =>
      templateInput
        ? buildInviteHtml(templateInput, recipients[0] ?? { vendorName: "Vendor", email: "vendor@example.com" })
        : "",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detail, message, includeLines, user, replyBy, recipients],
  )

  const onSend = async () => {
    if (!detail || !templateInput) return
    const results = await send.mutateAsync({
      rfqCaseId: detail.header.rfqCaseId,
      recipients,
      subject,
      cc: cc.trim() || undefined,
      sentBy: user?.fullName,
      buildBody: (r) => buildInviteHtml(templateInput, r),
    })
    const failed = results.filter((r) => !r.ok)
    if (failed.length === 0) {
      toast.success(`${results.length} invitation${results.length === 1 ? "" : "s"} sent`, {
        description: ctx?.email.channel === "simulated" ? "Simulated – connect Office 365 Outlook to deliver e-mails." : `RFQ ${detail.header.rfqCaseId}`,
      })
      onOpenChange(false)
    } else {
      toast.error(`${failed.length} of ${results.length} invitations failed`, { description: failed[0].error })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(56rem,calc(100%-2rem))]">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-primary/10 p-2 text-primary">
              <Mail className="size-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle>Invite vendors to quote</DialogTitle>
              <DialogDescription className="truncate">
                {detail ? `${detail.header.rfqCaseId} · ${detail.header.name}` : "Loading RFQ…"}
              </DialogDescription>
            </div>
          </div>
          <ol className="mt-4 flex items-center gap-2 text-xs font-medium">
            {(["recipients", "compose"] as const).map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                {i > 0 && <span className="h-px w-8 bg-border" />}
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[10px]",
                    step === s ? "bg-primary text-primary-foreground" : i === 0 && step === "compose" ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground",
                  )}
                >
                  {i === 0 && step === "compose" ? <Check className="size-3" /> : i + 1}
                </span>
                <span className={step === s ? "text-foreground" : "text-muted-foreground"}>{s === "recipients" ? "Select vendors" : "Compose & preview"}</span>
              </li>
            ))}
          </ol>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading || !detail ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : step === "recipients" ? (
            <div className="grid gap-0 md:grid-cols-[1fr_260px]">
              <div className="p-6 pt-4">
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendors by name, account or group" className="pl-9" />
                </div>
                <div className="space-y-1.5">
                  {vendorsLoading && <Skeleton className="h-12 w-full" />}
                  {sortedVendors.map(({ vendor, suggested, status }) => {
                    const checked = selected.has(vendor.accountNumber)
                    const disabled = !vendor.email
                    return (
                      <label
                        key={vendor.accountNumber}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors",
                          checked ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50",
                          disabled && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <Checkbox checked={checked} disabled={disabled} onCheckedChange={() => toggle(vendor.accountNumber)} />
                        <VendorAvatar name={vendor.name} id={vendor.accountNumber} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{vendor.name}</span>
                            {suggested && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
                                <Sparkles className="size-2.5" /> Category match
                              </span>
                            )}
                            {status && status !== "Created" && (
                              <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                                Already invited
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {vendor.accountNumber} · {vendor.email ?? "No e-mail on vendor record"}
                            {vendor.vendorGroup && ` · ${vendor.vendorGroup}`}
                          </div>
                        </div>
                        {vendor.rating !== undefined && <span className="text-xs tabular text-muted-foreground">★ {vendor.rating.toFixed(1)}</span>}
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="border-t bg-muted/30 p-6 pt-4 md:border-l md:border-t-0">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recipients ({recipients.length})</div>
                <div className="flex flex-wrap gap-1.5">
                  {recipients.length === 0 && <p className="text-xs text-muted-foreground">Select vendors or add an e-mail address.</p>}
                  {recipients.map((r) => (
                    <span key={r.email} className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background py-0.5 pl-2 pr-1 text-xs">
                      <span className="truncate">{r.vendorAccount ? r.vendorName : r.email}</span>
                      <button
                        type="button"
                        className="rounded-full p-0.5 hover:bg-muted"
                        onClick={() => (r.vendorAccount ? toggle(r.vendorAccount) : setExtra((prev) => prev.filter((x) => x.email !== r.email)))}
                        aria-label={`Remove ${r.email}`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <Label className="mt-5 mb-1.5 block text-xs">Add another contact</Label>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <AtSign className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={extraEmail}
                      onChange={(e) => setExtraEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExtra())}
                      placeholder="name@vendor.com"
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                  <Button size="icon-sm" variant="outline" onClick={addExtra} aria-label="Add recipient">
                    <Plus />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-0 md:grid-cols-2">
              <div className="space-y-4 p-6 pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-subject">Subject</Label>
                  <Input id="inv-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-replyby">Reply by</Label>
                    <Input id="inv-replyby" type="date" value={replyBy} onChange={(e) => setReplyBy(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-cc">Cc</Label>
                    <Input id="inv-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-message">Message</Label>
                  <Textarea id="inv-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={9} className="text-sm" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={includeLines} onCheckedChange={(v) => setIncludeLines(v === true)} />
                  Include RFQ lines ({detail.lines.length}) in the e-mail
                </label>
                <p className="text-xs text-muted-foreground">
                  Each vendor receives a personal e-mail
                  {ctx?.email.channel === "outlook" ? " sent from your Outlook mailbox." : ". Sending is simulated until the Office 365 Outlook connector is added."}
                </p>
              </div>
              <div className="border-t bg-muted/30 p-6 pt-4 md:border-l md:border-t-0">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview</div>
                <iframe title="E-mail preview" sandbox="" srcDoc={`<body style="margin:12px;background:#fff">${previewHtml}</body>`} className="h-[440px] w-full rounded-lg border bg-white" />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t bg-background px-6 py-3">
          {step === "compose" ? (
            <>
              <Button variant="ghost" onClick={() => setStep("recipients")}>
                <ArrowLeft /> Back
              </Button>
              <Button onClick={onSend} disabled={send.isPending || recipients.length === 0 || !subject.trim()}>
                {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                Send {recipients.length} invitation{recipients.length === 1 ? "" : "s"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep("compose")} disabled={recipients.length === 0 || !detail}>
                Next <ArrowRight />
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
