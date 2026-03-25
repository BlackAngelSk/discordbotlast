function isTruthy(value) {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isDevModeEnabled() {
    return isTruthy(process.env.DEV_MODE || '');
}

module.exports = {
    isDevModeEnabled
};
