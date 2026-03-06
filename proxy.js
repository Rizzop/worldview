import http from 'http';
import https from 'https';

const PORT = 8091;
const OPENSKY_BASE = 'https://opensky-network.org';
const CLIENT_ID = 'ryanramirez@live.com-api-client';
const CLIENT_SECRET = 'J3t4jg6IL30CEW0yWaE9M5cTukiCPaTs';
const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

let accessToken = null;
let tokenExpiry = 0;

function getToken() {
    return new Promise((resolve, reject) => {
        const body = `grant_type=client_credentials&client_id=${encodeURIComponent(CLIENT_ID)}&client_secret=${encodeURIComponent(CLIENT_SECRET)}`;
        const url = new URL(TOKEN_URL);
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.access_token) {
                        accessToken = json.access_token;
                        tokenExpiry = Date.now() + (json.expires_in * 1000) - 30000;
                        console.log('Token acquired, expires in', json.expires_in, 'seconds');
                        resolve(accessToken);
                    } else {
                        console.error('Token error:', data);
                        reject(new Error('No access token'));
                    }
                } catch(e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    try {
        if (!accessToken || Date.now() > tokenExpiry) {
            await getToken();
        }

        const url = new URL(req.url, `http://localhost:${PORT}`);
        const target = OPENSKY_BASE + url.pathname + url.search;

        const proxyReq = https.get(target, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, { 'Content-Type': proxyRes.headers['content-type'] || 'application/json' });
            proxyRes.pipe(res);
        });
        proxyReq.on('error', (e) => {
            res.writeHead(502);
            res.end(JSON.stringify({ error: e.message }));
        });
    } catch(e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
    }
});

server.listen(PORT, () => console.log(`OpenSky OAuth2 proxy on http://localhost:${PORT}`));
