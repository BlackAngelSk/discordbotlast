const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const {
    MONGODB_STORAGE_LIMIT,
    validateMongoUri,
    connectMongoWithRetry
} = require('../../check-mongodb-space');
const databaseManager = require('../../utils/databaseManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mongodb-space')
        .setDescription('Check MongoDB storage usage (Bot Owner Only)'),

    async execute(interaction) {
        // Check if user is bot owner
        const OWNER_ID = process.env.BOT_OWNER_ID;
        
        if (!OWNER_ID) {
            return interaction.reply({
                content: '❌ BOT_OWNER_ID not configured in environment variables.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                content: '❌ This command is only available to the bot owner.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Defer reply since this might take a moment
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let mongoClient = null;
        try {
            const mongoUri = process.env.MONGODB_URI;
            const dbName = process.env.MONGODB_DBNAME || 'discord-bot';

            const uriError = validateMongoUri(mongoUri);
            if (uriError) {
                return interaction.editReply({
                    content: `❌ ${uriError}`
                });
            }

            mongoClient = await connectMongoWithRetry(mongoUri);
            const db = mongoClient.db(dbName);

            // Get database stats
            const dbStats = await db.stats();
            const storageSize = dbStats.storageSize;
            const storageSizeInMB = (storageSize / (1024 * 1024)).toFixed(2);
            const storageSizeInGB = (storageSize / (1024 * 1024 * 1024)).toFixed(4);
            
            // Calculate space left
            const spaceLeftMB = (MONGODB_STORAGE_LIMIT - storageSizeInMB).toFixed(2);
            const spaceUsedPercent = ((storageSizeInMB / MONGODB_STORAGE_LIMIT) * 100).toFixed(1);
            
            // Get collection sizes
            const collections = await db.listCollections().toArray();
            const collectionStats = [];

            for (const collectionInfo of collections) {
                const collectionName = collectionInfo.name;
                try {
                    const stats = await db.command({ collStats: collectionName });
                    const size = stats.size || 0;
                    const sizeInMB = (size / (1024 * 1024)).toFixed(2);
                    const count = stats.count || 0;

                    collectionStats.push({
                        name: collectionName,
                        size: size,
                        sizeInMB: sizeInMB,
                        count: count
                    });
                } catch (error) {
                    // Skip collections we can't get stats for
                }
            }

            // Sort by size and get top 5
            collectionStats.sort((a, b) => b.size - a.size);
            const topCollections = collectionStats.slice(0, 5);

            // Create embed
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📊 MongoDB Storage Status')
                .setDescription(`Database: **${dbName}**`)
                .addFields(
                    {
                        name: '💾 Storage Used',
                        value: `${storageSizeInMB} MB (${storageSizeInGB} GB)`,
                        inline: true
                    },
                    {
                        name: '✅ Space Left',
                        value: `${spaceLeftMB} MB`,
                        inline: true
                    },
                    {
                        name: '📈 Usage Percentage',
                        value: `${spaceUsedPercent}%`,
                        inline: true
                    },
                    {
                        name: '📊 Storage Limit',
                        value: `${MONGODB_STORAGE_LIMIT} MB`,
                        inline: true
                    },
                    {
                        name: '📄 Total Collections',
                        value: `${dbStats.collections}`,
                        inline: true
                    },
                    {
                        name: '📋 Total Documents',
                        value: `${dbStats.objects || 0}`,
                        inline: true
                    }
                );

            // Add top collections
            if (topCollections.length > 0) {
                let topCollectionsText = '';
                for (const col of topCollections) {
                    topCollectionsText += `**${col.name}** - ${col.sizeInMB} MB (${col.count} docs)\n`;
                }
                embed.addFields({
                    name: '🏆 Top 5 Collections by Size',
                    value: topCollectionsText,
                    inline: false
                });
            }

            // Add warning if usage is high
            if (parseFloat(spaceUsedPercent) > 80) {
                embed.addFields({
                    name: '⚠️ Warning',
                    value: `Storage usage is at ${spaceUsedPercent}%! Consider cleaning up old data.`,
                    inline: false
                });
                embed.setColor(0xFF6B6B);
            } else if (parseFloat(spaceUsedPercent) > 50) {
                embed.setColor(0xFFD700);
            } else {
                embed.setColor(0x57F287);
            }

            embed.setTimestamp();
            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            const isBadAuth = error?.code === 8000 || /bad auth|authentication failed/i.test(error?.message || '');
            if (isBadAuth) {
                return interaction.editReply({
                    content: '❌ MongoDB authentication failed (bad auth). Check username/password in MONGODB_URI, URL-encode special password characters, and verify Atlas DB user permissions.'
                });
            }

            const hint = typeof databaseManager.getMongoConnectionHint === 'function'
                ? databaseManager.getMongoConnectionHint(error?.message)
                : 'Verify MONGODB_URI and Atlas network access.';

            console.error('Error checking MongoDB space:', error);
            return interaction.editReply({
                content: `❌ Error checking MongoDB: ${error.message}\n💡 ${hint}`
            });
        } finally {
            if (mongoClient) {
                await mongoClient.close().catch(() => null);
            }
        }
    }
};
