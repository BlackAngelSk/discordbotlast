const withTimeout = (promise, ms) => new Promise((resolve) => {
    const parsedMs = Number(ms);
    const timeoutMs = Number.isFinite(parsedMs) ? Math.max(1, parsedMs) : 3000;
    const timer = setTimeout(() => resolve(null), timeoutMs);
    promise
        .then(result => {
            clearTimeout(timer);
            resolve(result);
        })
        .catch(() => {
            clearTimeout(timer);
            resolve(null);
        });
});

const fetchUserSafe = async (client, userId, timeoutMs = 3000) => {
    if (!client || !userId) return null;
    const cached = client.users?.cache?.get(userId);
    if (cached) return cached;
    return withTimeout(client.users.fetch(userId).catch(() => null), timeoutMs);
};

const fetchMemberSafe = async (guild, userId, timeoutMs = 3000) => {
    if (!guild || !userId) return null;
    const cached = guild.members?.cache?.get(userId);
    if (cached) return cached;
    return withTimeout(guild.members.fetch(userId).catch(() => null), timeoutMs);
};

const fetchChannelSafe = async (client, channelId, timeoutMs = 3000) => {
    if (!client || !channelId) return null;
    const cached = client.channels?.cache?.get(channelId);
    if (cached) return cached;
    return withTimeout(client.channels.fetch(channelId).catch(() => null), timeoutMs);
};

module.exports = {
    withTimeout,
    fetchUserSafe,
    fetchMemberSafe,
    fetchChannelSafe
};
