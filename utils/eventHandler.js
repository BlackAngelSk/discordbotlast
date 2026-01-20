const fs = require('fs');
const path = require('path');

class EventHandler {
    constructor(client) {
        this.client = client;
    }

    async loadEvents() {
        const eventsPath = path.join(__dirname, '../events');
        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

        for (const file of eventFiles) {
            const filePath = path.join(eventsPath, file);
            const event = require(filePath);
            
            if (event.once) {
                this.client.once(event.name, (...args) => event.execute(...args, this.client));
            } else {
                this.client.on(event.name, (...args) => event.execute(...args, this.client));
            }
            
            console.log(`✅ Loaded event: ${event.name}`);
        }
    }
}

module.exports = EventHandler;
