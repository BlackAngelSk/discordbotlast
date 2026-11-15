/**
 * Keeps the yt-dlp binary current.
 *
 * YouTube breaks older yt-dlp releases regularly, so the bot checks for updates
 * on a schedule (daily by default) using yt-dlp's own self-updater (`-U`).
 *
 * Environment:
 *   YTDLP_AUTO_UPDATE=true            enable/disable the scheduler
 *   YTDLP_UPDATE_INTERVAL_HOURS=24    how often to check (1–168)
 *   YTDLP_UPDATE_INITIAL_DELAY_SECONDS=120  first check after startup
 */
'use strict';

const { spawn } = require('child_process');
const { resolveYtDlpPath } = require('../ytdlpPathResolver');

const DEFAULT_INTERVAL_HOURS = 24;
const MIN_INTERVAL_HOURS = 1;
const MAX_INTERVAL_HOURS = 168;
const UPDATE_TIMEOUT_MS = 3 * 60 * 1000;
const VERSION_TIMEOUT_MS = 20 * 1000;
const VERSION_PATTERN = /\d{4}\.\d{1,2}\.\d{1,2}(?:\.\d+)?/;

const parseBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const parseIntervalHours = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_INTERVAL_HOURS;
  return Math.min(MAX_INTERVAL_HOURS, Math.max(MIN_INTERVAL_HOURS, Math.round(parsed)));
};

const parseVersion = (output) => {
  const match = String(output || '').match(VERSION_PATTERN);
  return match ? match[0] : null;
};

/**
 * Turn `yt-dlp -U` output into a result. Pure — unit tested.
 *
 * @param {{ exitCode: number|null, signal?: string|null, stdout?: string, stderr?: string }} params
 * @returns {{ status: 'updated'|'up-to-date'|'package-manager'|'failed', version: string|null, detail: string }}
 */
function classifyYtDlpUpdate({ exitCode, signal = null, stdout = '', stderr = '' }) {
  const combined = `${stdout}\n${stderr}`.trim();
  const version = parseVersion(combined);

  if (/installed yt-dlp via|package manager|It is not possible to update/i.test(combined)) {
    return {
      status: 'package-manager',
      version,
      detail:
        'yt-dlp is managed by the system package manager — update it with your distro instead.',
    };
  }

  if (/up to date/i.test(combined)) {
    return {
      status: 'up-to-date',
      version,
      detail: version ? `Already up to date (${version})` : 'Already up to date',
    };
  }

  if (exitCode === 0) {
    if (/updated yt-dlp|updating to|downloaded/i.test(combined)) {
      return { status: 'updated', version, detail: version ? `Updated to ${version}` : 'Updated' };
    }

    return {
      status: 'up-to-date',
      version,
      detail: version ? `No update needed (${version})` : 'No update needed',
    };
  }

  const reason = combined
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /error|denied|failed|not found|permission/i.test(line))
    .slice(0, 2)
    .join(' | ');

  return {
    status: 'failed',
    version,
    detail:
      reason ||
      (signal ? `Update was killed (${signal})` : `yt-dlp -U exited with code ${exitCode}`),
  };
}

function runCommand(command, args, { timeoutMs = UPDATE_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    let child;
    try {
      child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      return resolve({ exitCode: null, signal: null, stdout: '', stderr: error.message });
    }

    const timer = setTimeout(() => {
      if (settled) return;
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
    }, timeoutMs);

    const finish = (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, signal, stdout, stderr });
    };

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 20000) stdout = stdout.slice(-20000);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 20000) stderr = stderr.slice(-20000);
    });

    child.on('error', (error) => {
      stderr += `${error.message}\n`;
      finish(null, null);
    });
    child.on('close', (code, signal) => finish(code, signal));
  });
}

class YtdlpUpdater {
  constructor() {
    this.interval = null;
    this.initialTimer = null;
    this.running = false;
    this.lastResult = null;
    this.lastRunAt = null;
    this.version = null;
  }

  isEnabled() {
    return parseBoolean(process.env.YTDLP_AUTO_UPDATE, true);
  }

  getIntervalHours() {
    return parseIntervalHours(process.env.YTDLP_UPDATE_INTERVAL_HOURS);
  }

  getInitialDelayMs() {
    const seconds = Number(process.env.YTDLP_UPDATE_INITIAL_DELAY_SECONDS);
    const safeSeconds = Number.isFinite(seconds) && seconds >= 0 ? seconds : 120;
    return safeSeconds * 1000;
  }

  getBinaryPath() {
    return resolveYtDlpPath();
  }

  async getVersion(binary = this.getBinaryPath()) {
    if (!binary) return null;

    const result = await runCommand(binary, ['--version'], { timeoutMs: VERSION_TIMEOUT_MS });
    const version = parseVersion(result.stdout) || parseVersion(result.stderr);

    if (version) this.version = version;
    return version;
  }

  async update({ reason = 'manual' } = {}) {
    if (this.running) {
      return this.lastResult || { status: 'failed', detail: 'Update already running' };
    }

    this.running = true;

    try {
      const binary = this.getBinaryPath();
      if (!binary) {
        const result = { status: 'failed', version: null, detail: 'yt-dlp binary not found' };
        this.record(result, reason);
        return result;
      }

      const beforeVersion = await this.getVersion(binary);
      const outcome = await runCommand(binary, ['-U'], { timeoutMs: UPDATE_TIMEOUT_MS });
      const classified = classifyYtDlpUpdate(outcome);
      const afterVersion = classified.version || (await this.getVersion(binary));

      const result = {
        status: classified.status,
        version: afterVersion,
        previousVersion: beforeVersion,
        detail: classified.detail,
        binary,
      };

      this.record(result, reason);
      return result;
    } catch (error) {
      const result = { status: 'failed', version: null, detail: error.message };
      this.record(result, reason);
      return result;
    } finally {
      this.running = false;
    }
  }

  record(result, reason) {
    this.lastResult = { ...result, reason };
    this.lastRunAt = new Date().toISOString();

    const changed = result.previousVersion && result.previousVersion !== result.version;
    const label = changed
      ? `${result.previousVersion} → ${result.version || 'unknown'}`
      : result.version || 'unknown';

    if (result.status === 'failed') {
      console.warn(`[ytdlp] update failed (${reason}): ${result.detail}`);
    } else if (result.status === 'package-manager') {
      console.log(`[ytdlp] ${label} — ${result.detail}`);
    } else if (result.status === 'updated') {
      console.log(`[ytdlp] updated (${reason}): ${label}`);
    } else {
      console.log(`[ytdlp] ${label} — up to date (${reason})`);
    }
  }

  /** Start the scheduled updater (safe to call twice). */
  start() {
    if (!this.isEnabled()) {
      console.log('[ytdlp] auto-update disabled (YTDLP_AUTO_UPDATE=false).');
      return false;
    }

    this.stop();

    const intervalMs = this.getIntervalHours() * 60 * 60 * 1000;

    const run = () => {
      this.update({ reason: 'scheduled' }).catch((error) => {
        console.warn(`[ytdlp] scheduled update error: ${error.message}`);
      });
    };

    this.initialTimer = setTimeout(run, this.getInitialDelayMs());
    this.initialTimer.unref?.();

    this.interval = setInterval(run, intervalMs);
    this.interval.unref?.();

    console.log(
      `[ytdlp] auto-update enabled — first check in ${Math.round(
        this.getInitialDelayMs() / 1000
      )}s, then every ${this.getIntervalHours()}h.`
    );

    return true;
  }

  stop() {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  getStatus() {
    return {
      enabled: this.isEnabled(),
      intervalHours: this.getIntervalHours(),
      binary: this.getBinaryPath() || null,
      version: this.version,
      running: this.running,
      lastRunAt: this.lastRunAt,
      lastResult: this.lastResult,
    };
  }
}

const ytdlpUpdater = new YtdlpUpdater();

module.exports = ytdlpUpdater;
module.exports.classifyYtDlpUpdate = classifyYtDlpUpdate;
module.exports.parseVersion = parseVersion;
module.exports.parseIntervalHours = parseIntervalHours;
module.exports.YtdlpUpdater = YtdlpUpdater;
