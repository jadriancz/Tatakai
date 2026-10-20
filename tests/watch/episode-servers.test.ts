import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { collectOfferedSourceUrls, collectOfficialServerNames, mergeEpisodeServers } from '../../src/lib/watch/episodeServers.ts';

type Row = Record<string, unknown>;
const row = (serverName: string, extra: Row = {}): Row => ({ serverId: 0, serverName, ...extra });

const watchPageSource = readFileSync(
  new URL('../../src/pages/watch/WatchPage.tsx', import.meta.url),
  'utf8',
);

describe('episode server rows', () => {
  test('extension-resolved providers become selectable servers with no dispatch rows', () => {
    const rows = mergeEpisodeServers([], [
      row('k20-anime', { providerName: 'K20 - Anime', isProviderServer: true }),
      row('subflix', { providerName: 'Subflix', isProviderServer: true }),
    ]);
    expect(rows.map((server) => server.serverName)).toEqual(['k20-anime', 'subflix']);
  });

  test('one row per provider when it resolved several qualities', () => {
    const rows = mergeEpisodeServers([], [
      row('nebula', { providerName: 'Nebula', quality: '1080p' }),
      row('Nebula', { providerName: 'Nebula', quality: '720p' }),
      row('viddream', { providerName: 'VidDream', quality: '1080p' }),
    ]);
    expect(rows.map((server) => server.serverName)).toEqual(['nebula', 'viddream']);
  });

  test('the extension ranking outranks arrival order and unranked rows keep it', () => {
    const rows = mergeEpisodeServers([], [
      row('late', { providerPriority: undefined }),
      row('second', { providerPriority: 3 }),
      row('first', { providerPriority: 1 }),
      row('later', { providerPriority: undefined }),
    ]);
    expect(rows.map((server) => server.serverName)).toEqual(['first', 'second', 'late', 'later']);
  });

  test('dispatch rows come first when the extension ranks nothing', () => {
    const rows = mergeEpisodeServers([row('hd-1'), row('hd-2')], [row('k20-anime')]);
    expect(rows.map((server) => server.serverName)).toEqual(['hd-1', 'hd-2', 'k20-anime']);
  });

  test('rows without a name are dropped', () => {
    expect(mergeEpisodeServers([], [row('   '), row('ok')]).map((server) => server.serverName)).toEqual(['ok']);
  });

  test('extension rows are never counted as the app’s own servers', () => {
    const rows = mergeEpisodeServers([row('hd-1'), row('HD-2')], [
      row('animeheaven', { providerName: 'AnimeHeaven', isProviderServer: true }),
    ]);
    expect(collectOfficialServerNames(rows)).toEqual(['hd-1', 'hd-2']);
  });

  test('an empty server list yields no official names', () => {
    expect(collectOfficialServerNames([])).toEqual([]);
    expect(collectOfficialServerNames(null)).toEqual([]);
  });

  test('the provider-source counter only treats dispatch rows as official', () => {
    const start = watchPageSource.indexOf('const officialServerNameSet = useMemo(');
    expect(start).toBeGreaterThan(-1);
    expect(watchPageSource.slice(start, start + 260)).toContain('collectOfficialServerNames(');
  });

  test('the watch page builds its server list from the resolved extension servers', () => {
    const start = watchPageSource.indexOf('const availableServers = useMemo(');
    expect(start).toBeGreaterThan(-1);
    const block = watchPageSource.slice(start, start + 1200);
    expect(block).toContain('mergeEpisodeServers(');
    expect(block).toContain('providerServers');
  });

  test('a provider’s own server row claims the stream it plays', () => {
    const servers = [row('animeheaven', { isProviderServer: true })];
    const sources = [
      { server: 'animeheaven', providerName: 'AnimeHeaven', url: 'https://cdn/1080p.m3u8' },
      { server: 'animeheaven', providerName: 'AnimeHeaven', url: 'https://cdn/720p.m3u8' },
    ];
    expect([...collectOfferedSourceUrls(servers, sources)]).toEqual(['https://cdn/1080p.m3u8']);
  });

  test('dispatch rows claim nothing, so the language section keeps every provider stream', () => {
    const servers = [row('hd-1')];
    const sources = [{ server: 'animeheaven', providerName: 'AnimeHeaven', url: 'https://cdn/1080p.m3u8' }];
    expect(collectOfferedSourceUrls(servers, sources).size).toBe(0);
  });

  test('no sources means no claimed streams', () => {
    expect(collectOfferedSourceUrls([row('animeheaven', { isProviderServer: true })], []).size).toBe(0);
    expect(collectOfferedSourceUrls(null, null).size).toBe(0);
  });

  test('the language section skips the stream a provider row already offers', () => {
    const start = watchPageSource.indexOf('const isGroupableProviderSource = useCallback(');
    expect(start).toBeGreaterThan(-1);
    expect(watchPageSource.slice(start, start + 700)).toContain('serverOfferedSourceUrls');
  });
});
