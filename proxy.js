import http from 'http';
import https from 'https';

const PORT = 8091;
const OPENSKY_BASE = 'https://opensky-network.org';

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const target = OPENSKY_BASE + url.pathname + url.search;

    const proxyReq = https.get(target, {
        headers: {
            'Authorization': req.headers.authorization || ''
        }
    }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });
    proxyReq.on('error', (e) => {
        res.writeHead(502);
        res.end(JSON.stringify({ error: e.message }));
    });
});

server.listen(PORT, () => console.log(`OpenSky proxy on http://localhost:${PORT}`));
