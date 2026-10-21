import { useState, type FormEvent } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import { Bot, Database, FileSearch, FileStack, FlaskConical, LayoutDashboard, MailCheck, Scale, Search, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { ModeToggle } from "@/components/mode-toggle"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState, ErrorState } from "./page-parts"
import { useIsMutating } from "@tanstack/react-query"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useCompanies, useCurrentUser, useDataContext } from "@/hooks/use-rfq-data"
import { useCompany } from "@/hooks/use-company"
import { initials } from "@/lib/format"

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/rfqs", label: "Requests for quotation", icon: FileStack },
  { to: "/compare", label: "Compare replies", icon: Scale },
  { to: "/assistant", label: "RFQ assistant", icon: Bot },
  { to: "/follow-up", label: "Vendor follow-up", icon: MailCheck },
  { to: "/quote-extraction", label: "Quote extraction", icon: FileSearch },
]

function DataSourceBadge({ compact }: { compact?: boolean }) {
  const { data, isLoading } = useDataContext()
  const { company } = useCompany()
  const live = data?.repository.kind === "dataverse"
  const Icon = live ? Database : FlaskConical
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
            live ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
          )}
        >
          <span className={cn("size-1.5 rounded-full", isLoading ? "animate-pulse bg-muted-foreground" : live ? "bg-emerald-500" : "bg-amber-500")} />
          <Icon className="size-3.5" />
          {!compact && <span>{isLoading ? "Connecting…" : live ? `Live · F&SC${company ? ` · ${company.toUpperCase()}` : ""}` : "Sample data"}</span>}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <ul className="space-y-1">
          {(data?.diagnostics ?? ["Detecting data sources…"]).map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

export default function AppShell() {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const { data: user } = useCurrentUser()
  const companies = useCompanies()
  const { company, setCompany } = useCompany()
  const sending = useIsMutating() > 0
  const companyAvailable = !!company && !!companies.data?.includes(company)

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    navigate(`/rfqs${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`)
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-dvh bg-background">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar/80 backdrop-blur lg:flex">
          <div className="flex h-16 items-center gap-2.5 px-5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-500/30">
              <Sparkles className="size-4.5" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Intelligent RFQ</div>
              <div className="text-[11px] text-muted-foreground">Dynamics 365 SCM</div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            <div className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Workspace</div>
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="space-y-3 border-t p-4">
            <DataSourceBadge />
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">{initials(user?.fullName || "Procurement User")}</span>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-medium">{user ? user.fullName || "Procurement user" : "…"}</div>
                <div className="truncate text-[11px] text-muted-foreground">{user?.email ?? "Procurement"}</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur md:px-8 lg:h-16 lg:flex-nowrap lg:py-0">
            <nav className="flex w-full flex-wrap items-center gap-1 lg:hidden">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  title={label}
                  className={({ isActive }) => cn("rounded-md p-2", isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                >
                  <Icon className="size-4" />
                </NavLink>
              ))}
            </nav>
            <form onSubmit={onSearch} className="relative min-w-0 max-w-md flex-[1_1_12rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search RFQs, items, vendors…"
                className="h-9 rounded-full bg-muted/60 pl-9 border-transparent focus-visible:bg-background"
              />
            </form>
            <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
              <Select
                value={company}
                disabled={companies.isLoading || sending}
                onValueChange={(value) => {
                  setCompany(value)
                  navigate("/")
                }}
              >
                <SelectTrigger className="w-36" aria-label="Legal entity">
                  <SelectValue placeholder={companies.isLoading ? "Loading..." : "Legal entity"} />
                </SelectTrigger>
                <SelectContent>
                  {(companies.data ?? []).map((value) => (
                    <SelectItem key={value} value={value}>{value.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="lg:hidden">
                <DataSourceBadge compact />
              </div>
              <ModeToggle />
            </div>
          </header>
          <main className="flex-1 px-4 py-6 md:px-8">
            <div className="mx-auto w-full max-w-[1500px]">
              {companies.error ? <ErrorState error={companies.error} /> : companyAvailable ? (
                <Outlet key={company} />
              ) : (
                <EmptyState
                  icon={Database}
                  title={companies.isLoading ? "Loading legal entities" : "Select a legal entity"}
                  description={companies.isLoading ? "Reading the connected F&O virtual tables." : companies.data?.length ? "Use the legal-entity selector above to load RFQs, replies and vendors for one company." : "No RFQs are available through the connected virtual entities for your account."}
                />
              )}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
