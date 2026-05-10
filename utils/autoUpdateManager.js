const fs = require('fs/promises');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'autoUpdateState.json');
const UPDATER_PATH = path.join(ROOT_DIR, 'self updater', 'updater.py');
const REPO = 'BlackAngelSk/discordbotlast';

function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

function parseInteger(value, fallback, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function truncate(text, max = 1200) {
    const value = String(text || '').trim();
    if (!value) return '';
    if (value.length <= max) return value;
    return `${value.slice(0, max)}...`;
}

function shortSha(sha) {
    const value = String(sha || '').trim();
    return value ? value.slice(0, 8) : 'none';
}

class AutoUpdateManager {
    constructor() {
        this.timer = null;
        this.checkInFlight = false;
        this.started = false;
    }

    isEnabled() {
        return parseBoolean(process.env.AUTO_UPDATE_ENABLED, false);
    }

    getRef() {
        return String(process.env.AUTO_UPDATE_REF || 'main').trim() || 'main';
    }

    getIntervalSeconds() {
        return parseInteger(process.env.AUTO_UPDATE_INTERVAL_SECONDS, 900, 60, 86400);
    }

    getInitialDelaySeconds() {
        return parseInteger(process.env.AUTO_UPDATE_INITIAL_DELAY_SECONDS, 45, 0, 3600);
    }

    getRestartDelayMs() {
        return parseInteger(process.env.AUTO_UPDATE_RESTART_DELAY_MS, 2000, 250, 120000);
    }

    getBackupEnabled() {
        return parseBoolean(process.env.AUTO_UPDATE_BACKUP, true);
    }

    getDeleteMissingEnabled() {
        return parseBoolean(process.env.AUTO_UPDATE_DELETE_MISSING, false);
    }

    getPythonExecutable() {
        const envExe = String(process.env.PYTHON_EXE || '').trim();
        if (envExe) return envExe;
        return process.platform === 'win32' ? 'python' : 'python3';
    }

    async start() {
        if (this.started) return;
        this.started = true;

        if (!this.isEnabled()) {
            console.log('Auto updater: disabled (set AUTO_UPDATE_ENABLED=true to enable).');
            return;
        }

        try {
            await fs.access(UPDATER_PATH);
        } catch {
            console.warn(`Auto updater: updater script not found at ${UPDATER_PATH}`);
            return;
        }

        const intervalSeconds = this.getIntervalSeconds();
        const initialDelaySeconds = this.getInitialDelaySeconds();

        console.log(
            `Auto updater: enabled (repo=${REPO}, ref=${this.getRef()}, interval=${intervalSeconds}s, initialDelay=${initialDelaySeconds}s).`
        );

        setTimeout(() => {
            this.checkNow('startup').catch((error) => {
                console.error('Auto updater startup check failed:', error.message);
            });
        }, initialDelaySeconds * 1000);

        this.timer = setInterval(() => {
            this.checkNow('interval').catch((error) => {
                console.error('Auto updater interval check failed:', error.message);
            });
        }, intervalSeconds * 1000);

        if (typeof this.timer.unref === 'function') {
            this.timer.unref();
        }
    }

    async readState() {
        try {
            const raw = await fs.readFile(DATA_FILE, 'utf8');
            const parsed = JSON.parse(raw || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            if (error.code === 'ENOENT') return {};
            console.error('Auto updater: failed to read state file:', error.message);
            return {};
        }
    }

    async writeState(state) {
        const parent = path.dirname(DATA_FILE);
        await fs.mkdir(parent, { recursive: true });
        await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2));
    }

    fetchRemoteSha(ref) {
        const token = String(process.env.GITHUB_TOKEN || '').trim();
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${REPO}/commits/${encodeURIComponent(ref)}`,
            method: 'GET',
            headers: {
                'User-Agent': 'discordbot-auto-updater',
                'Accept': 'application/vnd.github+json'
            },
            timeout: 20000
        };

        if (token) {
            options.headers.Authorization = `Bearer ${token}`;
        }

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        return reject(new Error(`GitHub API HTTP ${res.statusCode}: ${truncate(body, 300) || 'Unknown error'}`));
                    }

                    let parsed;
                    try {
                        parsed = JSON.parse(body || '{}');
                    } catch {
                        return reject(new Error('Invalid JSON response from GitHub API'));
                    }

                    const sha = String(parsed?.sha || '').trim();
                    if (!sha) {
                        return reject(new Error('GitHub API response did not include commit sha'));
                    }

                    resolve(sha);
                });
            });

            req.on('timeout', () => {
                req.destroy(new Error('GitHub API request timed out'));
            });
            req.on('error', reject);
            req.end();
        });
    }

    runUpdater(ref) {
        const pythonExe = this.getPythonExecutable();
        const args = [
            UPDATER_PATH,
            'redo',
            '--target',
            ROOT_DIR,
            '--ref',
            ref
        ];

        if (this.getBackupEnabled()) {
            args.push('--backup');
        }

        if (this.getDeleteMissingEnabled()) {
            args.push('--delete-missing');
        }

        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';

            const child = spawn(pythonExe, args, {
                cwd: ROOT_DIR,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
            });

            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });

            child.on('error', (error) => {
                resolve({
                    success: false,
                    exitCode: -1,
                    stdout,
                    stderr: `${stderr}\n${error.message}`.trim()
                });
            });

            child.on('close', (exitCode) => {
                resolve({
                    success: exitCode === 0,
                    exitCode,
                    stdout,
                    stderr
                });
            });
        });
    }

    async checkNow(trigger = 'manual', options = {}) {
        const force = parseBoolean(options?.force, false);
        const applyUpdate = options?.applyUpdate !== false;

        if (!this.isEnabled() && !force) {
            return {
                success: false,
                status: 'disabled',
                trigger,
                message: 'Auto updater is disabled'
            };
        }

        if (this.checkInFlight) {
            return {
                success: false,
                status: 'in-progress',
                trigger,
                message: 'An update check is already running'
            };
        }

        this.checkInFlight = true;

        try {
            const ref = this.getRef();
            const latestSha = await this.fetchRemoteSha(ref);
            const state = await this.readState();
            const nowIso = new Date().toISOString();

            const nextState = {
                ...state,
                repo: REPO,
                ref,
                lastCheckedAt: nowIso,
                lastRemoteSha: latestSha
            };

            await this.writeState(nextState);

            const lastAppliedSha = String(state.lastAppliedSha || '').trim();
            const shouldUpdate = !lastAppliedSha || lastAppliedSha !== latestSha;

            if (!shouldUpdate) {
                console.log(`Auto updater: no new commits on ${ref} (${latestSha.slice(0, 8)}).`);
                return {
                    success: true,
                    status: 'up-to-date',
                    trigger,
                    ref,
                    latestSha,
                    latestShortSha: shortSha(latestSha),
                    lastAppliedSha,
                    lastAppliedShortSha: shortSha(lastAppliedSha)
                };
            }

            if (!applyUpdate) {
                console.log(
                    `Auto updater: update available (${shortSha(lastAppliedSha)} -> ${shortSha(latestSha)}), applyUpdate=false.`
                );
                return {
                    success: true,
                    status: 'update-available',
                    trigger,
                    ref,
                    latestSha,
                    latestShortSha: shortSha(latestSha),
                    lastAppliedSha,
                    lastAppliedShortSha: shortSha(lastAppliedSha)
                };
            }

            console.log(
                `Auto updater: update detected (${lastAppliedSha ? lastAppliedSha.slice(0, 8) : 'none'} -> ${latestSha.slice(0, 8)}), trigger=${trigger}.`
            );

            const result = await this.runUpdater(ref);

            if (!result.success) {
                await this.writeState({
                    ...nextState,
                    lastFailedAt: new Date().toISOString(),
                    lastFailure: {
                        exitCode: result.exitCode,
                        stderr: truncate(result.stderr, 1200),
                        stdout: truncate(result.stdout, 1200)
                    }
                });

                console.error(`Auto updater: update failed (exit code ${result.exitCode}).`);
                if (result.stderr) {
                    console.error(`Auto updater stderr: ${truncate(result.stderr, 1200)}`);
                }
                return {
                    success: false,
                    status: 'update-failed',
                    trigger,
                    ref,
                    latestSha,
                    latestShortSha: shortSha(latestSha),
                    lastAppliedSha,
                    lastAppliedShortSha: shortSha(lastAppliedSha),
                    exitCode: result.exitCode,
                    stderr: truncate(result.stderr, 1200),
                    stdout: truncate(result.stdout, 1200)
                };
            }

            await this.writeState({
                ...nextState,
                lastAppliedSha: latestSha,
                lastUpdatedAt: new Date().toISOString(),
                lastSuccess: {
                    exitCode: result.exitCode,
                    stdout: truncate(result.stdout, 1200)
                },
                lastFailedAt: null,
                lastFailure: null
            });

            const delayMs = this.getRestartDelayMs();
            console.log(`Auto updater: update installed successfully, restarting process in ${delayMs}ms.`);

            setTimeout(() => {
                process.exit(0);
            }, delayMs);

            return {
                success: true,
                status: 'updated',
                trigger,
                ref,
                latestSha,
                latestShortSha: shortSha(latestSha),
                previousSha: lastAppliedSha,
                previousShortSha: shortSha(lastAppliedSha),
                restartInMs: delayMs,
                exitCode: result.exitCode,
                stdout: truncate(result.stdout, 1200)
            };
        } catch (error) {
            console.error(`Auto updater: check failed (${error.message}).`);
            return {
                success: false,
                status: 'error',
                trigger,
                message: error.message
            };
        } finally {
            this.checkInFlight = false;
        }
    }
}

module.exports = new AutoUpdateManager();
