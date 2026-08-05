const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * Resolves the path to the yt-dlp binary.
 *
 * Lookup order:
 *  1. System PATH (`which` / `where`)
 *  2. ~/.local/bin/yt-dlp (common manual install location)
 *  3. Bundled binary shipped inside @distube/yt-dlp package
 *
 * @returns {string} Absolute path to the yt-dlp binary, or empty string if not found.
 */
function resolveYtDlpPath() {
  // ── 1. Try system PATH ──────────────────────────────────────────────
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
  const ytdlpFromPath = spawnSync(lookupCommand, ['yt-dlp'], { encoding: 'utf8' });
  let ytdlpPath =
    ytdlpFromPath.status === 0 ? ytdlpFromPath.stdout.split(/\r?\n/).find(Boolean)?.trim() : '';

  if (ytdlpPath && fs.existsSync(ytdlpPath)) {
    return ytdlpPath;
  }

  // ── 2. Common manual-install location ───────────────────────────────
  const localYtdlp = path.join(os.homedir(), '.local', 'bin', 'yt-dlp');
  if (fs.existsSync(localYtdlp)) {
    return localYtdlp;
  }

  // ── 3. Bundled @distube/yt-dlp binary ───────────────────────────────
  //    The package ships its binary at  <pkg>/bin/yt-dlp(.exe).
  //    We derive the package root from require.resolve().
  try {
    const pkgEntry = require.resolve('@distube/yt-dlp');
    const pkgRoot = path.resolve(path.dirname(pkgEntry), '..');
    const binName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const bundledPath = path.join(pkgRoot, 'bin', binName);

    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }

    // If the binary hasn't been downloaded yet, trigger the download and return the path.
    const { download } = require('@distube/yt-dlp');
    if (typeof download === 'function') {
      // Fire-and-forget – the download will populate the bin/ directory.
      download().catch(() => {});
    }
    return bundledPath; // Return the expected path even if not yet downloaded
  } catch {
    // @distube/yt-dlp not installed or require.resolve failed
  }

  return '';
}

module.exports = { resolveYtDlpPath };