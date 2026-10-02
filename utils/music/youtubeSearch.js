/**
 * Single music-retrieval module — everything resolves through yt-dlp.
 *
 * Replaces the previous dual-path stack (ytsr for search, play-dl for
 * video/playlist/SoundCloud metadata). One binary, one output shape, no
 * scrapers to break when YouTube changes its layout.
 *
 * All functions return a consistent "media item" shape:
 *   { title, url, durationInSec, thumbnails: [{url}] }
 */

const { execFile } = require('child_process');
const { resolveYtDlpPath } = require('../ytdlpPathResolver');

function mapYtDlpEntry(entry) {
  const thumbnailUrl = entry.thumbnail || entry.thumbnails?.[0]?.url;
  const url =
    entry.url && entry.url.startsWith('http')
      ? entry.url
      : `https://www.youtube.com/watch?v=${entry.id}`;

  return {
    title: entry.title,
    url,
    durationInSec: entry.duration || 0,
    thumbnails: thumbnailUrl ? [{ url: thumbnailUrl }] : [],
  };
}

function execFileAsync(filePath, args) {
  return new Promise((resolve, reject) => {
    execFile(filePath, args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function ytdlp() {
  const ytdlpPath = resolveYtDlpPath();
  if (!ytdlpPath) {
    throw new Error('yt-dlp binary not found');
  }
  return ytdlpPath;
}

/**
 * Run yt-dlp with --dump-single-json and return the parsed result.
 *
 * @param {string[]} args
 * @returns {Promise<any>}
 */
async function dumpJson(args) {
  const stdout = await execFileAsync(ytdlp(), [
    '--dump-single-json',
    '--no-warnings',
    '--skip-download',
    ...args,
  ]);
  return JSON.parse(stdout);
}

/**
 * Search YouTube for `query`.
 *
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Array<{title: string, url: string, durationInSec: number, thumbnails: Array<{url: string}>}>>}
 */
async function searchYouTube(query, { limit = 1 } = {}) {
  const normalizedQuery = typeof query === 'string' ? query.trim() : '';
  if (!normalizedQuery) {
    return [];
  }

  const parsed = await dumpJson([`ytsearch${limit}:${normalizedQuery}`, '--flat-playlist']);
  const entries = Array.isArray(parsed.entries) ? parsed.entries : parsed.id ? [parsed] : [];

  return entries
    .filter((entry) => entry && entry.id && entry.title)
    .slice(0, limit)
    .map(mapYtDlpEntry);
}

/**
 * Fetch metadata for a single media URL (YouTube / SoundCloud / any
 * extractor yt-dlp understands). Never extracts playlists.
 *
 * @param {string} url
 * @returns {Promise<{title: string, url: string, durationInSec: number, thumbnails: Array<{url: string}>} | null>}
 */
async function getVideoInfo(url) {
  const parsed = await dumpJson(['--no-playlist', url]);
  if (!parsed || !parsed.id) {
    return null;
  }
  return mapYtDlpEntry(parsed);
}

/**
 * Resolve a playlist URL into its tracks (flat, metadata only).
 *
 * @param {string} url
 * @param {number} [limit=50]
 * @returns {Promise<{title: string, entries: Array<{title: string, url: string, durationInSec: number, thumbnails: Array<{url: string}>}>}>}
 */
async function getPlaylistInfo(url, limit = 50) {
  const parsed = await dumpJson(['--flat-playlist', url]);
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];

  return {
    title: parsed.title || 'Playlist',
    entries: entries
      .filter((entry) => entry && entry.id && entry.title)
      .slice(0, limit)
      .map(mapYtDlpEntry),
  };
}

/**
 * Lightweight URL classifier — matches what the old play-dl validators did.
 *
 * @param {string} url
 * @returns {'video' | 'playlist' | null}
 */
function validateYoutubeUrl(url) {
  if (typeof url !== 'string' || !url.includes('youtube.com') && !url.includes('youtu.be')) {
    return null;
  }
  if (url.includes('list=')) {
    return 'playlist';
  }
  return 'video';
}

/**
 * @param {string} url
 * @returns {boolean}
 */
function isSoundCloudUrl(url) {
  return typeof url === 'string' && url.includes('soundcloud.com');
}

module.exports = {
  searchYouTube,
  getVideoInfo,
  getPlaylistInfo,
  validateYoutubeUrl,
  isSoundCloudUrl,
};
