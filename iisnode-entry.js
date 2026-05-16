// Load .env before anything else so AUTH_SECRET, DATABASE_URL, etc. are available
// to all modules including NextAuth handlers (which need AUTH_SECRET at request time)
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  }
  process.stderr.write('> Loaded .env (' + lines.length + ' lines)\n');
}

// Log everything to stderr so iisnode shows it
process.on('uncaughtException', (err) => {
  process.stderr.write('UNCAUGHT: ' + err.stack + '\n');
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  process.stderr.write('UNHANDLED: ' + (err && err.stack || err) + '\n');
});

// iisnode passes a named pipe path in PORT — pass it through as-is
process.env.HOSTNAME = '0.0.0.0';

try {
  require('./server.js');
} catch (err) {
  process.stderr.write('REQUIRE ERROR: ' + err.stack + '\n');
  process.exit(1);
}
