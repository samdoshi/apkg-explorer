// Browser storage the app is allowed to leave behind after its main flows.
// Every entry must have a matching approval recorded in AGENTS.md.
// Nothing is approved yet, so everything must stay empty.
export const approvedStorage = {
  cookies: [] as string[],
  localStorage: [] as string[],
  sessionStorage: [] as string[],
  indexedDB: [] as string[],
  cacheStorage: [] as string[],
}
