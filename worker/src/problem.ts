/** Builds an RFC 7807 problem document response. */
export const problemResponse = (status: number, title: string, detail?: string): Response =>
  new Response(JSON.stringify({ type: "about:blank", title, status, ...(detail ? { detail } : {}) }), {
    status,
    headers: { "content-type": "application/problem+json" },
  });

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
