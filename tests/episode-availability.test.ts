import { describe, expect, test } from 'bun:test';
import { applyEpisodeAvailability, availableDownloadEpisodes, episodeAirTime, fallbackEpisodeCount } from '../src/lib/episodeAvailability';

const now = Date.parse('2026-10-11T12:00:00Z');

const SOURCE_TIMESTAMP = now;
const HOUR = (offsetSeconds: number) => Math.floor(SOURCE_TIMESTAMP / 1000) + offsetSeconds;

describe('episode availability', () => {
  test('download selection excludes future placeholders while keeping released episodes', () => {
    const episodes = [
      { number: 1, episodeId: 'one', hasAired: true },
      { number: 2, episodeId: 'two', airDateUtc: '2026-10-10T12:00:00Z' },
      { number: 3, episodeId: 'three', airDateUtc: '2026-10-17T12:00:00Z' },
      { number: 4, episodeId: 'four', hasAired: true },
    ];
    expect(availableDownloadEpisodes(episodes, now).map(row => row.episodeId)).toEqual(['one', 'two']);
    expect(availableDownloadEpisodes([], now)).toEqual([]);
  });
  test('Episode 4 without a date stays upcoming when Episode 3 has not aired', () => {
    const episodes = [
      { number: 1, hasAired: true, airDateUtc: '2026-10-03T12:00:00Z' },
      { number: 2, hasAired: true, airDateUtc: '2026-10-10T12:00:00Z' },
      { number: 3, hasAired: false, airDateUtc: '2026-10-17T12:00:00Z' },
      { number: 4, hasAired: true },
      { number: 5 },
    ];
    const result = applyEpisodeAvailability(episodes, undefined, now);
    expect(result.map(episode => episode.hasAired)).toEqual([true, true, false, false, false]);
    expect(result[3].airDateUtc).toBeUndefined(); // Do not invent a date.
    expect(episodes[3].hasAired).toBe(true); // Cached source stays intact.
  });
  test('date-only and invalid UTC metadata cannot incorrectly unlock a future episode', () => {
    expect(episodeAirTime({ airDateUtc: 'invalid', airDate: '2026-10-17' })).toBe(Date.parse('2026-10-17'));
    const result = applyEpisodeAvailability([
      { number: 4, hasAired: true }, { number: 3, airDate: '2026-10-17', hasAired: true },
    ], undefined, now);
    expect(result.map(episode => episode.hasAired)).toEqual([false, false]);
  });
  test('AniList next-airing boundary protects count-only fallback lists', () => {
    const episodes = [1, 2, 3, 4].map(number => ({ number, hasAired: undefined }));
    const result = applyEpisodeAvailability(episodes, { episode: 3, airingAt: Date.parse('2026-10-17') / 1000 }, now);
    expect(result.map(episode => episode.hasAired)).toEqual([undefined, undefined, false, false]);
  });
  test('undated back catalogues and expired next-airing metadata remain playable', () => {
    const episodes = [1, 2, 3, 4].map(number => ({ number }));
    expect(applyEpisodeAvailability(episodes, undefined, now)).toEqual(episodes);
    expect(applyEpisodeAvailability(episodes, { episode: 3, airingAt: Date.parse('2026-10-10') / 1000 }, now)).toEqual(episodes);
  });
  test('valid past dates refresh stale flags and preserve out-of-order release evidence', () => {
    expect(applyEpisodeAvailability([
      { number: 3, hasAired: false, airDateUtc: '2026-10-17T12:00:00Z' },
      { number: 4, hasAired: false, airDateUtc: '2026-10-10T12:00:00Z' },
    ], undefined, now).map(episode => episode.hasAired)).toEqual([false, true]);
    expect(applyEpisodeAvailability([{ number: 3, hasAired: false, airDateUtc: '2026-10-17T12:00:00Z' }], undefined,
      Date.parse('2026-10-17T12:00:00Z'))[0].hasAired).toBe(true);
  });
  test('a still-airing title with no AniList total gets placeholders from the next-airing schedule', () => {
    const media = { episodes: null, nextAiringEpisode: { episode: 3, airingAt: Date.parse('2026-10-25T12:00:00Z') / 1000 } };
    expect(fallbackEpisodeCount(media, now)).toBe(2);
  });
  test('once the scheduled episode airs it is counted too', () => {
    const media = { episodes: null, nextAiringEpisode: { episode: 3, airingAt: Date.parse('2026-10-25T12:00:00Z') / 1000 } };
    expect(fallbackEpisodeCount(media, Date.parse('2026-10-26T00:00:00Z'))).toBe(3);
  });
  test('a declared AniList total still wins over the schedule', () => {
    expect(fallbackEpisodeCount({ episodes: 12, nextAiringEpisode: { episode: 3, airingAt: 0 } }, now)).toBe(12);
    expect(fallbackEpisodeCount({ episodes: 0, nextAiringEpisode: { episode: 9, airingAt: HOUR(1) } }, now)).toBe(8);
  });
  test('finished and unknown titles stay at zero placeholders', () => {
    expect(fallbackEpisodeCount({ episodes: null }, now)).toBe(0);
    expect(fallbackEpisodeCount({ episodes: null, nextAiringEpisode: null }, now)).toBe(0);
    expect(fallbackEpisodeCount({ episodes: 0, nextAiringEpisode: { episode: 0, airingAt: 0 } }, now)).toBe(0);
    expect(fallbackEpisodeCount({}, now)).toBe(0);
  });
  test('the placeholder cap still applies to a schedule-derived count', () => {
    const media = { episodes: null, nextAiringEpisode: { episode: 5000, airingAt: HOUR(1) } };
    expect(fallbackEpisodeCount(media, now)).toBe(2000);
    expect(fallbackEpisodeCount({ episodes: 99999 }, now)).toBe(2000);
  });
  test('specials do not block regular episodes or inherit their airing boundary', () => {
    const result = applyEpisodeAvailability([
      { number: 1, isSpecial: true, airDateUtc: '2026-10-17T12:00:00Z' },
      { number: 3, hasAired: true },
    ], undefined, now);
    expect(result.map(episode => episode.hasAired)).toEqual([false, true]);
    const special = { number: 4, isSpecial: true };
    expect(applyEpisodeAvailability([{ number: 3, hasAired: false }, special], undefined, now)[1]).toEqual(special);
  });
});
