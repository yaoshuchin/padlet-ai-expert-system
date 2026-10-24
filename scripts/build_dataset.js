import fs from 'fs';
import path from 'path';

const w1 = JSON.parse(fs.readFileSync('data/net_wishes_52_681.json', 'utf8')).data;
const w2 = JSON.parse(fs.readFileSync('data/net_wishes_2_1236.json', 'utf8')).data;
const allWishes = [...w1, ...w2];

// Sort by date / sort_index descending
allWishes.sort((a, b) => {
  const tA = new Date(a.attributes.published_at || a.attributes.created_at || 0).getTime();
  const tB = new Date(b.attributes.published_at || b.attributes.created_at || 0).getTime();
  return tB - tA;
});

const c1 = JSON.parse(fs.readFileSync('data/net_contributors_2_1237.json', 'utf8')).data || [];
const c2 = JSON.parse(fs.readFileSync('data/net_contributors_2_1399.json', 'utf8')).data || [];
const userMap = {};
for (const c of [...c1, ...c2]) {
  userMap[c.id] = c.attributes?.name || c.attributes?.display_name || c.attributes?.nickname || '匿名教師';
}

function getCategory(title, body, desc) {
  const text = (title + ' ' + body + ' ' + desc).toLowerCase();
  if (/蘇格拉底|解題|提問|考考你/.test(text)) return '思辨解題';
  if (/閱讀理解|課文閱讀|閱讀練習|閱讀小幫手/.test(text)) return '閱讀理解';
  if (/作文|國寫|寫作|批改|批閱|捨不得/.test(text)) return '作文寫作';
  if (/大谷翔平|柯瑞|kobe|羽生結弦|陳傑憲|戴資穎|戴小穎|陳建禎|楊勇緯|彭政閔|梅西|費德勒|丘索維提娜|楊傳廣|紀政|林家正|朱木炎|陳彥博|ben johns|豐田真奈美|黑狗|相撲|籃球|羽球|體育|心肺適能/.test(text)) return '體育運動';
  if (/孫中山|國父|鄭成功|蘇東坡|柳永|劉銘傳|莫札特|蔣渭水|沈葆楨|柳宗元|馬偕|至聖先師|歷史/.test(text)) return '歷史人文';
  if (/眼科|檳榔|健康|飲食|菸酒|成癮|過動症|阿德勒|正念|健體|心靈|心理/.test(text)) return '身心健康';
  if (/郭雪湖|blackpink|王祖藍|石內卜|銀魂|坂田銀時|金秀賢|史考特|伊隆馬|藝術|咖啡/.test(text)) return '藝文名人';
  return '教學輔助';
}

function getPlatform(url) {
  if (!url) return '自訂文章/範例';
  if (url.includes('app.edcafe.ai')) return 'Edcafe AI';
  if (url.includes('poe.com')) return 'Poe';
  if (url.includes('chatgpt.com')) return 'ChatGPT';
  if (url.includes('hf.co') || url.includes('huggingface')) return 'HuggingChat';
  if (url.includes('felo.ai')) return 'Felo AI';
  if (url.includes('padletusercontent') || url.includes('storage.googleapis.com')) return '本機檔案';
  return '其他平台';
}

const cards = [];

for (const w of allWishes) {
  const a = w.attributes;
  const wid = w.id;
  const authorName = userMap[a.author_id] || '研習教師';

  let title = (a.headline || a.subject || a.attachment_link?.title || '').trim();
  if (!title || title === '空白') {
    title = a.attachment_link?.title || '未命名專家機器人';
  }

  const desc = (a.attachment_link?.description || '').trim();
  let rawBody = (a.body || '').trim();
  
  // Extract link if attachment is missing but URL is in body
  let targetUrl = a.attachment || a.attachment_link?.url || a.attachment_link?.canonical_url || '';
  if (!targetUrl && rawBody) {
    const urlMatch = rawBody.match(/https?:\/\/[^\s<>"']+/);
    if (urlMatch) {
      targetUrl = urlMatch[0];
    }
  }

  const platform = getPlatform(targetUrl);
  const category = getCategory(title, rawBody, desc);

  // Check local preview image
  let localImage = '';
  const imgExtensions = ['.jpg', '.png', '.webp'];
  for (const ext of imgExtensions) {
    const candidate = path.join('assets/images', `img_${wid}${ext}`);
    if (fs.existsSync(candidate)) {
      localImage = `assets/images/img_${wid}${ext}`;
      break;
    }
  }

  // Check local file
  let localFile = '';
  const fileExtensions = ['.jpg', '.png', '.webp', '.pdf', '.docx', '.bin'];
  for (const ext of fileExtensions) {
    const candidate = path.join('assets/files', `file_${wid}${ext}`);
    if (fs.existsSync(candidate)) {
      localFile = `assets/files/file_${wid}${ext}`;
      break;
    }
  }

  // If local file is an image and localImage is empty, use localFile
  if (!localImage && localFile && /\.(png|jpg|jpeg|webp)$/i.test(localFile)) {
    localImage = localFile;
  }

  const originalImageUrl = a.attachment_link?.preview_image?.url || a.attachment_link?.image || a.attachment_link?.thumbnail || '';

  // Clean plain text for search
  const cleanBody = rawBody.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();

  cards.push({
    id: wid,
    hashid: a.hashid,
    title,
    author: authorName,
    published_at: a.published_at || a.created_at,
    category,
    platform,
    body: rawBody,
    clean_body: cleanBody,
    description: desc,
    url: targetUrl,
    local_image: localImage,
    local_file: localFile,
    original_image: originalImageUrl,
    color: a.color || 'yellow',
    permalink: a.permalink
  });
}

const boardMetadata = {
  title: 'AI專家系統建置練習',
  subtitle: '從 AI 問答走向教學工作流 · 教師自製 AI 專家機器人成果全集 (Edcafe AI × Poe × ChatGPT)',
  original_url: 'https://padlet.com/inforissuescounseling/ai-ok7vcvfs07ktjwx6',
  creator: '臺中市資訊教育議題分團輔導員 (moodlela)',
  wallpaper: 'assets/images/wallpaper.png',
  total_cards: cards.length,
  stats: {
    platforms: {},
    categories: {}
  },
  cards: cards
};

for (const c of cards) {
  boardMetadata.stats.platforms[c.platform] = (boardMetadata.stats.platforms[c.platform] || 0) + 1;
  boardMetadata.stats.categories[c.category] = (boardMetadata.stats.categories[c.category] || 0) + 1;
}

fs.writeFileSync('data/board_data.json', JSON.stringify(boardMetadata, null, 2), 'utf-8');

const dataJsContent = `// AI 專家系統建置練習 - 本地資料庫
window.PADLET_DATA = ${JSON.stringify(boardMetadata, null, 2)};
`;
fs.writeFileSync('data.js', dataJsContent, 'utf-8');

console.log('Successfully generated clean dataset!');
console.log('Cards count:', cards.length);
console.log('Platform Stats:', boardMetadata.stats.platforms);
console.log('Category Stats:', boardMetadata.stats.categories);
