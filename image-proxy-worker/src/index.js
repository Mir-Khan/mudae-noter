// Image fetch proxy for Mudae Noter.
//
// Why this exists: the app runs entirely client-side (no backend), so any
// "load this image link" feature (upload-by-URL, crop-by-URL, the bulk
// Imgur->ImgChest transfer) has to fetch the target image directly from the
// visitor's browser. That's subject to two things a server-side fetch isn't:
//   1. The target host's own CORS policy - some hosts (Pinterest's CDN,
//      among others) don't send Access-Control-Allow-Origin, so the browser
//      blocks reading the response outright.
//   2. Ad blockers / privacy extensions, which filter fetch()/XHR calls to
//      known third-party CDN domains (imgur.com included, on some lists)
//      even when that host would otherwise allow the request fine.
//
// Routing the fetch through this Worker sidesteps both: the browser's
// request goes to *this* Worker's own domain instead of the image host, and
// the Worker's own outbound fetch is server-to-server, which is never
// subject to CORS or browser extensions at all.

// Restricts who can actually use this - without this, the Worker would be a
// free, open image proxy anyone could point at anything. Referer isn't
// spoof-proof against non-browser clients, but it stops casual abuse from
// other sites' *browsers*, which is the realistic threat here.
const ALLOWED_ORIGINS = [
    'https://mir-khan.github.io',
];

function isAllowedReferer(request) {
    const referer = request.headers.get('Referer') || request.headers.get('Origin') || '';
    return ALLOWED_ORIGINS.some((origin) => referer.startsWith(origin));
}

function corsHeaders(request) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin',
    };
}

// Keeps this a strictly image-fetching proxy, not a general-purpose one -
// worth capping size too, so it can't be used to tunnel large arbitrary
// downloads through the Worker's bandwidth.
const MAX_BYTES = 25 * 1024 * 1024; // 25MB

export default {
    async fetch(request) {
        const headers = corsHeaders(request);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers });
        }

        if (request.method !== 'GET') {
            return new Response('Method not allowed', { status: 405, headers });
        }

        if (!isAllowedReferer(request)) {
            return new Response('Forbidden', { status: 403, headers });
        }

        const requestUrl = new URL(request.url);
        const target = requestUrl.searchParams.get('url');
        if (!target) {
            return new Response('Missing "url" query parameter', { status: 400, headers });
        }

        let targetUrl;
        try {
            targetUrl = new URL(target);
        } catch (err) {
            return new Response('Invalid "url" parameter', { status: 400, headers });
        }
        if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
            return new Response('Only http/https URLs are allowed', { status: 400, headers });
        }

        let upstream;
        try {
            upstream = await fetch(targetUrl.toString(), {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MudaeNoterImageProxy/1.0)' },
            });
        } catch (err) {
            return new Response('Could not reach that URL', { status: 502, headers });
        }

        if (!upstream.ok) {
            return new Response('Upstream responded with status ' + upstream.status, { status: 502, headers });
        }

        const contentType = upstream.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            return new Response('That URL is not an image (content-type: ' + (contentType || 'unknown') + ')', { status: 415, headers });
        }

        const contentLength = parseInt(upstream.headers.get('content-length') || '0', 10);
        if (contentLength > MAX_BYTES) {
            return new Response('Image is too large to proxy', { status: 413, headers });
        }

        headers['Content-Type'] = contentType;
        headers['Cache-Control'] = 'public, max-age=3600';
        return new Response(upstream.body, { status: 200, headers });
    },
};
