// Shared by the tests: a fetch stand-in that records calls.

export type Call = { method: string; url: string; body?: string; auth?: string; accept?: string };

/** Fake fetch: records calls and tracks how many are in flight at once. */
export function fakeFetch(respond: (c: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  let active = 0;
  let maxActive = 0;
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = {
      method: init?.method ?? 'GET',
      url: input instanceof Request ? input.url : input.toString(),
      body: init?.body as string | undefined,
      auth: headers.Authorization,
      accept: headers.Accept,
    };
    calls.push(call);
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    const { status, body } = respond(call);
    const text = body === undefined ? '' : JSON.stringify(body);
    return new Response(status === 204 ? null : text, { status });
  }) as typeof globalThis.fetch;
  return { fetch, calls, maxActive: () => maxActive };
}

export const path = (url: string) => url.replace(/^https?:\/\/[^/]+\//, '');
