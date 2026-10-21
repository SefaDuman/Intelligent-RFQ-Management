import type { RfqRepository } from "@/data/types"
import type { RfqCaseDetail } from "@/domain/types"
import { MicrosoftCopilotStudioService } from "@/generated/services/MicrosoftCopilotStudioService"
import { copilotResponseText } from "@/data/copilot-response"
import type { AgentExecutor } from "@/data/comparison-advisor"
import { buildInquirySnapshot, inquiryPrompt, parseInquiryAnswer, type InquiryAnswer, type InquirySnapshot } from "@/lib/rfq-inquiry"

export async function loadInquiryEvidence(repository: RfqRepository, company: string, caseId?: string, signal?: AbortSignal) {
  if (!company) throw new Error("Select a legal entity before asking.")
  const cases = await repository.listRfqCases(company)
  if (cases.some((rfq) => rfq.company.toLowerCase() !== company.toLowerCase())) throw new Error("RFQ data is outside the selected company.")
  const selected = caseId ? cases.filter((rfq) => rfq.rfqCaseId === caseId) : cases
  if (caseId && !selected.length) throw new Error("The selected RFQ is not accessible.")
  if (selected.length > 50) throw new Error("More than 50 RFQs are accessible. Select one RFQ to keep the assistant's evidence complete and bounded.")
  const details: RfqCaseDetail[] = []
  const errors: { caseId: string; message: string }[] = []
  for (let offset = 0; offset < selected.length; offset += 4) {
    signal?.throwIfAborted()
    await Promise.all(selected.slice(offset, offset + 4).map(async (rfq) => {
      try {
        const detail = await repository.getRfqCase(rfq.rfqCaseId, company)
        if (!detail || detail.header.company.toLowerCase() !== company.toLowerCase() || detail.header.rfqCaseId !== rfq.rfqCaseId) throw new Error("RFQ is unavailable or its company/case scope changed.")
        details.push(detail)
      } catch (cause) { errors.push({ caseId: rfq.rfqCaseId, message: cause instanceof Error ? cause.message : String(cause) }) }
    }))
  }
  signal?.throwIfAborted()
  if (selected.length && !details.length) throw new Error("None of the selected RFQs could be read. Check access and retry.")
  return { snapshot: buildInquirySnapshot(company, details, errors, selected.length), errors }
}

export async function askRfqAssistant(question: string, snapshot: InquirySnapshot, history: { question: string; answer: InquiryAnswer }[], execute: AgentExecutor = (agent, body) => MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(agent, body)) {
  const result = await execute("rfq_inquiryAssistant", { message: inquiryPrompt(question, snapshot, history), notificationUrl: "https://notificationurlplaceholder" })
  if (!result.success) throw new Error(result.error instanceof Error ? result.error.message : "Copilot Studio could not answer. Check the agent connection and permissions.")
  return parseInquiryAnswer(copilotResponseText(result.data), snapshot)
}
