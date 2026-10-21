export function copilotResponseText(data: unknown): string {
  if (!data || typeof data !== "object" || Reflect.get(data, "isExpectingInput") === true) {
    throw new Error("The agent did not complete its answer. Check the published agent and try again.")
  }
  const responses: unknown = Reflect.get(data, "responses")
  const lastResponse: unknown = Reflect.get(data, "lastResponse")
  const text: unknown = typeof lastResponse === "string" && lastResponse.trim()
    ? lastResponse
    : Array.isArray(responses) ? responses.at(-1) : undefined
  if (typeof text !== "string" || !text.trim() || text.length > 40000) throw new Error("The agent returned an empty or oversized answer.")
  return text
}
