const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'dashboard',
  description: 'Point to the in-Discord server dashboard.',
  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🛠 Server dashboard')
      .setDescription(
        [
          'The dashboard lives inside Discord now — run **`/dashboard`** to open it.',
          '',
          'Panels: settings categories, economy (balances, shop items, global board),',
          'safety actions, server builder, insights, community, live alerts, and the',
          'owner panel for the bot owner.',
        ].join('\n')
      )
      .setFooter({ text: 'The web dashboard has been retired' });

    return message.reply({ embeds: [embed] });
  },
};
