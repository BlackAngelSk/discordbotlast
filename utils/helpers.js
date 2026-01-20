// Helper function to parse duration from string (e.g., "3:45" to seconds)
function parseDuration(duration) {
    const parts = duration.split(':').map(Number);
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1]; // MM:SS
    } else if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
    }
    return 0;
}

// Helper function to format duration
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

module.exports = {
    parseDuration,
    formatDuration
};
