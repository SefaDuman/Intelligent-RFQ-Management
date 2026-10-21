/**
 * Runtime configuration. Values come from Vite env variables (.env / .env.local).
 *
 *   VITE_RFQ_DATA_MODE   auto | sample | dataverse   (default: dataverse)
 *   VITE_FNO_COMPANY     Legal entity (dataAreaId) to filter on, e.g. "usmf"
 *   VITE_FNO_URL         F&SC base URL used for "Open in F&SC" deep links
 */
export type DataMode = "auto" | "sample" | "dataverse"

const env = import.meta.env

function readMode(value: unknown): DataMode {
  return value === "sample" || value === "auto" ? value : "dataverse"
}

export const appConfig = {
  dataMode: readMode(env.VITE_RFQ_DATA_MODE),
  company: (env.VITE_FNO_COMPANY as string | undefined)?.trim() || undefined,
  fnoUrl: (env.VITE_FNO_URL as string | undefined)?.replace(/\/+$/, "") || undefined,
  /** Upper bound on rows fetched per query to keep virtual table calls fast. */
  maxRows: 500,
} as const

/** Deep link into the F&SC "All requests for quotation" form for a case. */
export function fnoRfqCaseUrl(company: string) {
  if (!appConfig.fnoUrl) return undefined
  return `${appConfig.fnoUrl}/?cmp=${encodeURIComponent(company)}&mi=PurchRFQCaseTableListPage`
}
