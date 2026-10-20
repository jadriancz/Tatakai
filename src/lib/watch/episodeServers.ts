import type { EpisodeServer } from "@/types/anime";
import { selectSourceForServer, sortServersByHealth } from "./sourceIntelligence";

/**
 * Server rows for the watch page, from every source that produced them.
 *
 * `dispatchServers` are the abstract rows the central dispatcher used to name
 * (`hd-1`, `hd-2`, …). `extensionServers` are the rows derived from what the
 * installed extensions actually resolved — one per concrete provider, stamped by
 * `mapRawSourcesToStreamingData`. Either list can be empty, and today usually is:
 * central dispatch is retired, so the extension rows are all there is.
 */
export function mergeEpisodeServers(
  dispatchServers: EpisodeServer[] | undefined | null,
  extensionServers: EpisodeServer[] | undefined | null,
): EpisodeServer[] {
  const rows = [...(dispatchServers || []), ...(extensionServers || [])];

  const deduped = rows.filter((server, index, array) => {
    const normalized = String(server?.serverName || "").trim().toLowerCase();
    if (!normalized) return false;
    return index === array.findIndex((candidate) => String(candidate?.serverName || "").trim().toLowerCase() === normalized);
  });

  /**
   * Server order is the extension's decision, not the app's.
   *
   * `providerPriority` is the rank the extension stamps on every source from its
   * own provider registry (`providerPriorityOf` in
   * `extension/toko/src/providers/registry.ts`) and the host relays it untouched.
   * Sorting on it here is not a second policy — the numbers are the extension's,
   * this only re-applies them after the dedupe above loses the array order.
   * Stable within a rank so a provider's own quality/seeder ranking survives, and
   * unranked rows keep their relative order at the end.
   */
  return sortServersByHealth(deduped)
    .map((server, idx) => ({ server, idx }))
    .sort((a, b) => {
      const pa = Number.isFinite(a.server?.providerPriority) ? Number(a.server.providerPriority) : Number.MAX_SAFE_INTEGER;
      const pb = Number.isFinite(b.server?.providerPriority) ? Number(b.server.providerPriority) : Number.MAX_SAFE_INTEGER;
      return pa === pb ? a.idx - b.idx : pa - pb;
    })
    .map(({ server }) => server);
}

/**
 * Names of the app's own servers, for the "official vs extension" split the watch
 * page uses to count extension sources.
 *
 * Provider rows must stay out of this set: they are the extension's servers, and
 * matching them as official would make every extension source look official and
 * blank the provider-source counter beside the "Servidor" header.
 */
export function collectOfficialServerNames(servers: EpisodeServer[] | undefined | null): string[] {
  return (servers || [])
    .filter((server) => !server?.isProviderServer)
    .map((server) => String(server?.serverName || "").trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The exact stream each provider row in the server list plays.
 *
 * A provider row resolves to `selectSourceForServer`'s pick, so the watch page
 * must not offer that URL a second time under its language: the two buttons would
 * be one source. The provider's *other* language variants stay in the language
 * section, because there they are the only way to reach them.
 */
export function collectOfferedSourceUrls(
  servers: EpisodeServer[] | undefined | null,
  sources: Array<Record<string, any>> | undefined | null,
  category?: string,
): Set<string> {
  const pool = sources || [];
  const urls = new Set<string>();
  if (!pool.length) return urls;

  for (const server of servers || []) {
    if (!server?.isProviderServer) continue;
    const offered = selectSourceForServer(pool, server.serverName, category);
    if (offered?.url) urls.add(String(offered.url));
  }
  return urls;
}
