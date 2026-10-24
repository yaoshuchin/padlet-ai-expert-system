import fs from 'fs';
import path from 'path';

const w1 = JSON.parse(fs.readFileSync('data/net_wishes_52_681.json', 'utf8')).data;
const w2 = JSON.parse(fs.readFileSync('data/net_wishes_2_1236.json', 'utf8')).data;
const allWishes = [...w1, ...w2];

const c1 = JSON.parse(fs.readFileSync('data/net_contributors_2_1237.json', 'utf8')).data || [];
const c2 = JSON.parse(fs.readFileSync('data/net_contributors_2_1399.json', 'utf8')).data || [];
const userMap = {};
for (const c of [...c1, ...c2]) {
  userMap[c.id] = c.attributes?.name || c.attributes?.display_name || c.attributes?.nickname || '匿名教師';
}

const imagesDir = 'assets/images';
const filesDir = 'assets/files';
fs.mkdirSync(imagesDir, { recursive: true });
fs.mkdirSync(filesDir, { recursive: true });

async function downloadFile(url, dest) {
  try {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      return true;
    }
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) {
      console.warn(`Failed ${res.status}: ${url}`);
      return false;
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(dest, buffer);
    return true;
  } catch (err) {
    console.warn(`Error downloading ${url}:`, err.message);
    return false;
  }
}

async function main() {
  console.log('Downloading wallpaper...');
  const wallpaperUrl = 'https://padlet.net/wallpapers/v0/5426e89a75088d56c7527ffd4eecb1cb/574255ef/gradientpinkpurle.png';
  await downloadFile(wallpaperUrl, path.join(imagesDir, 'wallpaper.png'));

  console.log(`Processing ${allWishes.length} cards...`);

  let imageSuccess = 0;
  let fileSuccess = 0;

  for (let i = 0; i < allWishes.length; i++) {
    const w = allWishes[i];
    const a = w.attributes;
    const wid = w.id;

    // 1. Check direct file upload
    if (a.attachment && (a.attachment.includes('padletusercontent') || a.attachment.includes('storage.googleapis.com'))) {
      let ext = '.bin';
      try {
        const u = new URL(a.attachment);
        const p = u.pathname.toLowerCase();
        if (p.endsWith('.png')) ext = '.png';
        else if (p.endsWith('.jpg') || p.endsWith('.jpeg')) ext = '.jpg';
        else if (p.endsWith('.webp')) ext = '.webp';
        else if (p.endsWith('.pdf')) ext = '.pdf';
        else if (p.endsWith('.docx')) ext = '.docx';
      } catch (e) {}

      const destFile = path.join(filesDir, `file_${wid}${ext}`);
      const ok = await downloadFile(a.attachment, destFile);
      if (ok) {
        fileSuccess++;
        console.log(`[${i + 1}/${allWishes.length}] Saved file: ${destFile}`);
      }
    }

    // 2. Check preview image
    const pUrl = a.attachment_link?.preview_image?.url || a.attachment_link?.image || a.attachment_link?.thumbnail;
    if (pUrl) {
      let ext = '.jpg';
      if (pUrl.includes('.png')) ext = '.png';
      else if (pUrl.includes('.webp')) ext = '.webp';

      const destImg = path.join(imagesDir, `img_${wid}${ext}`);
      const ok = await downloadFile(pUrl, destImg);
      if (ok) {
        imageSuccess++;
        if (imageSuccess % 20 === 0 || imageSuccess === allWishes.length) {
          console.log(`[${i + 1}/${allWishes.length}] Downloaded ${imageSuccess} images...`);
        }
      }
    }
  }

  console.log(`\nFinished downloading! Images: ${imageSuccess}, Uploaded files: ${fileSuccess}`);
}

main().catch(console.error);
