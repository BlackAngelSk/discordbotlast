const DEFAULT_BETA_ROLE_NAME = 'bot beta access';

function getBetaRoleName() {
    return (process.env.BETA_ACCESS_ROLE_NAME || DEFAULT_BETA_ROLE_NAME).trim();
}

function getBetaRoleId() {
    const value = (process.env.BETA_ACCESS_ROLE_ID || '').trim();
    return value || null;
}

function findBetaRole(guild) {
    if (!guild?.roles?.cache) return null;

    const configuredRoleId = getBetaRoleId();
    if (configuredRoleId) {
        return guild.roles.cache.get(configuredRoleId) || null;
    }

    const targetName = getBetaRoleName().toLowerCase();
    return guild.roles.cache.find((role) => role.name.toLowerCase() === targetName) || null;
}

async function ensureBetaRole(guild) {
    const existing = findBetaRole(guild);
    if (existing) return existing;

    return guild.roles.create({
        name: getBetaRoleName(),
        mentionable: false,
        reason: 'Create role for beta command access'
    });
}

function memberHasBetaAccess(member) {
    if (!member) return false;
    if (member.permissions?.has?.('Administrator')) return true;

    const configuredRoleId = getBetaRoleId();
    if (configuredRoleId && member.roles?.cache?.has?.(configuredRoleId)) {
        return true;
    }

    const targetName = getBetaRoleName().toLowerCase();
    return member.roles?.cache?.some?.((role) => role.name.toLowerCase() === targetName) || false;
}

module.exports = {
    getBetaRoleName,
    getBetaRoleId,
    findBetaRole,
    ensureBetaRole,
    memberHasBetaAccess
};
