import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { after, test } from "node:test"
import { createServer } from "vite"

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { "@": path.resolve("src") } },
  logLevel: "error",
})
after(() => server.close())
const { DataverseRepository } = await server.ssrLoadModule(path.resolve("src", "data", "dataverse", "dataverse-repository.ts"))
const { dataverseTables } = await server.ssrLoadModule(path.resolve("src", "config", "dataverse-schema.ts"))
const { buildDashboard } = await server.ssrLoadModule(path.resolve("src", "lib", "analytics.ts"))

const caseRow = (company, rfq, status) => ({
  mserp_vrmrequestforquotationheaderentityid: `${company}-${rfq}`,
  mserp_dataareaid: company,
  mserp_rfqcasenumber: "000083",
  mserp_rfqcasetitle: `${company} RFQ`,
  mserp_currencycode: "USD",
  mserp_highestrfqstatus: status,
})
const replyRow = (company, rfq, status) => ({
  ...caseRow(company, rfq, status),
  mserp_vrmrequestforquotationreplyheaderentityid: `${company}-${rfq}`,
  mserp_rfqnumber: rfq,
  mserp_vendoraccountnumber: "1001",
  mserp_replycurrencycode: "",
})
const lineRow = (company, rfq) => ({
  mserp_vrmrequestforquotationreplylineentityid: `${company}-${rfq}-1`,
  mserp_dataareaid: company,
  mserp_rfqnumber: rfq,
  mserp_rfqcaselinelinenumber: 1,
  mserp_linenumber: 99,
  mserp_replypurchasequantity: 10,
  mserp_replypurchaseprice: 900,
  mserp_replypurchasepricequantity: 10,
  mserp_replylinediscountpercentage: 0,
  mserp_lineamount: 900,
  mserp_isalternateproduct: 200000000,
})

function fixture() {
  const queries = []
  const service = (table, rows) => ({
    async getAll(options = {}) {
      queries.push({ table, ...options })
      const company = options.filter?.match(/mserp_dataareaid eq '([^']+)'/)?.[1]
      const filtered = rows.filter((row) =>
        (!company || row.mserp_dataareaid === company) &&
        (!options.filter?.includes("mserp_isalternateproduct eq") || row.mserp_isalternateproduct === 200000000),
      )
      return { success: true, data: filtered }
    },
  })
  const baseLine = {
    mserp_vrmrequestforquotationlineentityid: "case-line",
    mserp_dataareaid: "usrt",
    mserp_rfqcasenumber: "000083",
    mserp_rfqcaselinelinenumber: 1,
    mserp_requestedpurchasequantity: 10,
    mserp_requestedpurchaseprice: 1000,
    mserp_requestedpurchasepricequantity: 10,
  }
  const services = {
    rfqCase: service("header", [caseRow("usrt", "000039", 200000003), caseRow("usrt", "000040", 200000004), caseRow("usmf", "000039", 200000002)]),
    rfqCaseLine: service("caseLine", [baseLine, { ...baseLine, mserp_vrmrequestforquotationlineentityid: "duplicate-vendor-line" }]),
    rfqReply: service("reply", [replyRow("usrt", "000039", 200000003), replyRow("usrt", "000040", 200000004), replyRow("usmf", "000039", 200000002)]),
    rfqReplyLine: service("replyLine", [lineRow("usrt", "000039"), lineRow("usrt", "000040"), lineRow("usmf", "000039"), { ...lineRow("usrt", "000039"), mserp_isalternateproduct: 200000001 }]),
    vendor: service("vendor", [
      { mserp_dataareaid: "usrt", mserp_vendoraccountnumber: "1001", mserp_vendororganizationname: "USRT vendor" },
      { mserp_dataareaid: "usmf", mserp_vendoraccountnumber: "1001", mserp_vendororganizationname: "USMF vendor" },
    ]),
  }
  return { repository: new DataverseRepository(services), services, queries }
}

test("every mapped column exists in the generated Frontier metadata", async () => {
  for (const mapping of Object.values(dataverseTables)) {
    const entitySet = `${mapping.logicalName.slice(0, -1)}ies`
    const model = await readFile(path.resolve("src", "generated", "models", `${entitySet[0].toUpperCase()}${entitySet.slice(1)}Model.ts`), "utf8")
    for (const column of Object.values(mapping.columns).filter(Boolean)) {
      assert.ok(model.includes(`  ${column}`), `${mapping.logicalName}.${column} is missing`)
    }
  }
})

test("discovers accessible RFQ companies and rejects unscoped record queries", async () => {
  const { repository } = fixture()
  assert.deepEqual(await repository.listCompanies(), ["usmf", "usrt"])
  await assert.rejects(repository.listRfqCases(), /Select a legal entity/)
  await assert.rejects(repository.listReplies(), /Select a legal entity/)
  await assert.rejects(repository.listVendors(), /Select a legal entity/)
})

test("groups vendor headers, uses real F&O enum values and isolates identical RFQ numbers", async () => {
  const { repository } = fixture()
  const usrt = await repository.listRfqCases("usrt")
  assert.equal(usrt.length, 1)
  assert.equal(usrt[0].status, "Accepted")
  assert.equal(usrt[0].company, "USRT")
  const usmf = await repository.listRfqCases("usmf")
  assert.equal(usmf.length, 1)
  assert.equal(usmf[0].status, "Received")
  const replies = await repository.listReplies("usrt")
  assert.deepEqual(replies.map((reply) => reply.status), ["Rejected", "Accepted"])
  assert.ok(replies.every((reply) => reply.vendorName === "USRT vendor" && reply.currency === "USD"))
})

test("deduplicates requested lines, divides price by price quantity and excludes alternate bids", async () => {
  const { repository, queries } = fixture()
  const detail = await repository.getRfqCase("000083", "usrt")
  assert.equal(detail.lines.length, 1)
  assert.equal(detail.lines[0].targetUnitPrice, 100)
  assert.equal(detail.replies.length, 2)
  for (const reply of detail.replies) {
    assert.equal(reply.lines.length, 1)
    assert.equal(reply.lines[0].lineNumber, 1)
    assert.equal(reply.lines[0].unitPrice, 90)
    assert.equal(reply.totalAmount, 900)
  }
  for (const query of queries) {
    assert.match(query.filter, /mserp_dataareaid eq 'usrt'/, query.table)
  }
  const replyQuery = queries.find((query) => query.table === "replyLine")
  assert.match(replyQuery.filter, /^\(.*\) and mserp_dataareaid/)
  assert.match(replyQuery.filter, /mserp_isalternateproduct eq 200000000/)
})

test("reads subsequent pages and surfaces Dataverse failures and unknown statuses", async () => {
  const { repository, services } = fixture()
  services.rfqCase.getAll = async ({ skipToken }) => ({
    success: true,
    data: [caseRow("usrt", skipToken ? "000040" : "000039", 200000002)],
    skipToken: skipToken ? undefined : "page2",
  })
  assert.equal((await repository.listRfqCases("usrt")).length, 1)
  services.rfqCase.getAll = async () => ({ success: false, error: new Error("F&O access denied") })
  await assert.rejects(repository.listRfqCases("usrt"), /F&O access denied/)
  services.rfqCase.getAll = async () => ({ success: true, data: [caseRow("usrt", "000039", 200000099)] })
  await assert.rejects(repository.listRfqCases("usrt"), /Unknown RFQ status/)
})

test("response rate does not require an unavailable sent-date column", () => {
  const replies = ["Received", "Sent", "Declined"].map((status, index) => ({
    rfqId: String(index), rfqCaseId: "000083", vendorAccount: String(index), vendorName: String(index), status,
  }))
  assert.ok(Math.abs(buildDashboard([], replies).responseRate - 100 / 3) < 1e-10)
})
