/**
 * Test System Stats Manager
 * Displays CPU and RAM usage information
 */

const systemStatsManager = require('./utils/systemStatsManager');

console.log('📊 System Stats Test\n');
console.log('═'.repeat(60));

// Get stats multiple times to show data
for (let i = 0; i < 3; i++) {
    const stats = systemStatsManager.getSystemStats();

    console.log(`\n[Sample ${i + 1}]`);
    console.log('─'.repeat(60));
    
    console.log(`\n💻 CPU Usage: ${stats.cpu.toFixed(2)}%`);
    const cpuBar = '█'.repeat(Math.floor(stats.cpu / 5)) + '░'.repeat(20 - Math.floor(stats.cpu / 5));
    console.log(`   ${cpuBar}`);

    console.log(`\n🧠 System RAM Usage: ${stats.ram.percent.toFixed(2)}%`);
    const ramBar = '█'.repeat(Math.floor(stats.ram.percent / 5)) + '░'.repeat(20 - Math.floor(stats.ram.percent / 5));
    console.log(`   ${ramBar}`);
    console.log(`   Used: ${stats.ram.used} / Total: ${stats.ram.total}`);
    console.log(`   Free: ${stats.ram.free}`);

    console.log(`\n🤖 Bot Memory Usage:`);
    console.log(`   Heap Used: ${stats.botMemory.heapUsed}`);
    console.log(`   Heap Total: ${stats.botMemory.heapTotal}`);
    console.log(`   RSS: ${stats.botMemory.rss}`);
    console.log(`   External: ${stats.botMemory.external}`);

    console.log(`\n⏱️  Bot Uptime: ${stats.uptime}`);

    if (i < 2) {
        console.log('\n⏳ Waiting 2 seconds for next sample...');
        // Synchronous sleep for demo
        const start = Date.now();
        while (Date.now() - start < 2000) {}
    }
}

console.log('\n' + '═'.repeat(60));
console.log('\n✅ System Stats Test Complete!\n');
