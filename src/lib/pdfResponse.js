// A PDF as a response: inline, so it opens in the browser ready to print
// or save, with a file name that says what and when.
export function pdfResponse(buffer, filename) {
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "-")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export function badRange(message) {
  return new Response(`${message}\n`, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
