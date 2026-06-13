const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawnSync } = require('child_process');
const ytsr = require('ytsr');
const { parseDuration } = require('./helpers');

function mapVideoResult(item) {
    const thumbnailUrl = item.bestThumbnail?.url;

    return {
        title: item.title,
        url: item.url,
        durationInSec: item.duration ? parseDuration(item.duration) : 0,
        thumbnails: thumbnailUrl ? [{ url: thumbnailUrl }] : []
    };
}

function mapYtDlpEntry(entry) {
    const thumbnailUrl = entry.thumbnail || entry.thumbnails?.[0]?.url;
    const url = entry.url && entry.url.startsWith('http')
        ? entry.url
        : `https://www.youtube.com/watch?v=${entry.id}`;

    return {
        title: entry.title,
        url,
        durationInSec: entry.duration || 0,
        thumbnails: thumbnailUrl ? [{ url: thumbnailUrl }] : []
    };
}

function execFileAsync(filePath, args) {
    return new Promise((resolve, reject) => {
        execFile(filePath, args, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                error.stderr = stderr;
                reject(error);
                return;
            }

            resolve(stdout);
        });
    });
}

function resolveYtDlpPath() {
    const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
    const ytdlpFromPath = spawnSync(lookupCommand, ['yt-dlp'], { encoding: 'utf8' });
    let ytdlpPath = ytdlpFromPath.status === 0
        ? ytdlpFromPath.stdout.split(/\r?\n/).find(Boolean)?.trim()
        : '';

    if (!ytdlpPath || !fs.existsSync(ytdlpPath)) {
        const localYtdlp = path.join(os.homedir(), '.local', 'bin', 'yt-dlp');
        if (fs.existsSync(localYtdlp)) {
            ytdlpPath = localYtdlp;
        }
    }

    if (!ytdlpPath || !fs.existsSync(ytdlpPath)) {
        const ytdlp = require('@distube/yt-dlp');
        const bundledPath = typeof ytdlp === 'string'
            ? ytdlp
            : ytdlp.path || path.join(__dirname, '..', 'node_modules', '@distube', 'yt-dlp', 'bin', 'yt-dlp.exe');

        if (bundledPath && fs.existsSync(bundledPath)) {
            ytdlpPath = bundledPath;
        }
    }

    return ytdlpPath;
}

async function searchWithYtDlp(query, limit) {
    const ytdlpPath = resolveYtDlpPath();
    if (!ytdlpPath) {
        throw new Error('yt-dlp binary not found');
    }

    const stdout = await execFileAsync(ytdlpPath, [
        `ytsearch${limit}:${query}`,
        '--dump-single-json',
        '--flat-playlist',
        '--no-warnings',
        '--skip-download'
    ]);

    const parsed = JSON.parse(stdout);
    const entries = Array.isArray(parsed.entries)
        ? parsed.entries
        : parsed.id
            ? [parsed]
            : [];

    return entries
        .filter(entry => entry && entry.id && entry.title)
        .slice(0, limit)
        .map(mapYtDlpEntry);
}

async function searchWithYtsr(query, limit) {
    const searchResults = await ytsr(query, { limit: Math.max(limit * 5, 10) });
    const videos = searchResults.items.filter(item => item.type === 'video' && item.url);

    return videos.slice(0, limit).map(mapVideoResult);
}

async function searchYouTube(query, { limit = 1 } = {}) {
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    if (!normalizedQuery) {
        return [];
    }

    try {
        return await searchWithYtDlp(normalizedQuery, limit);
    } catch (ytDlpError) {
        console.error('yt-dlp search fallback error:', ytDlpError.stderr || ytDlpError.message);
    }

    return searchWithYtsr(normalizedQuery, limit);
}

module.exports = {
    searchYouTube
};