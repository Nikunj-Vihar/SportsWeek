// Deployment config. Auto-detects local dev vs. the deployed site so the
// same file works in both places without manual edits:
//  - localhost / 127.0.0.1 (the Node dev server): same-origin API, since
//    dev-server.js mounts the proxy itself.
//  - anywhere else (GitHub Pages): the deployed Cloudflare Worker.
const isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname);

export const API_BASE = isLocalDev ? '' : 'https://sportsweek-proxy.nikunj0903.workers.dev';
