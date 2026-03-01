const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class AutoBackup {
    constructor(options = {}) {
        this.dataDir = options.dataDir || path.join(__dirname, '../data');
        this.backupDir = options.backupDir || path.join(this.dataDir, 'backups');
        this.maxBackups = options.maxBackups || 30; // Keep 30 backups
        this.schedules = options.schedules || {
            daily: { time: '02:00', enabled: true }, // 2 AM
            weekly: { day: 0, time: '03:00', enabled: true } // Sunday 3 AM
        };

        this.initializeBackupDir();
        this.setupSchedules();
    }

    initializeBackupDir() {
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    setupSchedules() {
        // Set up daily backup
        if (this.schedules.daily.enabled) {
            this.scheduleDailyBackup();
        }

        // Set up weekly backup
        if (this.schedules.weekly.enabled) {
            this.scheduleWeeklyBackup();
        }
    }

    scheduleDailyBackup() {
        const [hour, minute] = this.schedules.daily.time.split(':').map(Number);
        
        const checkTime = () => {
            const now = new Date();
            if (now.getHours() === hour && now.getMinutes() === minute) {
                this.createBackup('daily');
            }
        };

        // Check every minute
        setInterval(checkTime, 60000);
    }

    scheduleWeeklyBackup() {
        const [hour, minute] = this.schedules.weekly.time.split(':').map(Number);
        const day = this.schedules.weekly.day;

        const checkTime = () => {
            const now = new Date();
            if (now.getDay() === day && now.getHours() === hour && now.getMinutes() === minute) {
                this.createBackup('weekly');
            }
        };

        // Check every minute
        setInterval(checkTime, 60000);
    }

    /**
     * Create a backup immediately
     * @param {string} type - Backup type (manual, daily, weekly)
     * @returns {object} - Backup info
     */
    createBackup(type = 'manual') {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `backup-${type}-${timestamp}`;
            const backupPath = path.join(this.backupDir, backupName);

            // Create backup directory
            if (!fs.existsSync(backupPath)) {
                fs.mkdirSync(backupPath, { recursive: true });
            }

            let backupCount = 0;
            let errorCount = 0;

            // Backup all JSON files
            if (fs.existsSync(this.dataDir)) {
                const files = fs.readdirSync(this.dataDir);
                
                for (const file of files) {
                    if (file === 'backups' || file.startsWith('.')) continue;
                    
                    const source = path.join(this.dataDir, file);
                    const dest = path.join(backupPath, file);
                    const stat = fs.statSync(source);

                    try {
                        if (stat.isDirectory()) {
                            this.copyDir(source, dest);
                        } else if (file.endsWith('.json')) {
                            fs.copyFileSync(source, dest);
                        }
                        backupCount++;
                    } catch (e) {
                        console.error(`Failed to backup ${file}:`, e);
                        errorCount++;
                    }
                }
            }

            const backupInfo = {
                name: backupName,
                type,
                path: backupPath,
                timestamp: new Date().toISOString(),
                filesBackedUp: backupCount,
                errors: errorCount,
                size: this.getDirectorySize(backupPath)
            };

            this.pruneOldBackups();
            return backupInfo;
        } catch (error) {
            console.error('Backup failed:', error);
            return null;
        }
    }

    /**
     * Copy directory recursively
     * @param {string} source - Source directory
     * @param {string} dest - Destination directory
     */
    copyDir(source, dest) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const files = fs.readdirSync(source);
        for (const file of files) {
            const sourcePath = path.join(source, file);
            const destPath = path.join(dest, file);
            const stat = fs.statSync(sourcePath);

            if (stat.isDirectory()) {
                this.copyDir(sourcePath, destPath);
            } else {
                fs.copyFileSync(sourcePath, destPath);
            }
        }
    }

    /**
     * Get directory size
     * @param {string} dirPath - Directory path
     * @returns {number} - Size in bytes
     */
    getDirectorySize(dirPath) {
        let size = 0;

        try {
            const files = fs.readdirSync(dirPath);
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stat = fs.statSync(filePath);

                if (stat.isDirectory()) {
                    size += this.getDirectorySize(filePath);
                } else {
                    size += stat.size;
                }
            }
        } catch (e) {
            console.error('Error calculating directory size:', e);
        }

        return size;
    }

    /**
     * Get all backups
     * @returns {array} - List of backups
     */
    getBackups() {
        try {
            if (!fs.existsSync(this.backupDir)) return [];

            const backups = fs.readdirSync(this.backupDir)
                .filter(name => name.startsWith('backup-'))
                .map(name => {
                    const backupPath = path.join(this.backupDir, name);
                    const stat = fs.statSync(backupPath);

                    return {
                        name,
                        path: backupPath,
                        created: stat.birthtime,
                        modified: stat.mtime,
                        size: this.getDirectorySize(backupPath)
                    };
                })
                .sort((a, b) => b.modified - a.modified);

            return backups;
        } catch (e) {
            console.error('Failed to get backups:', e);
            return [];
        }
    }

    /**
     * Restore from backup
     * @param {string} backupName - Backup name to restore from
     * @returns {boolean} - Success status
     */
    restoreFromBackup(backupName) {
        try {
            const backupPath = path.join(this.backupDir, backupName);

            if (!fs.existsSync(backupPath)) {
                console.error('Backup not found:', backupName);
                return false;
            }

            // Create a safety backup first
            this.createBackup('pre-restore');

            // Copy files back
            const files = fs.readdirSync(backupPath);
            let restoredCount = 0;

            for (const file of files) {
                const source = path.join(backupPath, file);
                const dest = path.join(this.dataDir, file);
                const stat = fs.statSync(source);

                try {
                    if (stat.isDirectory()) {
                        // Remove existing directory
                        if (fs.existsSync(dest)) {
                            this.removeDir(dest);
                        }
                        this.copyDir(source, dest);
                    } else {
                        fs.copyFileSync(source, dest);
                    }
                    restoredCount++;
                } catch (e) {
                    console.error(`Failed to restore ${file}:`, e);
                }
            }

            console.log(`Restored ${restoredCount} files from backup: ${backupName}`);
            return true;
        } catch (error) {
            console.error('Restore failed:', error);
            return false;
        }
    }

    /**
     * Remove directory recursively
     * @param {string} dirPath - Directory path
     */
    removeDir(dirPath) {
        try {
            if (fs.existsSync(dirPath)) {
                fs.rmSync(dirPath, { recursive: true, force: true });
            }
        } catch (e) {
            console.error('Failed to remove directory:', e);
        }
    }

    /**
     * Delete a backup
     * @param {string} backupName - Backup name
     * @returns {boolean} - Success status
     */
    deleteBackup(backupName) {
        try {
            const backupPath = path.join(this.backupDir, backupName);

            if (fs.existsSync(backupPath)) {
                this.removeDir(backupPath);
                return true;
            }
            return false;
        } catch (e) {
            console.error('Failed to delete backup:', e);
            return false;
        }
    }

    /**
     * Prune old backups to keep only maxBackups
     */
    pruneOldBackups() {
        try {
            const backups = this.getBackups();

            if (backups.length > this.maxBackups) {
                const toDelete = backups.slice(this.maxBackups);
                for (const backup of toDelete) {
                    this.deleteBackup(backup.name);
                    console.log(`Pruned old backup: ${backup.name}`);
                }
            }
        } catch (e) {
            console.error('Failed to prune backups:', e);
        }
    }

    /**
     * Get backup statistics
     * @returns {object} - Backup stats
     */
    getStats() {
        const backups = this.getBackups();
        let totalSize = 0;

        for (const backup of backups) {
            totalSize += backup.size;
        }

        return {
            totalBackups: backups.length,
            totalSize,
            totalSizeMB: Math.round(totalSize / 1024 / 1024),
            oldestBackup: backups[backups.length - 1] || null,
            newestBackup: backups[0] || null
        };
    }
}

module.exports = AutoBackup;
