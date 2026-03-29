const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { EmbedBuilder } = require('discord.js');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'botUpdateState.json');
const PACKAGE_FILE = path.join(ROOT_DIR, 'package.json');

function safeReadJson(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        console.error('Failed to read update notifier JSON:', error);
        return null;
    }
}

function safeWriteJson(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Failed to write update notifier JSON:', error);
    }
}

function getPackageVersion() {
    const pkg = safeReadJson(PACKAGE_FILE);
    return pkg?.version || 'unknown';
}

function getGitInfo() {
    try {
        const commit = execSync('git rev-parse --short HEAD', {
            cwd: ROOT_DIR,
            stdio: ['ignore', 'pipe', 'ignore']
        }).toString().trim();

        const branch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: ROOT_DIR,
            stdio: ['ignore', 'pipe', 'ignore']
        }).toString().trim();

        return {
            commit: commit || 'unknown',
            branch: branch || 'unknown'
        };
    } catch {
        return {
            commit: 'unknown',
            branch: 'unknown'
        };
    }
}

function buildFingerprint(version, git) {
    return `${version}|${git.commit}|${git.branch}`;
}

async function notifyOwnerIfUpdated(client) {
    try {
        const ownerId = process.env.BOT_OWNER_ID;
        if (!ownerId || !client?.isReady?.()) return;

        const version = getPackageVersion();
        const git = getGitInfo();
        const fingerprint = buildFingerprint(version, git);

        const previous = safeReadJson(DATA_FILE);

        const currentState = {
            fingerprint,
            version,
            commit: git.commit,
            branch: git.branch,
            updatedAt: new Date().toISOString(),
            botTag: client.user?.tag || 'unknown'
        };

        if (!previous || !previous.fingerprint) {
            safeWriteJson(DATA_FILE, {
                ...currentState,
                firstSeenAt: new Date().toISOString(),
                lastNotifiedAt: null
            });
            return;
        }

        if (previous.fingerprint === fingerprint) {
            return;
        }

        const owner = await client.users.fetch(ownerId).catch(() => null);
        if (!owner) {
            safeWriteJson(DATA_FILE, {
                ...currentState,
                firstSeenAt: previous.firstSeenAt || new Date().toISOString(),
                lastNotifiedAt: null
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🔄 Bot Updated')
            .setDescription('A new bot build/version was detected after restart.')
            .addFields(
                {
                    name: 'Previous',
                    value: `Version: ${previous.version || 'unknown'}\nCommit: ${previous.commit || 'unknown'}\nBranch: ${previous.branch || 'unknown'}`,
                    inline: true
                },
                {
                    name: 'Current',
                    value: `Version: ${version}\nCommit: ${git.commit}\nBranch: ${git.branch}`,
                    inline: true
                },
                {
                    name: 'Detected At',
                    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                    inline: false
                }
            )
            .setFooter({ text: `Bot: ${client.user?.tag || 'unknown'}` })
            .setTimestamp();

        await owner.send({ embeds: [embed] }).catch((error) => {
            console.error('Failed to DM owner about update:', error);
        });

        safeWriteJson(DATA_FILE, {
            ...currentState,
            firstSeenAt: previous.firstSeenAt || new Date().toISOString(),
            lastNotifiedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in update notifier:', error);
    }
}

module.exports = {
    notifyOwnerIfUpdated
};
