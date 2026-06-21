#!/usr/bin/env node
/**
 * MongoDB Atlas Connection Diagnostic Script
 * 
 * Usage: node test-mongo-connect.js
 * 
 * Tests the MongoDB connection using the same settings as the bot
 * and provides actionable diagnostics if the connection fails.
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

function redactUri(uri) {
    if (!uri) return '(empty)';
    try {
        return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
    } catch {
        return '(unparseable)';
    }
}

function diagnoseError(error) {
    const msg = (error?.message || '').toLowerCase();

    if (!msg) {
        return {
            cause: 'Unknown (empty error message)',
            fix: 'Check if the mongodb package is properly installed. Try: npm install mongodb'
        };
    }

    if (msg.includes('bad auth') || msg.includes('authentication failed') || msg.includes('auth fail')) {
        return {
            cause: 'Authentication failed — wrong username or password',
            fix: 'Verify your MONGODB_URI username and password. Password must be URL-encoded if it contains special characters like @, /, %, #.'
        };
    }

    if (msg.includes('tlsv1 alert') || msg.includes('ssl routines') || msg.includes('ssl') || msg.includes('tls')) {
        return {
            cause: 'TLS/SSL handshake failure',
            fix: 'Try these steps:\n  1. Add MONGODB_FORCE_IPV4=true to .env\n  2. Set MONGODB_TLS_CA_FILE=/etc/ssl/certs/ca-certificates.crt in .env\n  3. As a last resort, set MONGODB_TLS_INSECURE=true in .env\n  4. Make sure your server IP is in the Atlas IP Access List'
        };
    }

    if (msg.includes('querysrv') || msg.includes('enotfound') || msg.includes('dns')) {
        return {
            cause: 'DNS/SRV lookup failed — cannot resolve the MongoDB cluster hostname',
            fix: 'Check your internet connection and DNS settings. Try adding MONGODB_FORCE_IPV4=true to .env. Verify the MONGODB_URI hostname is correct.'
        };
    }

    if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('server selection')) {
        return {
            cause: 'Connection timed out — server not reachable',
            fix: 'Check these:\n  1. Your server IP is in the Atlas Network Access / IP Allowlist (or set to 0.0.0.0/0 for testing)\n  2. Outbound traffic to port 27017/27015 is not blocked by firewall\n  3. Your VPS/hosting provider allows outbound MongoDB connections'
        };
    }

    if (msg.includes('econnrefused')) {
        return {
            cause: 'Connection refused — the server is rejecting connections',
            fix: 'The Atlas cluster may be paused, or the port is wrong. Check your Atlas cluster status in the dashboard.'
        };
    }

    if (msg.includes('econnreset')) {
        return {
            cause: 'Connection reset — the server dropped the connection',
            fix: 'This often indicates a network/firewall issue or IP not in the Atlas allowlist. Check Atlas Network Access settings.'
        };
    }

    if (msg.includes('invalid connection string') || msg.includes('invalid uri')) {
        return {
            cause: 'Invalid MongoDB URI format',
            fix: 'Your MONGODB_URI is malformed. It should look like:\n  mongodb+srv://username:password@cluster.mongodb.net/?appName=discord-bot\nCheck for typos, missing characters, or unescaped special characters.'
        };
    }

    if (msg.includes('connect enotfound') || msg.includes('getaddrinfo')) {
        return {
            cause: 'Cannot resolve hostname — DNS resolution failed for the cluster',
            fix: 'Check your internet connection. The MONGODB_URI hostname may be wrong. Try MONGODB_FORCE_IPV4=true. Ensure DNS is working (try: nslookup <your-cluster-hostname>).'
        };
    }

    return {
        cause: `Unexpected error: ${error.message}`,
        fix: 'Check the full error message and search for it on Stack Overflow or MongoDB forums. Common issues: Atlas IP allowlist, credentials, TLS, network.'
    };
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('   🔌 MongoDB Atlas Connection Diagnostic');
    console.log('═══════════════════════════════════════════════════════\n');

    // 1. Check DEV_MODE
    const devMode = (process.env.DEV_MODE || 'false').toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(devMode)) {
        console.log('⚠️  DEV_MODE is ENABLED — the bot will force JSON storage regardless of MongoDB config.');
        console.log('   Set DEV_MODE=false in .env to use MongoDB.\n');
    }

    // 2. Check MONGODB_URI
    const uri = process.env.MONGODB_URI;
    console.log(`📋 MONGODB_URI: ${redactUri(uri)}`);

    if (!uri || !uri.trim()) {
        console.log('❌ MONGODB_URI is empty or not set in .env');
        console.log('   Add your MongoDB Atlas connection string to .env:');
        console.log('   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?appName=discord-bot\n');
        process.exit(1);
    }

    if (uri.includes('<db_password>') || uri.includes('<username>') || uri.includes('YOUR_') || uri.includes('your_')) {
        console.log('❌ MONGODB_URI still contains placeholder values!');
        console.log('   Replace the placeholders with your actual MongoDB Atlas credentials.\n');
        process.exit(1);
    }

    if (!/^mongodb(\+srv)?:\/\//.test(uri.trim())) {
        console.log('❌ MONGODB_URI does not start with mongodb:// or mongodb+srv://');
        console.log('   The URI format is invalid.\n');
        process.exit(1);
    }

    // 3. Check options
    const forceIpv4 = (process.env.MONGODB_FORCE_IPV4 || '').toLowerCase();
    const tlsCaFile = process.env.MONGODB_TLS_CA_FILE || '';
    const tlsInsecure = (process.env.MONGODB_TLS_INSECURE || '').toLowerCase();

    console.log(`📋 MONGODB_DBNAME: ${process.env.MONGODB_DBNAME || 'discord-bot'}`);
    console.log(`📋 MONGODB_FORCE_IPV4: ${forceIpv4 || '(not set)'}`);
    console.log(`📋 MONGODB_TLS_CA_FILE: ${tlsCaFile || '(not set)'}`);
    console.log(`📋 MONGODB_TLS_INSECURE: ${tlsInsecure || '(not set)'}`);
    console.log('');

    // 4. Build client options (mirrors databaseManager.buildMongoClientOptions)
    const options = {
        serverSelectionTimeoutMS: Math.max(3000, Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 10000),
        connectTimeoutMS: Math.max(3000, Number(process.env.MONGODB_CONNECT_TIMEOUT_MS) || 10000)
    };

    if (['1', 'true', 'yes', 'on'].includes(forceIpv4)) {
        options.family = 4;
        console.log('🔧 Using IPv4 only (MONGODB_FORCE_IPV4=true)');
    }

    if (tlsCaFile) {
        const fs = require('fs');
        if (fs.existsSync(tlsCaFile)) {
            options.tls = true;
            options.tlsCAFile = tlsCaFile;
            console.log(`🔧 Using custom CA file: ${tlsCaFile}`);
        } else {
            console.log(`⚠️  CA file not found at "${tlsCaFile}" — using system trust store.`);
        }
    }

    if (['1', 'true', 'yes', 'on'].includes(tlsInsecure)) {
        options.tls = true;
        options.tlsAllowInvalidCertificates = true;
        options.tlsAllowInvalidHostnames = true;
        console.log('⚠️  TLS insecure mode enabled (allows invalid certs/hostnames)');
    }

    // 5. Attempt connection
    console.log('\n⏳ Attempting connection to MongoDB Atlas...');
    const startTime = Date.now();

    let client;
    try {
        client = new MongoClient(uri.trim(), options);
        await client.connect();

        const duration = Date.now() - startTime;
        const db = client.db(process.env.MONGODB_DBNAME || 'discord-bot');

        // Test a ping
        await db.command({ ping: 1 });

        console.log(`✅ Connection successful! (${duration}ms)`);
        console.log(`   Database: ${process.env.MONGODB_DBNAME || 'discord-bot'}`);

        // List collections
        const collections = await db.listCollections().toArray();
        if (collections.length > 0) {
            console.log(`   Existing collections (${collections.length}):`);
            for (const col of collections) {
                const count = await db.collection(col.name).countDocuments();
                console.log(`     - ${col.name} (${count} documents)`);
            }
        } else {
            console.log('   No collections found (fresh database)');
        }

        console.log('\n✅ Your MongoDB Atlas setup is working correctly!');
        console.log('   Restart the bot and it should connect to MongoDB instead of falling back to JSON.\n');

    } catch (error) {
        const duration = Date.now() - startTime;
        console.log(`\n❌ Connection failed after ${duration}ms\n`);
        console.log(`   Error: ${error.message}\n`);

        const diagnosis = diagnoseError(error);
        console.log(`   Likely cause: ${diagnosis.cause}`);
        console.log(`\n   💡 How to fix:`);
        console.log(`   ${diagnosis.fix.split('\n').join('\n   ')}\n`);

        // Try without SRV if it's a DNS issue
        if (uri.includes('+srv') && uri.includes('enotfound')) {
            console.log('\n📝 Note: Your URI uses +srv (DNS-based). If DNS is the issue, you can try:');
            console.log('   1. Use the non-SRV connection string from Atlas (mongodb:// instead of mongodb+srv://)');
            console.log('   2. Or add MONGODB_FORCE_IPV4=true to .env');
        }

        // IPv4 retry
        if (!options.family) {
            console.log('\n🔄 Retrying with IPv4 only...');
            try {
                const retryOptions = { ...options, family: 4 };
                const retryClient = new MongoClient(uri.trim(), retryOptions);
                await retryClient.connect();
                const retryDb = retryClient.db(process.env.MONGODB_DBNAME || 'discord-bot');
                await retryDb.command({ ping: 1 });
                console.log('✅ Connection successful with IPv4!');
                console.log('   Add MONGODB_FORCE_IPV4=true to your .env file to use this setting permanently.\n');
                await retryClient.close();
            } catch (retryError) {
                console.log(`❌ IPv4 retry also failed: ${retryError.message}\n`);
            }
        }
    } finally {
        if (client) {
            await client.close();
        }
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});