const commands = [
  ['system-stats', require('../slashCommands/admin/system-stats')],
  ['shop', require('../slashCommands/economy/shop')],
  ['horserace', require('../slashCommands/fun/horserace')],
  ['rps', require('../slashCommands/fun/rps')],
  ['ttt', require('../slashCommands/fun/ttt')],
];

process.env.BOT_OWNER_ID = '1';

const fakeCollector = {
  on() { return this; },
  once() { return this; },
  stop() {}
};

const fakeMessage = {
  id: 'msg-1',
  createdTimestamp: Date.now(),
  edit: async () => {},
  delete: async () => {},
  createMessageComponentCollector: () => fakeCollector,
};

function makeInteraction(name) {
  return {
    commandName: name,
    user: {
      id: '1',
      username: 'tester',
      tag: 'tester#0001',
      displayAvatarURL: () => ''
    },
    member: {
      permissions: { has: () => true },
      roles: { cache: { has: () => true } }
    },
    guild: { id: 'guild-1' },
    guildId: 'guild-1',
    channelId: 'channel-1',
    client: { ws: { ping: 0 } },
    deferred: false,
    replied: false,
    options: {
      getInteger: () => 10,
      getString: () => 'medium',
    },
    async reply() {
      this.replied = true;
      return undefined;
    },
    async editReply() {
      return fakeMessage;
    },
    async fetchReply() {
      return fakeMessage;
    },
    async followUp() {
      return fakeMessage;
    },
  };
}

(async () => {
  for (const [name, command] of commands) {
    const interaction = makeInteraction(name);
    try {
      await command.execute(interaction);
      console.log(`PASS ${name}`);
    } catch (error) {
      console.log(`FAIL ${name}`);
      console.error(error?.stack || error);
      process.exitCode = 1;
    }
  }

  if (global.statsMonitors) {
    for (const monitor of global.statsMonitors.values()) {
      clearInterval(monitor.interval);
    }
    global.statsMonitors.clear();
  }
})();
