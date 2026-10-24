import { spawn } from 'child_process';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const targetUrl = 'https://padlet.com/inforissuescounseling/ai-ok7vcvfs07ktjwx6';
const port = 9350;
const userDataDir = 'C:\\Users\\Administrator\\.gemini\\antigravity\\chrome_temp_profile_1025';

const chromeProc = spawn(chromePath, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  '--headless=new',
  '--window-size=16000,4000',
  '--no-first-run',
  '--no-default-browser-check',
  targetUrl
]);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Starting headless Chrome...');
  await sleep(3000);

  let wsUrl = '';
  for (let i = 0; i < 25; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const list = await res.json();
      const padletTarget = list.find(t => t.url && t.url.includes('padlet.com'));
      if (padletTarget) {
        wsUrl = padletTarget.webSocketDebuggerUrl;
        console.log('Target found:', padletTarget.url);
        break;
      }
    } catch (e) {}
    await sleep(1000);
  }

  if (!wsUrl) {
    console.error('Could not find debugging target');
    chromeProc.kill();
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl);
  let msgId = 1;
  const pending = new Map();
  const networkRequests = [];

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'Network.responseReceived') {
      const resp = data.params.response;
      if (resp.url.includes('padlet') && (resp.mimeType.includes('json') || resp.url.includes('api') || resp.url.includes('wishes') || resp.url.includes('sections'))) {
        networkRequests.push({
          requestId: data.params.requestId,
          url: resp.url,
          mimeType: resp.mimeType,
          status: resp.status
        });
      }
    }
    if (data.id && pending.has(data.id)) {
      const cb = pending.get(data.id);
      pending.delete(data.id);
      cb(data);
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise(r => ws.onopen = r);
  console.log('Connected to CDP. Enabling Network and Page...');
  await send('Network.enable');
  await send('Page.enable');

  console.log('Reloading page to capture all initial API calls...');
  await send('Page.reload');

  console.log('Waiting 16 seconds for full hydration and columns...');
  await sleep(16000);

  // Set ultra-wide viewport to ensure all horizontal virtual columns render
  await send('Emulation.setDeviceMetricsOverride', {
    width: 16000,
    height: 4000,
    deviceScaleFactor: 1,
    mobile: false
  });
  await sleep(4000);

  console.log('Network requests captured:', networkRequests.length);
  for (let req of networkRequests) {
    try {
      const bodyRes = await send('Network.getResponseBody', { requestId: req.requestId });
      if (bodyRes.result?.body) {
        const fname = req.url.split('/').pop().split('?')[0] || 'response';
        const safeReqId = req.requestId.replace(/[^a-zA-Z0-9]/g, '_').slice(-6);
        fs.writeFileSync(`data/net_${fname}_${safeReqId}.json`, bodyRes.result.body, 'utf-8');
        console.log(`Saved API response: data/net_${fname}_${safeReqId}.json (${req.url})`);
      }
    } catch(e) {
      // Ignored for binary or uncached
    }
  }

  // Evaluate Pinia and DOM state
  const stateRes = await send('Runtime.evaluate', {
    expression: `(() => {
      let piniaStores = {};
      if (window.__PINIA__) {
        const sKeys = Object.keys(window.__PINIA__._s || {});
        for (let k of sKeys) {
          try {
            piniaStores[k] = JSON.parse(JSON.stringify(window.__PINIA__._s[k].$state));
          } catch(e) {}
        }
      }

      let padletState = null;
      if (window.padlet) {
        try {
          padletState = JSON.parse(JSON.stringify(window.padlet));
        } catch(e) {}
      }

      // Check section titles
      const sectionTitles = Array.from(document.querySelectorAll('[data-testid="sectionTitleText"], .surface-section-header__title, h2, h3'))
        .map(el => el.innerText.trim()).filter(Boolean);

      // Check background
      let bgUrl = '';
      const bgEl = document.querySelector('[class*="surface-background"], [style*="background-image"]');
      if (bgEl) {
        const style = window.getComputedStyle(bgEl);
        bgUrl = style.backgroundImage;
      }

      return {
        title: document.title,
        sectionTitles: Array.from(new Set(sectionTitles)),
        piniaStoreKeys: Object.keys(piniaStores),
        piniaStores: piniaStores,
        padletState: padletState,
        bgUrl: bgUrl
      };
    })()`,
    returnByValue: true
  });

  const stateVal = stateRes.result?.result?.value || {};
  console.log('Board Title:', stateVal.title);
  console.log('Sections detected:', stateVal.sectionTitles);
  console.log('Pinia keys:', stateVal.piniaStoreKeys);

  fs.writeFileSync('data/page_state.json', JSON.stringify(stateVal, null, 2), 'utf-8');

  // Dump full outerHTML
  const htmlRes = await send('Runtime.evaluate', {
    expression: 'document.documentElement.outerHTML',
    returnByValue: true
  });
  const html = htmlRes.result?.result?.value || '';
  fs.writeFileSync('data/padlet_rendered.html', html, 'utf-8');
  console.log('Saved data/padlet_rendered.html, size:', html.length);

  chromeProc.kill();
  console.log('Chrome process finished.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error in capture_padlet:', err);
  chromeProc.kill();
  process.exit(1);
});
