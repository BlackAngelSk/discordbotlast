// @ts-check
/**
 * /dashboard — the in-Discord server dashboard.
 *
 * Opens one ephemeral hub message with every panel: settings (the /setup
 * catalog), plus the panels added in the following phases. Replaces the old
 * web dashboard; `/setup config` opens the same hub.
 */

const { SlashCommandBuilder, EmbedBuilder, Colors, MessageFlags } = require('discord.js');
const { openHub } = require('../../utils/panel/hub');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Open the server dashboard — configure everything from inside Discord.')
    .setDefaultMemberPermissions(0x8n),

  /**
   * @param {any} interaction
   * @returns {Promise<void>}
   */
  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder()
              .setColor(Colors.Red)
              .setTitle('Guild only')
              .setDescription('The dashboard can only be opened inside a server.'),
          ],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }

    const member = /** @type {any} */ (interaction.member);
    if (!member || !member.permissions.has('ManageGuild')) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder()
              .setColor(Colors.Red)
              .setTitle('No permission')
              .setDescription('You need the **Manage Server** permission to open the dashboard.'),
          ],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }

    await openHub(interaction);
  },
};
