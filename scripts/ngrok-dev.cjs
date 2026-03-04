const { spawn } = require('node:child_process');

const ngrokUrl = process.env.NGROK_URL;
const ngrokAuthtoken = process.env.NGROK_AUTHTOKEN;

if (!ngrokUrl) {
  console.error('NGROK_URL is not set. Add it to your .env file.');
  process.exit(1);
}

const port = process.env.PORT || '3000';
let ngrokDomain = ngrokUrl;

if (ngrokUrl.includes('://')) {
  try {
    ngrokDomain = new URL(ngrokUrl).hostname;
  } catch (error) {
    console.error('NGROK_URL is invalid. Use a hostname or full URL.');
    process.exit(1);
  }
}

const args = ['http', `--domain=${ngrokDomain}`];

if (ngrokAuthtoken) {
  args.push(`--authtoken=${ngrokAuthtoken}`);
}

args.push(port, ...process.argv.slice(2));

const child = spawn('ngrok', args, { stdio: 'inherit' });

child.on('error', (error) => {
  if (error.code === 'ENOENT') {
    console.error('Could not find `ngrok` on PATH. Install ngrok and try again.');
  } else {
    console.error(error.message);
  }
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (typeof code === 'number') {
    process.exit(code);
  }

  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(1);
  }
});
