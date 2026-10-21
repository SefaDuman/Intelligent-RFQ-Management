import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { formatISO } from "date-fns"
import { getDataContext } from "@/data"
import type { SendResult } from "@/data/types"
import type { Invitation, InviteRequest } from "@/domain/types"
import { useCompany } from "./use-company"

export const queryKeys = {
  context: ["data-context"] as const,
  cases: ["rfq-cases"] as const,
  replies: ["rfq-replies"] as const,
  case: (id: string) => ["rfq-case", id] as const,
  vendors: ["vendors"] as const,
  invitations: (id?: string) => ["invitations", id ?? "all"] as const,
  user: ["current-user"] as const,
}

export function useDataContext() {
  return useQuery({ queryKey: queryKeys.context, queryFn: getDataContext, staleTime: Infinity })
}

export function useRfqCases() {
  const { company } = useCompany()
  return useQuery({ queryKey: [...queryKeys.cases, company], queryFn: async () => (await getDataContext()).repository.listRfqCases(company), enabled: !!company })
}

export function useReplies() {
  const { company } = useCompany()
  return useQuery({ queryKey: [...queryKeys.replies, company], queryFn: async () => (await getDataContext()).repository.listReplies(company), enabled: !!company })
}

export function useRfqCase(rfqCaseId: string | undefined) {
  const { company } = useCompany()
  return useQuery({
    queryKey: [...queryKeys.case(rfqCaseId ?? ""), company],
    queryFn: async () => (await getDataContext()).repository.getRfqCase(rfqCaseId!, company),
    enabled: !!rfqCaseId && !!company,
  })
}

export function useVendors() {
  const { company } = useCompany()
  return useQuery({ queryKey: [...queryKeys.vendors, company], queryFn: async () => (await getDataContext()).repository.listVendors(company), enabled: !!company })
}

export function useCompanies() {
  return useQuery({ queryKey: ["legal-entities"], queryFn: async () => (await getDataContext()).repository.listCompanies() })
}

export function useInvitations(rfqCaseId?: string) {
  const { company } = useCompany()
  return useQuery({
    queryKey: [...queryKeys.invitations(rfqCaseId), company],
    queryFn: async () => {
      const ctx = await getDataContext()
      return (await ctx.invitations.list(rfqCaseId)).filter((invitation) =>
        invitation.company === company || (!invitation.company && ctx.repository.kind === "sample"),
      )
    },
    enabled: !!company,
  })
}

export function useCurrentUser() {
  return useQuery({ queryKey: queryKeys.user, queryFn: async () => (await getDataContext()).getCurrentUser(), staleTime: Infinity })
}

/** Sends one personalised e-mail per recipient and logs the invitation. */
export function useSendInvites() {
  const queryClient = useQueryClient()
  const { company } = useCompany()
  return useMutation({
    mutationFn: async (request: InviteRequest): Promise<SendResult[]> => {
      const ctx = await getDataContext()
      if (!company) throw new Error("Select a legal entity before inviting vendors.")
      const results: SendResult[] = []
      const log: Invitation[] = []
      for (const recipient of request.recipients) {
        let error: string | undefined
        try {
          await ctx.email.send({ to: recipient.email, subject: request.subject, html: request.buildBody(recipient), cc: request.cc })
        } catch (e) {
          error = e instanceof Error ? e.message : String(e)
        }
        results.push({ recipient: recipient.email, ok: !error, error })
        log.push({
          id: crypto.randomUUID(),
          company,
          rfqCaseId: request.rfqCaseId,
          vendorAccount: recipient.vendorAccount,
          vendorName: recipient.vendorName,
          email: recipient.email,
          subject: request.subject,
          sentAt: formatISO(new Date()),
          sentBy: request.sentBy,
          channel: ctx.email.channel,
          status: error ? "failed" : "sent",
          error,
        })
      }
      await ctx.invitations.add(log)
      const delivered = request.recipients.filter((r) => results.find((x) => x.recipient === r.email)?.ok)
      ctx.repository.markInvited?.(request.rfqCaseId, delivered)
      return results
    },
    onSuccess: (_results, request) => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] })
      queryClient.invalidateQueries({ queryKey: queryKeys.case(request.rfqCaseId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.cases })
      queryClient.invalidateQueries({ queryKey: queryKeys.replies })
    },
  })
}
