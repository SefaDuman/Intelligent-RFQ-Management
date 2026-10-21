import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"
import {
  ArrowRight,
  BellRing,
  CircleDollarSign,
  ClipboardList,
  Hourglass,
  Mail,
  MailCheck,
  Scale,
  TimerReset,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { EmptyState, ErrorState, KpiCard, PageHeader, SectionCard } from "@/components/app/page-parts"
import { DeadlinePill, StatusBadge, VendorAvatar } from "@/components/rfq/rfq-badges"
import { STATUS_CHART_COLORS } from "@/lib/status-colors"
import { InviteDialog } from "@/components/rfq/invite-dialog"
import { HealthMonitor } from "@/components/rfq/health-monitor"
import { useCurrentUser, useInvitations, useReplies, useRfqCases } from "@/hooks/use-rfq-data"
import { buildDashboard } from "@/lib/analytics"
import { formatMoney, formatNumber, formatPct, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

const trendConfig = {
  created: { label: "RFQs created", color: "var(--chart-1)" },
  replies: { label: "Replies received", color: "var(--chart-2)" },
  awarded: { label: "Awarded", color: "var(--chart-3)" },
} satisfies ChartConfig

const categoryConfig = {
  awardedValue: { label: "Awarded", color: "var(--chart-1)" },
  quotedValue: { label: "Open (best quote)", color: "var(--chart-2)" },
} satisfies ChartConfig

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}

export default function OverviewPage() {
  const navigate = useNavigate()
  const cases = useRfqCases()
  const replies = useReplies()
  const invitations = useInvitations()
  const { data: user } = useCurrentUser()
  const [inviteFor, setInviteFor] = useState<string>()

  const loading = cases.isLoading || replies.isLoading
  const dash = useMemo(() => (cases.data && replies.data ? buildDashboard(cases.data, replies.data) : undefined), [cases.data, replies.data])
  const currency = dash?.currency ?? "USD"
  const totalCases = cases.data?.length ?? 0

  if (cases.error || replies.error) return <ErrorState error={cases.error ?? replies.error} />

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        title={`${greeting()}${user?.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}`}
        description="Here's where your sourcing events stand today."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/rfqs">
                <ClipboardList /> All RFQs
              </Link>
            </Button>
            <Button asChild>
              <Link to="/compare">
                <Scale /> Compare replies
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Open RFQs" value={formatNumber(dash?.openCount)} hint={`${totalCases} RFQ cases in selected company`} icon={ClipboardList} loading={loading} onClick={() => navigate("/rfqs?status=open")} />
        <KpiCard label="Awaiting replies" value={formatNumber(dash?.awaitingReplyCount)} hint="Open RFQs with outstanding vendors" icon={Hourglass} accent="sky" loading={loading} onClick={() => navigate("/rfqs?status=Sent")} />
        <KpiCard label="Ready to compare" value={formatNumber(dash?.readyToCompareCount)} hint="2 or more replies received" icon={Scale} accent="violet" loading={loading} onClick={() => navigate("/compare")} />
        <KpiCard
          label="Due in 7 days"
          value={formatNumber(dash?.expiringSoonCount)}
          hint={dash?.overdueCount ? `${dash.overdueCount} past reply deadline` : "No overdue RFQs"}
          icon={BellRing}
          accent={dash?.overdueCount ? "rose" : "amber"}
          loading={loading}
        />
        <KpiCard
          label="Vendor response rate"
          value={formatPct(dash?.responseRate)}
          hint={dash?.avgResponseDays !== undefined ? `Avg. ${dash.avgResponseDays.toFixed(1)} days to reply` : undefined}
          icon={MailCheck}
          accent="emerald"
          loading={loading}
        />
        <KpiCard
          label="Open quoted value"
          value={formatMoney(dash?.openBestQuoteValue, currency, { compact: true })}
          hint={dash ? `${formatMoney(dash.potentialSavings, currency, { compact: true })} spread vs. avg. quote` : undefined}
          icon={CircleDollarSign}
          accent="primary"
          loading={loading}
        />
      </div>

      <HealthMonitor />

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Open RFQ pipeline"
          description="Reply progress and deadlines for every open request"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/rfqs?status=open">
                View all <ArrowRight />
              </Link>
            </Button>
          }
          contentClassName="p-0 pt-2"
        >
          {loading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : dash && dash.pipeline.length ? (
            <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-5 py-2 text-left font-medium">RFQ</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Replies</th>
                    <th className="px-3 py-2 text-right font-medium">Best quote</th>
                    <th className="px-3 py-2 text-left font-medium">Deadline</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {dash.pipeline.map((p) => {
                    const pct = p.invited ? (p.replied / p.invited) * 100 : 0
                    return (
                      <tr key={p.rfq.rfqCaseId} className="group border-b last:border-0 hover:bg-muted/40">
                        <td className="max-w-[260px] px-5 py-2.5">
                          <Link to={`/rfqs/${encodeURIComponent(p.rfq.rfqCaseId)}`} className="block truncate font-medium hover:text-primary">
                            {p.rfq.name}
                          </Link>
                          <div className="truncate text-xs text-muted-foreground">
                            {p.rfq.rfqCaseId} · {p.rfq.procurementCategory ?? "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={p.rfq.status} />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                              <div className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs tabular text-muted-foreground">
                              {p.replied}/{p.invited}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular">{formatMoney(p.bestQuote, p.rfq.currency, { compact: true })}</td>
                        <td className="px-3 py-2.5">
                          <DeadlinePill date={p.rfq.expiryDate} />
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          <div className="flex justify-end gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                            <Button size="icon-sm" variant="ghost" title="Invite vendors" onClick={() => setInviteFor(p.rfq.rfqCaseId)}>
                              <Mail />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              title="Compare replies"
                              disabled={p.replied < 2}
                              onClick={() => navigate(`/compare?rfq=${encodeURIComponent(p.rfq.rfqCaseId)}`)}
                            >
                              <Scale />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState icon={ClipboardList} title="No open RFQs" description="New requests for quotation from F&SC will appear here." />
            </div>
          )}
        </SectionCard>

        <SectionCard title="Status mix" description="All RFQ cases by highest status">
          {loading || !dash ? (
            <Skeleton className="mx-auto size-48 rounded-full" />
          ) : (
            <div>
              <div className="relative">
                <ChartContainer config={{}} className="mx-auto aspect-square h-52">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="status" hideLabel />} />
                    <Pie data={dash.statusBreakdown} dataKey="count" nameKey="status" innerRadius={62} outerRadius={92} paddingAngle={2} strokeWidth={0}>
                      {dash.statusBreakdown.map((s) => (
                        <Cell key={s.status} fill={STATUS_CHART_COLORS[s.status]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-semibold tabular">{totalCases}</span>
                  <span className="text-xs text-muted-foreground">RFQ cases</span>
                </div>
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {dash.statusBreakdown.map((s) => (
                  <li key={s.status} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-sm" style={{ background: STATUS_CHART_COLORS[s.status] }} />
                      {s.status}
                    </span>
                    <span className="tabular text-muted-foreground">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2" title="Sourcing activity" description="RFQs created, vendor replies and awards over the last 6 months">
          {loading || !dash ? (
            <Skeleton className="h-64" />
          ) : (
            <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full">
              <AreaChart data={dash.monthly} margin={{ left: -16, right: 8, top: 8 }}>
                <defs>
                  {Object.keys(trendConfig).map((key) => (
                    <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area type="monotone" dataKey="replies" stroke="var(--color-replies)" fill="url(#fill-replies)" strokeWidth={2} />
                <Area type="monotone" dataKey="created" stroke="var(--color-created)" fill="url(#fill-created)" strokeWidth={2} />
                <Area type="monotone" dataKey="awarded" stroke="var(--color-awarded)" fill="url(#fill-awarded)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          )}
        </SectionCard>

        <SectionCard title="Upcoming deadlines" description="Open RFQs closing within 10 days">
          {loading || !dash ? (
            <Skeleton className="h-64" />
          ) : dash.deadlines.length === 0 ? (
            <EmptyState icon={TimerReset} title="Nothing due soon" description="No open RFQ closes in the next 10 days." />
          ) : (
            <ul className="space-y-2">
              {dash.deadlines.map((p) => (
                <li key={p.rfq.rfqCaseId}>
                  <Link
                    to={`/rfqs/${encodeURIComponent(p.rfq.rfqCaseId)}`}
                    className="flex items-center gap-3 rounded-lg border p-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="flex w-11 shrink-0 flex-col items-center rounded-md bg-muted py-1">
                      <span className="text-[10px] font-medium uppercase text-muted-foreground">
                        {new Date(p.rfq.expiryDate!).toLocaleDateString(undefined, { month: "short" })}
                      </span>
                      <span className="text-base font-semibold leading-none tabular">{new Date(p.rfq.expiryDate!).getDate()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.rfq.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.replied}/{p.invited} replies · {p.rfq.rfqCaseId}
                      </div>
                    </div>
                    <DeadlinePill date={p.rfq.expiryDate} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Vendor responsiveness" description="Response rate and speed across all invitations">
          {loading || !dash ? (
            <Skeleton className="h-72" />
          ) : (
            <ul className="space-y-3">
              {dash.vendors.slice(0, 7).map((v) => (
                <li key={v.vendorAccount} className="flex items-center gap-3">
                  <VendorAvatar name={v.vendorName} id={v.vendorAccount} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{v.vendorName}</span>
                      <span className="text-xs tabular font-medium">{formatPct(v.responseRate)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", v.responseRate >= 85 ? "bg-emerald-500" : v.responseRate >= 65 ? "bg-primary" : "bg-amber-500")}
                        style={{ width: `${v.responseRate}%` }}
                      />
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {v.replied}/{v.invited} replied
                      {v.avgResponseDays !== undefined && ` · ${v.avgResponseDays.toFixed(1)}d avg`}
                      {v.wins > 0 && ` · ${v.wins} won`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Value by category" description="Awarded value and best open quotes">
          {loading || !dash ? (
            <Skeleton className="h-72" />
          ) : (
            <ChartContainer config={categoryConfig} className="aspect-auto h-72 w-full">
              <BarChart data={dash.categories} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })} />
                <YAxis type="category" dataKey="category" tickLine={false} axisLine={false} width={92} />
                <ChartTooltip
                  content={<ChartTooltipContent formatter={(value, name) => (
                    <div className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">{categoryConfig[name as keyof typeof categoryConfig]?.label ?? name}</span>
                      <span className="font-mono font-medium">{formatMoney(Number(value), currency, { compact: true })}</span>
                    </div>
                  )} />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="awardedValue" stackId="v" fill="var(--color-awardedValue)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="quotedValue" stackId="v" fill="var(--color-quotedValue)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </SectionCard>

        <SectionCard title="Recent invitations" description="E-mails sent to vendors from this app">
          {invitations.isLoading ? (
            <Skeleton className="h-72" />
          ) : !invitations.data?.length ? (
            <EmptyState icon={Mail} title="No invitations yet" description="Invite vendors from an RFQ to see activity here." />
          ) : (
            <ol className="relative max-h-72 space-y-3 overflow-y-auto pl-4 scrollbar-thin before:absolute before:left-1 before:top-1 before:h-[calc(100%-8px)] before:w-px before:bg-border">
              {invitations.data.slice(0, 12).map((inv) => (
                <li key={inv.id} className="relative">
                  <span className={cn("absolute -left-[15px] top-1.5 size-2 rounded-full ring-2 ring-card", inv.status === "sent" ? "bg-emerald-500" : "bg-rose-500")} />
                  <div className="text-sm">
                    <span className="font-medium">{inv.vendorName}</span>
                    <span className="text-muted-foreground"> · </span>
                    <Link to={`/rfqs/${encodeURIComponent(inv.rfqCaseId)}`} className="text-primary hover:underline">
                      {inv.rfqCaseId}
                    </Link>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {timeAgo(inv.sentAt)}
                    {inv.sentBy && ` · by ${inv.sentBy}`}
                    {inv.status === "failed" && <span className="text-rose-600"> · failed</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>

      <InviteDialog rfqCaseId={inviteFor} open={!!inviteFor} onOpenChange={(open) => !open && setInviteFor(undefined)} />
    </div>
  )
}
