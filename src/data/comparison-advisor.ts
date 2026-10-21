import { MicrosoftCopilotStudioService } from "@/generated/services/MicrosoftCopilotStudioService"
import { briefPrompt, parseBrief, type BriefSnapshot } from "@/lib/comparison-brief"
import { copilotResponseText } from "@/data/copilot-response"

export type AgentExecutor = (agent: string, body: Record<string, unknown>) => Promise<{ success: boolean; data: unknown; error?: unknown }>

export async function requestComparisonBrief(snapshot: BriefSnapshot, execute: AgentExecutor = (agent, body) => MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(agent, body)) {
  const result = await execute("rfq_comparisonAdvisor", {
    message: briefPrompt(snapshot),
    notificationUrl: "https://notificationurlplaceholder",
  })
  if (!result.success) throw new Error(result.error instanceof Error ? result.error.message : "Copilot Studio could not generate the brief. Check your agent connection and permissions.")
  return parseBrief(copilotResponseText(result.data), snapshot)
}
