import { MicrosoftCopilotStudioService } from "@/generated/services/MicrosoftCopilotStudioService"
import type { AgentExecutor } from "@/data/comparison-advisor"
import type { RfqRepository } from "@/data/types"
import { copilotResponseText } from "@/data/copilot-response"
import { buildQuoteExport, parseQuoteExtraction, quoteExtractionPrompt, type QuoteDocument } from "@/lib/quote-extraction"

export async function extractQuote(document: QuoteDocument, execute: AgentExecutor = (agent, body) => MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(agent, body)) {
  const result = await execute("rfq_quoteExtraction", { message: quoteExtractionPrompt(document), notificationUrl: "https://notificationurlplaceholder" })
  if (!result.success) throw new Error(result.error instanceof Error ? result.error.message : "Quote extraction failed. Check the published agent connection and permissions.")
  return parseQuoteExtraction(copilotResponseText(result.data), document)
}

export async function exportReviewedQuote(repository: RfqRepository, input: Parameters<typeof buildQuoteExport>[0]) {
  const current = await repository.getRfqCase(input.caseId, input.company)
  if (!current) throw new Error("The selected RFQ is no longer accessible. Nothing was exported.")
  return buildQuoteExport(input, current)
}
