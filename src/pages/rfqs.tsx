import { useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowDownUp, FileStack, Mail, Scale, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState, ErrorState, PageHeader } from "@/components/app/page-parts"
import { DeadlinePill, StatusBadge } from "@/components/rfq/rfq-badges"
import { InviteDialog } from "@/components/rfq/invite-dialog"
import { useReplies, useRfqCases } from "@/hooks/use-rfq-data"
import { hasReplied, isOpenStatus, RFQ_STATUSES, type RfqReply } from "@/domain/types"
import { formatDate, formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"

type SortKey = "deadline" | "created" | "value" | "replies"

const STATUS_FILTERS = ["all", "open", ...RFQ_STATUSES] as const

export default function RfqListPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const cases = useRfqCases()
  const replies = useReplies()
  const [inviteFor, setInviteFor] = useState<string>()
  const [sort, setSort] = useState<SortKey>("deadline")

  const q = params.get("q") ?? ""
  const status = params.get("status") ?? "all"
  const category = params.get("category") ?? "all"

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (!value || value === "all") next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const repliesByCase = useMemo(() => {
    const map = new Map<string, RfqReply[]>()
    for (const r of replies.data ?? []) map.set(r.rfqCaseId, [...(map.get(r.rfqCaseId) ?? []), r])
    return map
  }, [replies.data])

  const categories = useMemo(
    () => [...new Set((cases.data ?? []).map((c) => c.procurementCategory).filter((c): c is string => !!c))].sort(),
    [cases.data],
  )

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (cases.data ?? [])
      .map((rfq) => {
        const rs = repliesByCase.get(rfq.rfqCaseId) ?? []
        const answered = rs.filter((r) => hasReplied(r.status))
        const totals = answered.map((r) => r.totalAmount).filter((t): t is number => !!t)
        return {
          rfq,
          invited: rs.filter((r) => r.status !== "Created").length,
          vendorCount: rs.length,
          replied: answered.length,
          bestQuote: totals.length ? Math.min(...totals) : undefined,
          vendors: rs.map((r) => r.vendorName),
        }
      })
      .filter(({ rfq, vendors }) => {
        if (status === "open" && !isOpenStatus(rfq.status)) return false
        if (status !== "all" && status !== "open" && rfq.status !== status) return false
        if (category !== "all" && rfq.procurementCategory !== category) return false
        if (!term) return true
        return [rfq.rfqCaseId, rfq.name, rfq.procurementCategory, rfq.requester, ...vendors].some((f) => f?.toLowerCase().includes(term))
      })
      .sort((a, b) => {
        switch (sort) {
          case "created":
            return (b.rfq.createdDate ?? "").localeCompare(a.rfq.createdDate ?? "")
          case "value":
            return (b.bestQuote ?? 0) - (a.bestQuote ?? 0)
          case "replies":
            return b.replied - a.replied
          default: {
            const aOpen = isOpenStatus(a.rfq.status) ? 0 : 1
            const bOpen = isOpenStatus(b.rfq.status) ? 0 : 1
            return aOpen - bOpen || (a.rfq.expiryDate ?? "9").localeCompare(b.rfq.expiryDate ?? "9")
          }
        }
      })
  }, [cases.data, repliesByCase, q, status, category, sort])

  if (cases.error || replies.error) return <ErrorState error={cases.error ?? replies.error} />

  const statusCount = (s: string) =>
    (cases.data ?? []).filter((c) => (s === "all" ? true : s === "open" ? isOpenStatus(c.status) : c.status === s)).length

  return (
    <div className="space-y-5">
      <PageHeader title="Requests for quotation" description="All RFQ cases from Dynamics 365 Supply Chain Management" />

      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setParam("status", s)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              status === s ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "all" ? "All" : s === "open" ? "Open" : s}
            <span className={cn("tabular rounded-full px-1.5 text-[10px]", status === s ? "bg-primary-foreground/20" : "bg-muted")}>{statusCount(s)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setParam("q", e.target.value)} placeholder="Search by RFQ, name, requester or vendor" className="pl-9" />
          {q && (
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-muted" onClick={() => setParam("q", "")} aria-label="Clear search">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Select value={category} onValueChange={(v) => setParam("category", v)}>
          <SelectTrigger className="md:w-52">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="md:w-48">
            <ArrowDownUp className="size-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="deadline">Deadline (soonest)</SelectItem>
            <SelectItem value="created">Newest first</SelectItem>
            <SelectItem value="value">Highest value</SelectItem>
            <SelectItem value="replies">Most replies</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground md:ml-auto">{rows.length} results</div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        {cases.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={FileStack} title="No RFQs match your filters" description="Try a different status, category or search term." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">RFQ case</th>
                  <th className="px-3 py-2.5 text-left font-medium">Category</th>
                  <th className="px-3 py-2.5 text-left font-medium">Requester</th>
                  <th className="px-3 py-2.5 text-left font-medium">Status</th>
                  <th className="px-3 py-2.5 text-left font-medium">Replies</th>
                  <th className="px-3 py-2.5 text-right font-medium">Best quote</th>
                  <th className="px-3 py-2.5 text-left font-medium">Created</th>
                  <th className="px-3 py-2.5 text-left font-medium">Deadline</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ rfq, invited, replied, bestQuote, vendorCount }) => (
                  <tr
                    key={rfq.rfqCaseId}
                    className="group cursor-pointer border-t hover:bg-muted/40"
                    onClick={() => navigate(`/rfqs/${encodeURIComponent(rfq.rfqCaseId)}`)}
                  >
                    <td className="max-w-[300px] px-5 py-3">
                      <div className="truncate font-medium group-hover:text-primary">{rfq.name}</div>
                      <div className="text-xs text-muted-foreground">{rfq.rfqCaseId}</div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{rfq.procurementCategory ?? "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{rfq.requester ?? "—"}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={rfq.status} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1" title={`${replied} of ${invited} invited vendors replied`}>
                        {Array.from({ length: Math.max(vendorCount, 1) }).map((_, i) => (
                          <span key={i} className={cn("h-2 w-3 rounded-sm", i < replied ? "bg-emerald-500" : i < invited ? "bg-primary/30" : "bg-muted")} />
                        ))}
                        <span className="ml-1 text-xs tabular text-muted-foreground">
                          {replied}/{invited}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular">{formatMoney(bestQuote, rfq.currency)}</td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDate(rfq.createdDate)}</td>
                    <td className="px-3 py-3">{isOpenStatus(rfq.status) ? <DeadlinePill date={rfq.expiryDate} /> : <span className="text-xs text-muted-foreground">{formatDate(rfq.expiryDate)}</span>}</td>
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {isOpenStatus(rfq.status) && (
                          <Button size="icon-sm" variant="ghost" title="Invite vendors" onClick={() => setInviteFor(rfq.rfqCaseId)}>
                            <Mail />
                          </Button>
                        )}
                        <Button size="icon-sm" variant="ghost" title="Compare replies" disabled={replied < 2} asChild={replied >= 2}>
                          {replied >= 2 ? (
                            <Link to={`/compare?rfq=${encodeURIComponent(rfq.rfqCaseId)}`}>
                              <Scale />
                            </Link>
                          ) : (
                            <Scale />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InviteDialog rfqCaseId={inviteFor} open={!!inviteFor} onOpenChange={(open) => !open && setInviteFor(undefined)} />
    </div>
  )
}
