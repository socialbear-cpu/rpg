// Model the active-account RPC while keeping real token verification and repositories.
export function withActiveAccount(fetch: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => new URL(String(input)).pathname === '/rest/v1/rpc/get_my_account_status'
    ? Response.json(true)
    : fetch(input, init);
}
