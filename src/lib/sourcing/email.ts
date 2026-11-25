const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Wraps a plain-text message in a minimal HTML e-mail, addressed to one vendor. */
export function plainMessageHtml(message: string, vendorName: string, reference: string) {
  const paragraphs = escape(message)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;line-height:1.55">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("")
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;max-width:680px"><p style="margin:0 0 12px">Dear ${escape(vendorName)} team,</p>${paragraphs}<p style="font-size:11px;color:#9ca3af;margin-top:16px">Reference ${escape(reference)}</p></div>`
}
