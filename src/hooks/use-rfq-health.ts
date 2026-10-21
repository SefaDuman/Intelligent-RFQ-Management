import { useQuery } from "@tanstack/react-query"
import { getDataContext } from "@/data"
import { isOpenStatus, type RfqCaseDetail } from "@/domain/types"
import { useCompany } from "@/hooks/use-company"
import type { RfqRepository } from "@/data/types"

export interface HealthScan {
  details: RfqCaseDetail[]
  errors: { caseId: string; message: string }[]
  total: number
  checkedAt: string
}

export async function scanOpenRfqs(repository: RfqRepository, company: string, signal?: AbortSignal): Promise<HealthScan> {
  if (!company) throw new Error("Select a legal entity before scanning RFQs.")
  const cases = (await repository.listRfqCases(company)).filter((rfq) => isOpenStatus(rfq.status))
  if (cases.some((rfq) => rfq.company.toLowerCase() !== company.toLowerCase())) throw new Error("RFQ list contains records outside the selected legal entity.")
  const scan: HealthScan = { details: [], errors: [], total: cases.length, checkedAt: "" }
  // Bound virtual-table traffic to four concurrent case-detail requests.
  for (let offset = 0; offset < cases.length; offset += 4) {
    signal?.throwIfAborted()
    await Promise.all(cases.slice(offset, offset + 4).map(async (rfq) => {
      try {
        const detail = await repository.getRfqCase(rfq.rfqCaseId, company)
        if (!detail) throw new Error("RFQ was not found or is no longer accessible.")
        if (detail.header.company.toLowerCase() !== company.toLowerCase() || detail.header.rfqCaseId !== rfq.rfqCaseId) {
          throw new Error("RFQ scope did not match the requested legal entity and case.")
        }
        scan.details.push(detail)
      } catch (cause) {
        scan.errors.push({ caseId: rfq.rfqCaseId, message: cause instanceof Error ? cause.message : String(cause) })
      }
    }))
  }
  signal?.throwIfAborted()
  scan.checkedAt = new Date().toISOString()
  return scan
}

export function useRfqHealth() {
  const { company } = useCompany()
  return useQuery({
    queryKey: ["rfq-health", company],
    enabled: !!company,
    staleTime: 0,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async ({ signal }): Promise<HealthScan> => {
      if (!company) throw new Error("Select a legal entity before scanning RFQs.")
      const { repository } = await getDataContext()
      return scanOpenRfqs(repository, company, signal)
    },
  })
}
