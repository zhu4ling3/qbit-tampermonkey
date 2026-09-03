// ==UserScript==
// @name         qBittorrent Torrent Interceptor - CN PT Enhanced
// @namespace    https://github.com/zhu4ling3/qbit-tampermonkey
// @version      1.16.2-cn
// @description  捕获 PT 站点的 Torrent/Magnet 链接，支持筛选、批量检查并发送到 qBittorrent
// @author       ZL
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_addStyle
// @connect      *
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const REQUEST_TIMEOUT = 20000;
    const CFG = {
        get qbitUrl() { return GM_getValue('qbit_url', 'http://localhost:8080').replace(/\/+$/, ''); },
        get username() { return GM_getValue('qbit_username', ''); },
        get password() { return GM_getValue('qbit_password', ''); },
        get savePath() { return GM_getValue('qbit_savepath', ''); },
        get category() { return GM_getValue('qbit_category', ''); },
        get tags() { return GM_getValue('qbit_tags', ''); },
        get autoStart() { return GM_getValue('qbit_autostart', true); },
        get autoTMM() { return GM_getValue('qbit_autotmm', false); },
        get skipChecking() { return GM_getValue('qbit_skip_checking', false); },
        get debug() { return GM_getValue('qbit_debug', false); },
    };

    let sid = GM_getValue('qbit_session', null);

    function log(...args) {
        if (CFG.debug) console.log('[qBit CNPT]', ...args);
    }

    function notify(message, type = 'info') {
        if (document.body) {
            const node = document.createElement('div');
            node.textContent = message;
            node.className = 'qbit-cnpt-toast';
            node.dataset.type = type;
            document.body.appendChild(node);
            setTimeout(() => node.remove(), 4500);
        } else if (typeof GM_notification === 'function') {
            GM_notification({ title: 'qBittorrent', text: message, timeout: 4000 });
        }
    }

    GM_addStyle(`
        .qbit-cnpt-toast { position:fixed; right:20px; bottom:20px; z-index:2147483647; padding:12px 16px; border-radius:8px; background:#333; color:#fff; font:14px/1.4 system-ui,sans-serif; box-shadow:0 4px 16px rgba(0,0,0,.3) }
        .qbit-cnpt-toast[data-type="ok"] { background:#227a3b }
        .qbit-cnpt-toast[data-type="error"] { background:#b3261e }
        .qbit-cnpt-overlay { position:fixed; inset:0; z-index:2147483646; background:rgba(0,0,0,.60); display:flex; align-items:center; justify-content:center; padding:2vh 2vw; box-sizing:border-box }
        .qbit-cnpt-box { width:min(560px,94vw); max-height:92vh; overflow:auto; box-sizing:border-box; background:#fff; color:#111; border-radius:10px; padding:20px; font:14px/1.5 system-ui,sans-serif; box-shadow:0 10px 40px rgba(0,0,0,.35) }
        .qbit-cnpt-box.qbit-cnpt-batch { width:min(1080px,96vw) }
        .qbit-cnpt-box h3 { margin:0 0 14px; font-size:18px }
        .qbit-cnpt-box label { display:block; margin:10px 0 4px }
        .qbit-cnpt-box input[type=text], .qbit-cnpt-box input[type=password] { box-sizing:border-box; width:100%; padding:8px 10px; border:1px solid #bbb; border-radius:6px }
        .qbit-cnpt-row { display:flex; gap:12px; flex-wrap:wrap; margin:10px 0 }
        .qbit-cnpt-row label { display:flex; align-items:center; gap:6px; margin:0 }
        .qbit-cnpt-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:18px }
        .qbit-cnpt-actions button { padding:8px 14px; border:0; border-radius:6px; cursor:pointer }
        .qbit-cnpt-actions button:disabled { cursor:wait; opacity:.65 }
        .qbit-cnpt-primary { background:#1976d2; color:#fff }
        .qbit-cnpt-secondary { background:#e5e5e5; color:#111 }
        .qbit-cnpt-toolbar { display:grid; grid-template-columns:minmax(220px,1fr) minmax(220px,1fr) auto; gap:12px; align-items:end; margin-bottom:12px }
        .qbit-cnpt-toolbar label { margin:0 }
        .qbit-cnpt-list { border:1px solid #ccc; border-radius:7px; max-height:52vh; overflow:auto }
        .qbit-cnpt-item { display:grid; grid-template-columns:28px minmax(0,1fr) 110px; gap:8px; align-items:start; padding:10px; border-bottom:1px solid #ddd }
        .qbit-cnpt-item[hidden] { display:none }
        .qbit-cnpt-item:last-child { border-bottom:0 }
        .qbit-cnpt-name { font-weight:600; white-space:normal; overflow-wrap:anywhere }
        .qbit-cnpt-link { display:block; color:#4b6b88; font-size:12px; overflow-wrap:anywhere; margin-top:3px }
        .qbit-cnpt-status { color:#666; text-align:right; font-size:12px }
        .qbit-cnpt-existence[data-state="exists"] { color:#b3261e; font-weight:600 }
        .qbit-cnpt-existence[data-state="missing"] { color:#227a3b }
        .qbit-cnpt-existence[data-state="error"] { color:#a66a00 }
        .qbit-cnpt-empty { padding:28px; text-align:center; color:#666 }
        .qbit-cnpt-context-menu { position:fixed; z-index:2147483647; min-width:250px; padding:6px; border:1px solid #bbb; border-radius:8px; background:#fff; color:#111; box-shadow:0 8px 28px rgba(0,0,0,.35); font:14px/1.4 system-ui,sans-serif }
        .qbit-cnpt-context-menu button { display:block; width:100%; padding:9px 12px; border:0; border-radius:5px; background:transparent; color:inherit; text-align:left; cursor:pointer }
        .qbit-cnpt-context-menu button:hover { background:#e8f1fb }
        .qbit-cnpt-context-hint { padding:5px 12px; color:#777; font-size:11px }
        @media (max-width:680px) { .qbit-cnpt-toolbar { grid-template-columns:1fr } .qbit-cnpt-item { grid-template-columns:24px minmax(0,1fr) } .qbit-cnpt-status { grid-column:2; text-align:left } }
        @media (prefers-color-scheme:dark) {
            .qbit-cnpt-box { background:#222; color:#eee }
            .qbit-cnpt-box input[type=text], .qbit-cnpt-box input[type=password] { background:#333; color:#eee; border-color:#666 }
            .qbit-cnpt-secondary { background:#555; color:#fff }
            .qbit-cnpt-list { border-color:#666 }
            .qbit-cnpt-item { border-color:#555 }
            .qbit-cnpt-link { color:#8dbbe4 }
            .qbit-cnpt-status, .qbit-cnpt-empty { color:#bbb }
            .qbit-cnpt-context-menu { background:#2b2b2b; color:#eee; border-color:#666 }
            .qbit-cnpt-context-menu button:hover { background:#3d5062 }
            .qbit-cnpt-context-hint { color:#aaa }
        }
    `);

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getOrigin(url) {
        try { return new URL(url).origin; } catch { return url; }
    }

    function qbitRequest(endpoint, method = 'GET', data = null, headers = {}, isLogin = false, binary = false) {
        return new Promise((resolve, reject) => {
            const requestHeaders = {
                Origin: getOrigin(CFG.qbitUrl),
                Referer: `${CFG.qbitUrl}/`,
                ...headers,
            };
            const options = {
                method,
                url: CFG.qbitUrl + endpoint,
                data,
                headers: requestHeaders,
                timeout: REQUEST_TIMEOUT,
                withCredentials: true,
                anonymous: false,
                binary,
                onload: resolve,
                onerror: reject,
                ontimeout: () => reject(new Error('qBittorrent request timeout')),
            };
            if (sid && !isLogin) {
                options.cookie = `SID=${sid}`;
                requestHeaders.Cookie = `SID=${sid}`;
            }
            log(method, options.url);
            GM_xmlhttpRequest(options);
        });
    }

    async function login() {
        const body = `username=${encodeURIComponent(CFG.username)}&password=${encodeURIComponent(CFG.password)}`;
        try {
            const response = await qbitRequest('/api/v2/auth/login', 'POST', body, {
                'Content-Type': 'application/x-www-form-urlencoded',
            }, true);
            if (response.status !== 200 || response.responseText !== 'Ok.') {
                notify(`qBittorrent 登录失败：HTTP ${response.status}`, 'error');
                return false;
            }
            const match = String(response.responseHeaders || '').match(/(?:^|\r?\n)Set-Cookie:\s*SID=([^;]+)/i);
            sid = match ? match[1] : null;
            GM_setValue('qbit_session', sid);
            return true;
        } catch (error) {
            console.error(error);
            notify('无法连接 qBittorrent WebUI', 'error');
            return false;
        }
    }

    async function ensureLogin() {
        try {
            const response = await qbitRequest('/api/v2/app/version');
            if (response.status === 200) return true;
        } catch { /* 继续重新登录 */ }
        sid = null;
        GM_setValue('qbit_session', null);
        return login();
    }

    function normalizeAddOptions(options = {}) {
        return {
            category: options.category === undefined ? CFG.category : String(options.category).trim(),
            autoStart: options.autoStart === undefined ? CFG.autoStart : Boolean(options.autoStart),
            skipChecking: options.skipChecking === undefined ? CFG.skipChecking : Boolean(options.skipChecking),
        };
    }

    function appendCommonParams(params, options = {}) {
        const addOptions = normalizeAddOptions(options);
        if (CFG.savePath) params.append('savepath', CFG.savePath);
        if (addOptions.category) params.append('category', addOptions.category);
        if (CFG.tags) params.append('tags', CFG.tags);
        if (!addOptions.autoStart) {
            params.append('stopped', 'true');
            params.append('paused', 'true');
        }
        params.append('autoTMM', CFG.autoTMM ? 'true' : 'false');
        if (addOptions.skipChecking) params.append('skip_checking', 'true');
    }

    async function retryAfterLogin(request) {
        let response = await request();
        if (response.status === 403) {
            sid = null;
            GM_setValue('qbit_session', null);
            if (await login()) response = await request();
        }
        return response;
    }

    async function addTorrentUrl(url, options = {}, quiet = false) {
        if (!(await ensureLogin())) return false;
        const params = new URLSearchParams();
        params.append('urls', url);
        appendCommonParams(params, options);
        const request = () => qbitRequest('/api/v2/torrents/add', 'POST', params.toString(), {
            'Content-Type': 'application/x-www-form-urlencoded',
        });
        const response = await retryAfterLogin(request);
        // qBittorrent WebAPI 2.14+ 返回 JSON，URL 异步接收时使用 202；旧版返回 200/Ok.。
        const ok = response.status >= 200 && response.status < 300;
        if (!quiet) notify(ok ? '已添加到 qBittorrent' : `添加失败：HTTP ${response.status}`, ok ? 'ok' : 'error');
        if (!ok) console.warn('qBittorrent add URL failed:', response);
        return ok;
    }

    function downloadTorrent(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'arraybuffer',
                withCredentials: true,
                anonymous: false,
                timeout: REQUEST_TIMEOUT,
                onload: response => {
                    if (response.status >= 200 && response.status < 300) resolve(response);
                    else reject(new Error(`PT HTTP ${response.status}`));
                },
                onerror: reject,
                ontimeout: () => reject(new Error('PT torrent download timeout')),
            });
        });
    }

    function bytesLookLikeTorrent(arrayBuffer) {
        return Boolean(arrayBuffer && arrayBuffer.byteLength > 0 && new Uint8Array(arrayBuffer)[0] === 0x64);
    }

    function readBencodeString(bytes, position) {
        let colon = position;
        while (colon < bytes.length && bytes[colon] >= 0x30 && bytes[colon] <= 0x39) colon += 1;
        if (colon === position || bytes[colon] !== 0x3a) throw new Error('Invalid bencode string');
        const lengthText = String.fromCharCode(...bytes.slice(position, colon));
        const length = Number(lengthText);
        const start = colon + 1;
        const end = start + length;
        if (!Number.isSafeInteger(length) || end > bytes.length) throw new Error('Invalid bencode string length');
        return { start, end, next: end };
    }

    function skipBencodeValue(bytes, position, depth = 0) {
        if (depth > 100 || position >= bytes.length) throw new Error('Invalid bencode value');
        const marker = bytes[position];
        if (marker >= 0x30 && marker <= 0x39) return readBencodeString(bytes, position).next;
        if (marker === 0x69) {
            const end = bytes.indexOf(0x65, position + 1);
            if (end < 0) throw new Error('Invalid bencode integer');
            return end + 1;
        }
        if (marker === 0x6c || marker === 0x64) {
            let cursor = position + 1;
            while (cursor < bytes.length && bytes[cursor] !== 0x65) {
                if (marker === 0x64) cursor = readBencodeString(bytes, cursor).next;
                cursor = skipBencodeValue(bytes, cursor, depth + 1);
            }
            if (bytes[cursor] !== 0x65) throw new Error('Unterminated bencode container');
            return cursor + 1;
        }
        throw new Error('Unknown bencode marker');
    }

    function extractInfoDictionary(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        if (bytes[0] !== 0x64) throw new Error('Torrent root is not a dictionary');
        let cursor = 1;
        while (cursor < bytes.length && bytes[cursor] !== 0x65) {
            const key = readBencodeString(bytes, cursor);
            const valueStart = key.next;
            const valueEnd = skipBencodeValue(bytes, valueStart);
            const isInfo = key.end - key.start === 4 &&
                bytes[key.start] === 0x69 && bytes[key.start + 1] === 0x6e &&
                bytes[key.start + 2] === 0x66 && bytes[key.start + 3] === 0x6f;
            if (isInfo) return bytes.slice(valueStart, valueEnd).buffer;
            cursor = valueEnd;
        }
        throw new Error('Torrent info dictionary not found');
    }

    function bytesToHex(buffer) {
        return [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('');
    }

    async function getTorrentInfoHashes(arrayBuffer) {
        const infoDictionary = extractInfoDictionary(arrayBuffer);
        const cryptoApi = globalThis.crypto || window.crypto;
        if (!cryptoApi || !cryptoApi.subtle) throw new Error('Web Crypto API is unavailable');
        const [sha1, sha256] = await Promise.all([
            cryptoApi.subtle.digest('SHA-1', infoDictionary),
            cryptoApi.subtle.digest('SHA-256', infoDictionary),
        ]);
        return new Set([bytesToHex(sha1), bytesToHex(sha256)]);
    }

    function base32ToHex(value) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let bits = 0;
        let accumulator = 0;
        const output = [];
        for (const character of value.toUpperCase().replace(/=+$/, '')) {
            const digit = alphabet.indexOf(character);
            if (digit < 0) return '';
            accumulator = (accumulator << 5) | digit;
            bits += 5;
            if (bits >= 8) {
                bits -= 8;
                output.push((accumulator >>> bits) & 0xff);
                accumulator &= bits ? (1 << bits) - 1 : 0;
            }
        }
        return output.map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function getMagnetInfoHashes(url) {
        const hashes = new Set();
        try {
            for (const exactTopic of new URL(url).searchParams.getAll('xt')) {
                const btih = exactTopic.match(/^urn:btih:([a-z2-7]{32}|[a-f0-9]{40})$/i);
                if (btih) hashes.add(btih[1].length === 32 ? base32ToHex(btih[1]) : btih[1].toLowerCase());
                const btmh = exactTopic.match(/^urn:btmh:1220([a-f0-9]{64})$/i);
                if (btmh) hashes.add(btmh[1].toLowerCase());
            }
        } catch { /* 无效 Magnet */ }
        hashes.delete('');
        return hashes;
    }

    async function getExistingTorrentHashes() {
        if (!(await ensureLogin())) throw new Error('qBittorrent login failed');
        const response = await retryAfterLogin(() => qbitRequest('/api/v2/torrents/info'));
        if (response.status !== 200) throw new Error(`qBittorrent torrent list HTTP ${response.status}`);
        const hashes = new Set();
        for (const torrent of JSON.parse(response.responseText || '[]')) {
            for (const field of ['hash', 'infohash_v1', 'infohash_v2']) {
                const hash = String(torrent[field] || '').toLowerCase();
                if (hash) hashes.add(hash);
            }
        }
        return hashes;
    }

    async function getItemInfoHashes(item) {
        if (item.infoHashes) return item.infoHashes;
        if (isMagnet(item.url)) {
            item.infoHashes = getMagnetInfoHashes(item.url);
            if (!item.infoHashes.size) throw new Error('Magnet info-hash not found');
            return item.infoHashes;
        }
        if (!item.torrentData) {
            const response = await downloadTorrent(item.url);
            if (!bytesLookLikeTorrent(response.response)) throw new Error('Response is not a torrent file');
            item.torrentData = response.response;
        }
        item.infoHashes = await getTorrentInfoHashes(item.torrentData);
        return item.infoHashes;
    }

    async function torrentExists(item, existingHashes) {
        const itemHashes = await getItemInfoHashes(item);
        return [...itemHashes].some(hash => existingHashes.has(hash));
    }

    function buildMultipartTorrent(arrayBuffer, filename, options = {}) {
        const addOptions = normalizeAddOptions(options);
        const boundary = `----qbitCNPT${Math.random().toString(36).slice(2)}`;
        const encoder = new TextEncoder();
        const chunks = [];
        const pushText = text => chunks.push(encoder.encode(text));
        const field = (name, value) => {
            pushText(`--${boundary}\r\n`);
            pushText(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
            pushText(`${value}\r\n`);
        };

        pushText(`--${boundary}\r\n`);
        pushText(`Content-Disposition: form-data; name="torrents"; filename="${filename.replace(/[\r\n"\\]/g, '_')}"\r\n`);
        pushText('Content-Type: application/x-bittorrent\r\n\r\n');
        chunks.push(new Uint8Array(arrayBuffer));
        pushText('\r\n');
        if (CFG.savePath) field('savepath', CFG.savePath);
        if (addOptions.category) field('category', addOptions.category);
        if (CFG.tags) field('tags', CFG.tags);
        if (!addOptions.autoStart) {
            field('stopped', 'true');
            field('paused', 'true');
        }
        field('autoTMM', CFG.autoTMM ? 'true' : 'false');
        if (addOptions.skipChecking) field('skip_checking', 'true');
        pushText(`--${boundary}--\r\n`);

        const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
        const body = new Uint8Array(length);
        let position = 0;
        for (const chunk of chunks) {
            body.set(chunk, position);
            position += chunk.byteLength;
        }
        return { boundary, body: body.buffer };
    }

    async function uploadTorrent(arrayBuffer, filename, options = {}, quiet = false) {
        if (!(await ensureLogin())) return false;
        const multipart = buildMultipartTorrent(arrayBuffer, filename, options);
        const request = () => qbitRequest('/api/v2/torrents/add', 'POST', multipart.body, {
            'Content-Type': `multipart/form-data; boundary=${multipart.boundary}`,
        }, false, true);
        const response = await retryAfterLogin(request);
        const ok = response.status >= 200 && response.status < 300;
        if (!quiet) notify(ok ? `已添加：${filename}` : `上传 torrent 失败：HTTP ${response.status}`, ok ? 'ok' : 'error');
        if (!ok) console.warn('qBittorrent upload failed:', response);
        return ok;
    }

    function deriveFilename(url) {
        try {
            const parsed = new URL(url, location.href);
            const id = parsed.searchParams.get('id') || parsed.searchParams.get('tid') || '';
            if (id) return `torrent-${id}.torrent`;
            const lastPart = decodeURIComponent(parsed.pathname.split('/').pop() || '');
            if (/\.torrent$/i.test(lastPart)) return lastPart;
        } catch { /* 使用默认名称 */ }
        return 'download.torrent';
    }

    async function sendTorrentLink(url, options = {}, quiet = false) {
        if (!quiet) notify('正在从 PT 获取 torrent…');
        try {
            const response = await downloadTorrent(url);
            if (!bytesLookLikeTorrent(response.response)) {
                log('Response is not bencoded torrent; fallback to URL mode');
                return addTorrentUrl(url, options, quiet);
            }
            return uploadTorrent(response.response, deriveFilename(url), options, quiet);
        } catch (error) {
            console.warn('Direct torrent download failed, fallback to URL:', error);
            return addTorrentUrl(url, options, quiet);
        }
    }

    function isTorrentUrl(url) {
        if (!url) return false;
        const raw = String(url);
        const lower = raw.toLowerCase();
        if (lower.endsWith('.torrent') || lower.includes('.torrent?') || lower.includes('/download/torrent') ||
            lower.includes('/get_torrent') || /\/torrent\/\d+\/download(?:[/?#]|$)/i.test(lower) ||
            /\/torrents\/download\/\d+(?:[/?#]|$)/i.test(lower)) return true;
        try {
            const parsed = new URL(raw, location.href);
            const path = parsed.pathname.toLowerCase();
            const file = path.split('/').filter(Boolean).pop() || '';
            const params = parsed.searchParams;
            const has = (...names) => names.some(name => params.has(name));
            const value = (...names) => {
                for (const name of names) {
                    const current = params.get(name);
                    if (current !== null && current !== '') return current;
                }
                return '';
            };
            const hasTorrentId = Boolean(value('id', 'tid', 'torrentid', 'torrent_id'));
            const hasPrivateKey = has('passkey', 'authkey', 'torrent_pass', 'torrentpass', 'torrent_passkey', 'secure');
            const action = (params.get('action') || '').toLowerCase();
            if (['download.php', 'download_torrent.php', 'downloadtorrent.php', 'dl.php'].includes(file) &&
                (hasTorrentId || hasPrivateKey || has('hash', 'torrent_hash', 'torrent'))) return true;
            if (['torrents.php', 'torrent.php'].includes(file) && action === 'download' &&
                (hasTorrentId || hasPrivateKey)) return true;
            if (action === 'download' && (hasPrivateKey || has('torrent', 'torrentid', 'torrent_id', 'torrent_hash'))) return true;
            return /\/(?:torrent|torrents)\/(?:download|dl)\/(?:\d+|[a-f0-9]{20,})(?:[/?#]|$)/i.test(path) ||
                /\/(?:download|download-torrent|download_torrent)\/(?:torrent\/)?(?:\d+|[a-f0-9]{20,})(?:[/?#]|$)/i.test(path);
        } catch { return false; }
    }

    function isMagnet(url) {
        return Boolean(url && String(url).toLowerCase().startsWith('magnet:'));
    }

    function isSpringSundayPage(pageUrl) {
        try {
            const hostname = new URL(pageUrl).hostname.toLowerCase();
            return hostname === 'springsunday.net' || hostname.endsWith('.springsunday.net');
        } catch { return false; }
    }

    function hasNonEmptyPasskey(url) {
        try {
            for (const [name, value] of new URL(url).searchParams) {
                if (name.toLowerCase() === 'passkey' && value.trim()) return true;
            }
        } catch { /* 无效 URL 不符合条件 */ }
        return false;
    }

    function isDownloadLinkAllowedForSite(url, pageUrl) {
        return getSiteMatcher(pageUrl).isTorrentLink(url, pageUrl);
    }

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function resolveLinkUrl(link, baseUrl) {
        try { return new URL(link.getAttribute('href') || '', baseUrl).href; } catch { return ''; }
    }

    function findResourceName(link, index, baseUrl = location.href, fallbackName = '') {
        if (fallbackName) return fallbackName.slice(0, 300);
        const row = link.closest('tr');
        if (row) {
            const detailLinks = [...row.querySelectorAll('a[href]')]
                .filter(anchor => {
                    const url = resolveLinkUrl(anchor, baseUrl);
                    return anchor !== link && !isTorrentUrl(url) && !isMagnet(url);
                })
                .map(anchor => normalizeText(anchor.textContent || anchor.title || anchor.getAttribute('aria-label')))
                .filter(text => text.length >= 4)
                .sort((a, b) => b.length - a.length);
            const cells = [...row.cells]
                .map(cell => normalizeText(cell.textContent))
                .filter(text => text.length >= 4)
                .sort((a, b) => b.length - a.length);
            const detailTitle = detailLinks[0] || '';
            const rowTitle = cells[0] || '';
            if (detailTitle && rowTitle && rowTitle !== detailTitle && rowTitle.includes(detailTitle)) return rowTitle.slice(0, 300);
            if (rowTitle.length > detailTitle.length) return rowTitle.slice(0, 300);
            if (detailTitle) return detailTitle.slice(0, 300);
        }
        const nearby = link.closest('li, article, section, div');
        const nearbyText = normalizeText(nearby && nearby.textContent);
        return normalizeText(link.title || link.getAttribute('aria-label') || link.textContent) ||
            (nearbyText.length >= 4 ? nearbyText.slice(0, 300) : '') || `Torrent ${index + 1}`;
    }

    function findNexusPhpTorrentName({ link, index, baseUrl, fallbackName = '', detailsPage = false, subtitle = '' }) {
        if (!detailsPage) return findResourceName(link, index, baseUrl, fallbackName);
        const downloadName = normalizeText(link.textContent) || fallbackName || `Torrent ${index + 1}`;
        const nameParts = [`下载：${downloadName}`];
        if (subtitle) nameParts.push(`副标题：${subtitle}`);
        return nameParts.join(' ｜ ');
    }

    function collectDirectTorrentLinks(sourceDocument, baseUrl, fallbackName = '', adapter = getSiteMatcher(baseUrl)) {
        const results = [];
        for (const link of sourceDocument.querySelectorAll('a[href]')) {
            const url = resolveLinkUrl(link, baseUrl);
            if (!adapter.isTorrentLink(url, baseUrl)) continue;
            results.push({
                url,
                name: adapter.getTorrentName({ link, index: results.length, baseUrl, fallbackName }),
            });
        }
        return deduplicateTorrentItems(results);
    }

    function getUrlParameter(url, name) {
        try { return new URL(url).searchParams.get(name) || ''; } catch { return ''; }
    }

    function findLabeledTableRow(sourceDocument, label) {
        return [...sourceDocument.querySelectorAll('tr')].find(row => {
            const firstCell = row.cells && row.cells[0];
            const currentLabel = normalizeText(firstCell && firstCell.textContent).replace(/[：:]$/, '');
            return currentLabel === label;
        }) || null;
    }

    function getLabeledRowValue(row) {
        if (!row || !row.cells) return '';
        return normalizeText([...row.cells].slice(1).map(cell => cell.textContent).join(' '));
    }

    function collectNexusPhpDetailsPage(sourceDocument, pageUrl, fallbackName = '') {
        const downloadRow = findLabeledTableRow(sourceDocument, '下载');
        const subtitle = getLabeledRowValue(findLabeledTableRow(sourceDocument, '副标题'));
        const securedLinksById = new Map();

        // 真正可下载的地址位于“行为”行，必须带有非空 passkey。
        for (const link of sourceDocument.querySelectorAll('a[href]')) {
            const url = resolveLinkUrl(link, pageUrl);
            if (!isDownloadLinkAllowedForSite(url, pageUrl) || isMagnet(url)) continue;
            const id = getUrlParameter(url, 'id');
            if (id && !securedLinksById.has(id)) securedLinksById.set(id, url);
        }

        const results = [];
        if (downloadRow) {
            // “下载”行负责提供文件名；它自身的 URL 没有 passkey，不能直接用于下载。
            for (const link of downloadRow.querySelectorAll('a[href]')) {
                const displayUrl = resolveLinkUrl(link, pageUrl);
                if (!isTorrentUrl(displayUrl)) continue;
                const id = getUrlParameter(displayUrl, 'id');
                const securedUrl = securedLinksById.get(id);
                if (!securedUrl) continue;
                results.push({
                    url: securedUrl,
                    name: getSiteMatcher(pageUrl).getTorrentName({
                        link,
                        index: results.length,
                        baseUrl: pageUrl,
                        fallbackName,
                        detailsPage: true,
                        subtitle,
                    }),
                });
            }
        }

        // 页面结构变化时仍允许原来的通用规则找到“行为”行中的安全下载地址。
        return results.length
            ? deduplicateTorrentItems(results)
            : collectDirectTorrentLinks(sourceDocument, pageUrl, fallbackName);
    }

    function deduplicateTorrentItems(items) {
        const seen = new Set();
        return items.filter(item => {
            if (!item.url || seen.has(item.url)) return false;
            seen.add(item.url);
            return true;
        });
    }

    function isDetailsPageUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.pathname.toLowerCase().endsWith('/details.php') && parsed.searchParams.has('id');
        } catch { return false; }
    }

    function collectNexusPhpUserDetailEntries(sourceDocument, baseUrl) {
        const pageHostname = new URL(baseUrl).hostname.toLowerCase();
        const seen = new Set();
        const entries = [];
        // userdetails.php 中类型图标也可能指向详情页；这里只选红框所示的文字标题链接。
        for (const link of sourceDocument.querySelectorAll('tr td a[href]')) {
            const url = resolveLinkUrl(link, baseUrl);
            const visibleTitle = normalizeText(link.textContent);
            let linkHostname = '';
            try { linkHostname = new URL(url).hostname.toLowerCase(); } catch { /* 跳过无效 URL */ }
            if (visibleTitle.length < 4 || linkHostname !== pageHostname || !isDetailsPageUrl(url) || seen.has(url)) continue;
            seen.add(url);
            const titleCell = link.closest('td');
            const bilingualName = normalizeText(titleCell && titleCell.textContent) || visibleTitle;
            entries.push({
                url,
                name: bilingualName.slice(0, 300),
            });
        }
        return entries;
    }

    function fetchHtmlDocument(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                withCredentials: true,
                anonymous: false,
                timeout: REQUEST_TIMEOUT,
                onload: response => {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(`PT detail HTTP ${response.status}`));
                        return;
                    }
                    resolve(new DOMParser().parseFromString(response.responseText, 'text/html'));
                },
                onerror: reject,
                ontimeout: () => reject(new Error('PT detail page timeout')),
            });
        });
    }

    async function collectNexusPhpFromUserDetails(sourceDocument, pageUrl) {
        const detailEntries = collectNexusPhpUserDetailEntries(sourceDocument, pageUrl);
        const results = [];
        const concurrency = 4;
        for (let start = 0; start < detailEntries.length; start += concurrency) {
            const group = detailEntries.slice(start, start + concurrency);
            const groupResults = await Promise.all(group.map(async entry => {
                try {
                    const detailDocument = await fetchHtmlDocument(entry.url);
                    return collectNexusPhpDetailsPage(detailDocument, entry.url, entry.name);
                } catch (error) {
                    console.warn('Unable to scan NexusPHP detail page:', entry.url, error);
                    return [];
                }
            }));
            results.push(...groupResults.flat());
        }
        return deduplicateTorrentItems(results);
    }

    async function collectWithNexusPhpRules(sourceDocument, pageUrl) {
        const path = new URL(pageUrl).pathname.toLowerCase();
        if (path.endsWith('/userdetails.php')) {
            return collectNexusPhpFromUserDetails(sourceDocument, pageUrl);
        }
        if (path.endsWith('/details.php')) {
            return collectNexusPhpDetailsPage(sourceDocument, pageUrl);
        }
        // torrents.php 以及未知页面使用当前页面直链规则。
        return collectDirectTorrentLinks(sourceDocument, pageUrl);
    }

    const DEFAULT_SITE_ADAPTER = {
        name: '默认（NexusPHP）',
        matches: () => true,
        isTorrentLink: url => isMagnet(url) || isTorrentUrl(url),
        getTorrentName: findNexusPhpTorrentName,
        collect: collectWithNexusPhpRules,
    };

    const SITE_ADAPTERS = [
        {
            name: 'springsunday.net',
            matches: isSpringSundayPage,
            isTorrentLink: (url, pageUrl) =>
                isMagnet(url) || (isTorrentUrl(url) && isSpringSundayPage(pageUrl) && hasNonEmptyPasskey(url)),
            getTorrentName: findNexusPhpTorrentName,
            collect: collectWithNexusPhpRules,
        },
    ];

    function getSiteMatcher(pageUrl) {
        return SITE_ADAPTERS.find(adapter => adapter.matches(pageUrl)) || DEFAULT_SITE_ADAPTER;
    }

    async function collectTorrentLinks() {
        const matcher = getSiteMatcher(location.href);
        const items = await matcher.collect(document, location.href);
        return { items, matcherName: matcher.name };
    }

    async function getQbitCategories() {
        if (!(await ensureLogin())) return [];
        try {
            const response = await retryAfterLogin(() => qbitRequest('/api/v2/torrents/categories'));
            if (response.status !== 200) return [];
            return Object.keys(JSON.parse(response.responseText || '{}')).sort((a, b) => a.localeCompare(b));
        } catch (error) {
            console.warn('Unable to load qBittorrent categories:', error);
            return [];
        }
    }

    function createOverlay(extraClass = '') {
        const overlay = document.createElement('div');
        overlay.className = 'qbit-cnpt-overlay';
        const box = document.createElement('div');
        box.className = `qbit-cnpt-box ${extraClass}`.trim();
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
        return { overlay, box, close };
    }

    async function showBatchDialog(initialResult = null) {
        const suppliedResult = initialResult && Array.isArray(initialResult.items) ? initialResult : null;
        const { box, close } = createOverlay('qbit-cnpt-batch');
        box.innerHTML = suppliedResult
            ? '<h3>正在载入所选 Torrent…</h3><div class="qbit-cnpt-empty">请稍候</div>'
            : '<h3>正在扫描当前页面及关联详情页…</h3><div class="qbit-cnpt-empty">请稍候</div>';
        let items;
        let matcherName;
        try {
            ({ items, matcherName } = suppliedResult || await collectTorrentLinks());
        } catch (error) {
            console.error('Torrent page scan failed:', error);
            box.innerHTML = '<h3>扫描失败</h3><div class="qbit-cnpt-empty">无法解析当前页面，请查看浏览器控制台日志。</div><div class="qbit-cnpt-actions"><button class="qbit-cnpt-secondary" data-act="cancel">关闭</button></div>';
            box.querySelector('[data-act="cancel"]').addEventListener('click', close);
            return;
        }
        box.innerHTML = `
            <h3>批量添加 Torrent（${items.length}）</h3>
            <div class="qbit-cnpt-status" style="text-align:left;margin-bottom:10px">匹配规则：${escapeHtml(matcherName)}</div>
            <div class="qbit-cnpt-toolbar">
                <label>qBittorrent 分类（留空表示无分类）
                    <input id="qbit-batch-category" type="text" list="qbit-batch-categories" value="${escapeHtml(CFG.category)}" autocomplete="off">
                    <datalist id="qbit-batch-categories"></datalist>
                </label>
                <label>Torrent 筛选
                    <input id="qbit-batch-filter" type="text" placeholder="输入多个条件，以空格分隔（全部满足）" autocomplete="off">
                </label>
                <div class="qbit-cnpt-row">
                    <label><input id="qbit-batch-all" type="checkbox" ${items.length ? 'checked' : ''}> 全选</label>
                    <label><input id="qbit-batch-start" type="checkbox" ${CFG.autoStart ? 'checked' : ''}> 添加后立即启动</label>
                    <label><input id="qbit-batch-skip" type="checkbox" ${CFG.skipChecking ? 'checked' : ''}> 跳过 Hash 校验</label>
                    <label><input id="qbit-batch-exists" type="checkbox"> 检查 Torrent 是否存在</label>
                </div>
            </div>
            <div class="qbit-cnpt-list">
                ${items.length ? items.map((item, index) => `
                    <div class="qbit-cnpt-item" data-index="${index}">
                        <input class="qbit-batch-select" type="checkbox" checked aria-label="选择 ${escapeHtml(item.name)}">
                        <div><div class="qbit-cnpt-name">${escapeHtml(item.name)}</div><a class="qbit-cnpt-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a></div>
                        <div class="qbit-cnpt-status"><div class="qbit-cnpt-existence" data-role="existence"></div><div data-role="add-status">待添加</div></div>
                    </div>`).join('') : '<div class="qbit-cnpt-empty">当前页面未找到可能的 Torrent 或 Magnet 下载链接。</div>'}
            </div>
            <div class="qbit-cnpt-actions">
                <button class="qbit-cnpt-secondary" data-act="cancel">取消</button>
                <button class="qbit-cnpt-primary" data-act="add" ${items.length ? '' : 'disabled'}>添加选中项</button>
            </div>`;

        const all = box.querySelector('#qbit-batch-all');
        const filterInput = box.querySelector('#qbit-batch-filter');
        const existenceCheck = box.querySelector('#qbit-batch-exists');
        const rows = [...box.querySelectorAll('.qbit-cnpt-item')];
        const selectedBoxes = [...box.querySelectorAll('.qbit-batch-select')];
        const updateSelectAllState = () => {
            const visibleIndexes = rows.map((row, index) => row.hidden ? -1 : index).filter(index => index >= 0);
            const visibleBoxes = visibleIndexes.map(index => selectedBoxes[index]);
            all.disabled = visibleBoxes.length === 0;
            all.checked = visibleBoxes.length > 0 && visibleBoxes.every(checkbox => checkbox.checked);
            all.indeterminate = visibleBoxes.some(checkbox => checkbox.checked) && !all.checked;
        };
        const applyFilter = () => {
            const conditions = normalizeText(filterInput.value).toLocaleLowerCase().split(' ').filter(Boolean);
            rows.forEach((row, index) => {
                const searchable = `${items[index].name} ${items[index].url}`.toLocaleLowerCase();
                row.hidden = !conditions.every(condition => searchable.includes(condition));
            });
            updateSelectAllState();
        };
        all.addEventListener('change', () => rows.forEach((row, index) => {
            if (!row.hidden) selectedBoxes[index].checked = all.checked;
        }));
        selectedBoxes.forEach(checkbox => checkbox.addEventListener('change', updateSelectAllState));
        filterInput.addEventListener('input', applyFilter);
        box.querySelector('[data-act="cancel"]').addEventListener('click', close);

        let existenceRunId = 0;
        const setExistenceStatus = (index, text, state = '') => {
            const status = rows[index].querySelector('[data-role="existence"]');
            status.textContent = text;
            status.dataset.state = state;
        };
        existenceCheck.addEventListener('change', async () => {
            const runId = ++existenceRunId;
            if (!existenceCheck.checked) {
                rows.forEach((row, index) => setExistenceStatus(index, ''));
                return;
            }
            rows.forEach((row, index) => setExistenceStatus(index, '检查中…'));
            let existingHashes;
            try {
                existingHashes = await getExistingTorrentHashes();
            } catch (error) {
                console.error('Unable to load qBittorrent torrent list:', error);
                if (runId !== existenceRunId || !existenceCheck.checked) return;
                rows.forEach((row, index) => setExistenceStatus(index, '检查失败', 'error'));
                notify('无法获取 qBittorrent Torrent 列表', 'error');
                return;
            }
            const concurrency = 4;
            for (let start = 0; start < items.length; start += concurrency) {
                if (runId !== existenceRunId || !existenceCheck.checked) return;
                const indexes = items.slice(start, start + concurrency).map((item, offset) => start + offset);
                await Promise.all(indexes.map(async index => {
                    try {
                        const exists = await torrentExists(items[index], existingHashes);
                        if (runId === existenceRunId && existenceCheck.checked) {
                            setExistenceStatus(index, exists ? '已存在' : '不存在', exists ? 'exists' : 'missing');
                        }
                    } catch (error) {
                        console.warn('Unable to check torrent existence:', items[index].url, error);
                        if (runId === existenceRunId && existenceCheck.checked) setExistenceStatus(index, '无法检查', 'error');
                    }
                }));
            }
        });

        getQbitCategories().then(categories => {
            const datalist = box.querySelector('#qbit-batch-categories');
            if (!datalist || !document.body.contains(box)) return;
            datalist.innerHTML = categories.map(category => `<option value="${escapeHtml(category)}"></option>`).join('');
        });

        const addButton = box.querySelector('[data-act="add"]');
        addButton.addEventListener('click', async () => {
            const chosen = items.filter((item, index) => !rows[index].hidden && selectedBoxes[index].checked);
            if (!chosen.length) {
                notify('当前筛选结果中没有已选择的 Torrent', 'error');
                return;
            }
            addButton.disabled = true;
            box.querySelector('[data-act="cancel"]').disabled = true;
            const options = {
                category: box.querySelector('#qbit-batch-category').value,
                autoStart: box.querySelector('#qbit-batch-start').checked,
                skipChecking: box.querySelector('#qbit-batch-skip').checked,
            };
            let succeeded = 0;
            for (const item of chosen) {
                const index = items.indexOf(item);
                const status = rows[index].querySelector('[data-role="add-status"]');
                status.textContent = '添加中…';
                let ok = false;
                try {
                    ok = isMagnet(item.url)
                        ? await addTorrentUrl(item.url, options, true)
                        : item.torrentData
                            ? await uploadTorrent(item.torrentData, deriveFilename(item.url), options, true)
                            : await sendTorrentLink(item.url, options, true);
                } catch (error) {
                    console.error('Batch add failed:', item.url, error);
                }
                status.textContent = ok ? '已添加' : '失败';
                if (ok) {
                    succeeded += 1;
                    if (existenceCheck.checked) setExistenceStatus(index, '已存在', 'exists');
                }
            }
            const failed = chosen.length - succeeded;
            notify(`批量添加完成：成功 ${succeeded}，失败 ${failed}`, failed ? 'error' : 'ok');
            addButton.disabled = false;
            box.querySelector('[data-act="cancel"]').disabled = false;
            addButton.textContent = '重试选中项';
        });
    }

    async function interceptLink(event, anchor) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const clickedUrl = resolveLinkUrl(anchor, location.href);
        const matcher = getSiteMatcher(location.href);
        let clickedItem;
        try {
            const pageItems = await matcher.collect(document, location.href);
            clickedItem = pageItems.find(item => item.url === clickedUrl);
        } catch (error) {
            console.warn('Unable to resolve clicked Torrent metadata:', clickedUrl, error);
        }
        if (!clickedItem) {
            clickedItem = {
                url: clickedUrl,
                name: matcher.getTorrentName({ link: anchor, index: 0, baseUrl: location.href, fallbackName: '' }),
            };
        }
        showBatchDialog({ items: [clickedItem], matcherName: `${matcher.name}（当前点击）` });
    }

    function installClickInterceptor() {
        document.addEventListener('click', event => {
            const anchor = event.composedPath
                ? event.composedPath().find(node => node && node.tagName === 'A' && typeof node.href === 'string')
                : event.target.closest && event.target.closest('a[href]');
            if (!anchor || !anchor.href) return;
            if (anchor.closest && anchor.closest('.qbit-cnpt-box, .qbit-cnpt-context-menu')) return;
            if (isDownloadLinkAllowedForSite(anchor.href, location.href)) {
                log('Intercept:', anchor.href);
                interceptLink(event, anchor);
            }
        }, true);
    }

    function installPageContextMenu() {
        let menu = null;
        const closeMenu = () => {
            if (menu) menu.remove();
            menu = null;
        };

        document.addEventListener('contextmenu', event => {
            // Firefox 中 Shift + 右键绕过脚本，保留访问浏览器原生菜单的方式。
            if (event.shiftKey) return;
            event.preventDefault();
            event.stopPropagation();
            closeMenu();
            menu = document.createElement('div');
            menu.className = 'qbit-cnpt-context-menu';
            menu.innerHTML = `
                <button type="button" data-act="scan">📋 扫描本页 Torrent 并批量添加</button>
                <button type="button" data-act="config">⚙️ qBittorrent / CN PT 设置</button>
                <div class="qbit-cnpt-context-hint">Shift + 右键：Firefox 原生菜单</div>`;
            document.body.appendChild(menu);
            const left = Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8);
            const top = Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 8);
            menu.style.left = `${Math.max(8, left)}px`;
            menu.style.top = `${Math.max(8, top)}px`;
            menu.querySelector('[data-act="scan"]').addEventListener('click', () => {
                closeMenu();
                showBatchDialog();
            });
            menu.querySelector('[data-act="config"]').addEventListener('click', () => {
                closeMenu();
                showConfig();
            });
        }, true);

        document.addEventListener('pointerdown', event => {
            if (menu && !menu.contains(event.target)) closeMenu();
        }, true);
        window.addEventListener('blur', closeMenu);
        window.addEventListener('resize', closeMenu);
    }

    function showConfig() {
        const { box, close } = createOverlay();
        box.innerHTML = `
            <h3>qBittorrent / CN PT 设置</h3>
            <label>qBittorrent WebUI URL</label><input id="cfg-url" type="text" value="${escapeHtml(CFG.qbitUrl)}">
            <label>用户名</label><input id="cfg-user" type="text" value="${escapeHtml(CFG.username)}">
            <label>新密码（留空则保留已保存的密码）</label><input id="cfg-pass" type="password" value="" autocomplete="new-password">
            <label>保存路径（可留空）</label><input id="cfg-path" type="text" value="${escapeHtml(CFG.savePath)}">
            <label>默认分类 Category（可留空）</label><input id="cfg-cat" type="text" value="${escapeHtml(CFG.category)}">
            <label>标签 Tags（逗号分隔，可留空）</label><input id="cfg-tags" type="text" value="${escapeHtml(CFG.tags)}">
            <div class="qbit-cnpt-row">
                <label><input id="cfg-start" type="checkbox" ${CFG.autoStart ? 'checked' : ''}> 添加后立即启动</label>
                <label><input id="cfg-tmm" type="checkbox" ${CFG.autoTMM ? 'checked' : ''}> 自动 Torrent 管理</label>
                <label><input id="cfg-skip" type="checkbox" ${CFG.skipChecking ? 'checked' : ''}> 默认跳过 Hash 校验</label>
                <label><input id="cfg-debug" type="checkbox" ${CFG.debug ? 'checked' : ''}> Debug 日志</label>
            </div>
            <div class="qbit-cnpt-actions"><button class="qbit-cnpt-secondary" data-act="cancel">取消</button><button class="qbit-cnpt-primary" data-act="save">保存</button></div>`;
        box.querySelector('[data-act="cancel"]').onclick = close;
        box.querySelector('[data-act="save"]').onclick = () => {
            GM_setValue('qbit_url', box.querySelector('#cfg-url').value.trim().replace(/\/+$/, ''));
            GM_setValue('qbit_username', box.querySelector('#cfg-user').value);
            const newPassword = box.querySelector('#cfg-pass').value;
            if (newPassword !== '') GM_setValue('qbit_password', newPassword);
            GM_setValue('qbit_savepath', box.querySelector('#cfg-path').value.trim());
            GM_setValue('qbit_category', box.querySelector('#cfg-cat').value.trim());
            GM_setValue('qbit_tags', box.querySelector('#cfg-tags').value.trim());
            GM_setValue('qbit_autostart', box.querySelector('#cfg-start').checked);
            GM_setValue('qbit_autotmm', box.querySelector('#cfg-tmm').checked);
            GM_setValue('qbit_skip_checking', box.querySelector('#cfg-skip').checked);
            GM_setValue('qbit_debug', box.querySelector('#cfg-debug').checked);
            sid = null;
            GM_setValue('qbit_session', null);
            close();
            notify('设置已保存', 'ok');
        };
    }

    GM_registerMenuCommand('📋 扫描本页 Torrent 并批量添加', showBatchDialog);
    GM_registerMenuCommand('⚙️ Configure qBittorrent / CN PT', showConfig);
    GM_registerMenuCommand('🔗 Add Torrent/Magnet by URL', () => {
        const url = prompt('输入 torrent 下载 URL 或 magnet:');
        if (!url) return;
        const trimmed = url.trim();
        if (isMagnet(trimmed)) addTorrentUrl(trimmed); else sendTorrentLink(trimmed);
    });
    GM_registerMenuCommand('🔌 Test qBittorrent Connection', async () => {
        notify('正在测试 qBittorrent…');
        if (!(await ensureLogin())) return;
        try {
            const response = await qbitRequest('/api/v2/app/version');
            notify(response.status === 200 ? `qBittorrent ${String(response.responseText).trim()} 连接正常` : `连接异常：HTTP ${response.status}`, response.status === 200 ? 'ok' : 'error');
        } catch (error) {
            console.error(error);
            notify('连接测试失败', 'error');
        }
    });

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                installClickInterceptor();
                installPageContextMenu();
            }, { once: true });
        } else {
            installClickInterceptor();
            installPageContextMenu();
        }
        log('CN PT enhanced interceptor loaded at', location.href);
    }

    init();
})();
