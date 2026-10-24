import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const localHtmlPath = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
const port = 9355;
const userDataDir = 'C:\\Users\\Administrator\\.gemini\\antigravity\\chrome_temp_profile_test';

const chromeProc = spawn(chromePath, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  '--headless=new',
  '--window-size=1920,1080',
  '--no-first-run',
  '--no-default-browser-check',
  localHtmlPath
]);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  await sleep(2500);
  const res = await fetch(`http://127.0.0.1:${port}/json`);
  const list = await res.json();
  const target = list.find(t => t.url && t.url.includes('index.html'));

  if (!target) {
    console.error('Target not found');
    chromeProc.kill();
    process.exit(1);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const cb = pending.get(data.id);
      pending.delete(data.id);
      cb(data);
    }
  };

  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise(r => ws.onopen = r);
  await sleep(2000);

  // Check rendered cards count in DOM
  const domCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = document.querySelectorAll('#cardsContainer [data-id]');
      const title = document.querySelector('#siteTitle')?.innerText;
      const countEl = document.querySelector('#statFilteredCount')?.innerText;
      return {
        title,
        cardsCount: cards.length,
        countText: countEl
      };
    })()`,
    returnByValue: true
  });

  console.log('DOM check result:', domCheck.result?.result?.value);

  // Take screenshot
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result?.data) {
    fs.writeFileSync('preview_screenshot.png', Buffer.from(shot.result.data, 'base64'));
    console.log('Saved preview_screenshot.png!');
  }

  chromeProc.kill();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  chromeProc.kill();
  process.exit(1);
});
