const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://otakudesu.blog';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.5',
  },
});

// ─────────────────────────────────────────────
// Homepage: on-going + complete
// ─────────────────────────────────────────────
async function scrapeHomepage() {
  const { data } = await client.get('/');
  const $ = cheerio.load(data);
  const results = { ongoing: [], complete: [] };

  const mapItem = (_, el) => {
    const $el = $(el);
    return {
      title: $el.find('.jdlflm').text().trim(),
      episode: $el.find('.epz').text().trim(),

      // [FIX] Field bernama "rating" tapi class .epztipe berisi tipe (TV/Movie/OVA).
      // Diganti dari "rating" → "type" agar sesuai isinya.
      type: $el.find('.epztipe').text().trim(),

      releaseDate: $el.find('.newnime').text().trim(),
      thumbnail: $el.find('.thumbz img').attr('src') || '',
      url: $el.find('.thumb a').attr('href') || '',
    };
  };

  $('.rseries').first().find('.venz ul li .detpost').each((i, el) => {
    results.ongoing.push(mapItem(i, el));
  });

  $('.rseries').eq(1).find('.venz ul li .detpost').each((i, el) => {
    results.complete.push(mapItem(i, el));
  });

  return results;
}

// ─────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────
async function searchAnime(query) {
  const { data } = await client.get('/', { params: { s: query } });
  const $ = cheerio.load(data);
  const results = [];

  $('ul.chivsrc li').each((_, el) => {
    const $el = $(el);
    const $link = $el.find('h2 a');
    const $img = $el.find('img');
    const sets = $el.find('.set');

    const genres = [];
    sets.first().find('a').each((__, a) => genres.push($(a).text().trim()));

    results.push({
      title: $link.text().trim(),
      url: $link.attr('href') || '',
      thumbnail: $img.attr('src') || '',
      genres,
      status: sets.eq(1).text().replace('Status', '').replace(':', '').trim(),
      rating: sets.eq(2).text().replace('Rating', '').replace(':', '').trim(),
    });
  });

  return results;
}

// ─────────────────────────────────────────────
// Detail Anime
// ─────────────────────────────────────────────
async function scrapeAnimeDetail(slug) {
  const { data } = await client.get(`/anime/${slug}/`);
  const $ = cheerio.load(data);

  const detail = {
    title: $('.jdlrx h1').text().trim(),
    thumbnail: $('.fotoanime img').attr('src') || '',
    info: {},
    genres: [],
    episodes: [],
    synopsis: $('.sinopc').text().trim() || $('.fotoanime p').first().text().trim(),
  };

  $('.infozingle p span').each((_, el) => {
    const text = $(el).text().trim();
    const colonIdx = text.indexOf(':');
    if (colonIdx > 0) {
      const key = text.slice(0, colonIdx).trim();
      const val = text.slice(colonIdx + 1).trim();
      detail.info[key] = val;
    }
  });

  // [FIX] Versi lama: '.infozingle p').last().find('a') — mengasumsikan genre
  // selalu di paragraf terakhir, yang sangat rapuh. Ganti dengan selector yang
  // mencari <p> yang secara eksplisit mengandung teks "Genre".
  $('.infozingle p').filter((_, el) => {
    return $(el).text().toLowerCase().includes('genre');
  }).find('a').each((_, a) => {
    detail.genres.push($(a).text().trim());
  });

  $('.episodelist ul li').each((_, el) => {
    const $el = $(el);
    const $link = $el.find('span a');
    if ($link.length) {
      detail.episodes.push({
        title: $link.text().trim(),
        url: $link.attr('href') || '',
        date: $el.find('.zeebr').text().trim(),
      });
    }
  });

  return detail;
}

// ─────────────────────────────────────────────
// Detail Episode (streaming + download)
// ─────────────────────────────────────────────

/**
 * Helper: ekstrak metadata dari .infozingle berdasarkan label.
 * [FIX] Versi lama mengulang pola filter + replace yang sama 4 kali,
 * sangat verbose dan sulit dirawat.
 */
function extractMeta($, label) {
  return $('.infozingle p span')
    .filter((_, el) => $(el).text().toLowerCase().startsWith(label.toLowerCase()))
    .text()
    .replace(new RegExp(`^${label}\\s*:\\s*`, 'i'), '')
    .trim();
}

async function scrapeEpisodeDetail(slug) {
  const { data } = await client.get(`/episode/${slug}/`);
  const $ = cheerio.load(data);

  const title = $('h1.posttl').text().trim();
  const embedIframe = $('#pembed .responsive-embed-stream iframe').attr('src') || '';

  const mirrors = {};
  $('.mirrorstream ul').each((_, ul) => {
    const $ul = $(ul);
    const qualityClass = $ul.attr('class') || '';
    const qualityMatch = qualityClass.match(/m(\d+p)/);
    if (!qualityMatch) return;
    const quality = qualityMatch[1];

    mirrors[quality] = [];
    $ul.find('li a').each((__, a) => {
      const $a = $(a);
      const rawData = $a.attr('data-content') || '';
      let parsed = {};
      try {
        parsed = JSON.parse(Buffer.from(rawData, 'base64').toString('utf-8'));
      } catch (_) {
        // Data tidak bisa di-decode; biarkan parsed tetap objek kosong
      }
      mirrors[quality].push({
        host: $a.text().trim(),
        postId: parsed.id || null,
        index: parsed.i ?? null,
        quality: parsed.q || quality,
        isDefault: $a.attr('data-default') === 'true',
      });
    });
  });

  const downloads = [];
  $('.download ul li').each((_, li) => {
    const $li = $(li);
    const qualityLabel = $li.find('strong').text().trim();
    const links = [];
    $li.find('a').each((__, a) => {
      const $a = $(a);
      links.push({ host: $a.text().trim(), url: $a.attr('href') || '' });
    });
    downloads.push({ quality: qualityLabel, fileSize: $li.find('i').text().trim(), links });
  });

  const episodeList = [];
  $('#selectcog option').each((_, opt) => {
    const $opt = $(opt);
    const val = $opt.attr('value') || '';
    if (val && val !== '0') {
      episodeList.push({ title: $opt.text().trim(), url: val });
    }
  });

  const nextEpisodeUrl = $('.flir a[title="Episode Selanjutnya"]').attr('href') || '';
  const seriesUrl = $('.flir a[rel="follow"]').attr('href') || '';

  const genres = [];
  // [FIX] Versi lama: mencari semua <p> yang punya <a>, bisa termasuk <p> lain selain genre
  $('.infozingle p').filter((_, el) => {
    return $(el).text().toLowerCase().includes('genre');
  }).find('a').each((__, a) => {
    genres.push($(a).text().trim());
  });

  return {
    title,
    postedBy: $('.kategoz span').first().text().replace('Posted by', '').trim(),
    releaseTime: $('.kategoz span').eq(1).text().replace('Release on', '').trim(),
    thumbnail: $('.cukder img').attr('src') || '',
    embedStreaming: embedIframe,
    mirrors,
    downloads,
    episodes: episodeList,
    nextEpisodeUrl,
    seriesUrl,
    // [FIX] Menggunakan helper extractMeta agar kode lebih ringkas dan mudah dirawat
    metadata: {
      credit: extractMeta($, 'Credit'),
      encoder: extractMeta($, 'Encoder'),
      duration: extractMeta($, 'Duration'),
      type: extractMeta($, 'Tipe'),
      genres,
    },
  };
}

// ─────────────────────────────────────────────
// Anime List (A-Z)
// ─────────────────────────────────────────────
async function scrapeAnimeList() {
  const { data } = await client.get('/anime-list/');
  const $ = cheerio.load(data);
  const results = {};

  $('.bariskelom').each((_, block) => {
    const $block = $(block);
    const label = $block.find('.barispenz a').first().text().trim();

    const animeList = [];
    $block.find('.penzbar .jdlbar ul li a.hodebgst').each((__, a) => {
      const $a = $(a);
      const titleRaw = $a.attr('title') || $a.text().trim();
      const cleanTitle = titleRaw.replace(/\s*\(Episode.*?\)\s*Subtitle Indonesia\s*$/, '').trim();
      animeList.push({
        title: cleanTitle,
        url: $a.attr('href') || '',
        fullTitle: $a.text().trim(),
      });
    });

    if (label && animeList.length > 0) {
      results[label] = animeList;
    }
  });

  return results;
}

// ─────────────────────────────────────────────
// Jadwal Rilis (per hari)
// ─────────────────────────────────────────────
async function scrapeJadwalRilis() {
  const { data } = await client.get('/jadwal-rilis/');
  const $ = cheerio.load(data);
  const results = {};

  $('.kglist321').each((_, el) => {
    const $el = $(el);
    const day = $el.find('h2').text().trim();
    const animeList = [];

    $el.find('ul li a').each((__, a) => {
      const $a = $(a);
      animeList.push({ title: $a.text().trim(), url: $a.attr('href') || '' });
    });

    if (day && animeList.length > 0) {
      results[day] = animeList;
    }
  });

  return results;
}

// ─────────────────────────────────────────────
// Genre List (semua genre)
// ─────────────────────────────────────────────
async function scrapeGenreList() {
  const { data } = await client.get('/genre-list/');
  const $ = cheerio.load(data);
  const genres = [];

  $('ul.genres li a').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href') || '';
    const slugMatch = href.match(/\/genres\/(.+?)\//);
    genres.push({
      title: $a.text().trim(),
      url: href,
      slug: slugMatch ? slugMatch[1] : '',
    });
  });

  return genres;
}

// ─────────────────────────────────────────────
// Genre Detail (anime per genre + pagination)
// ─────────────────────────────────────────────
async function scrapeGenreDetail(slug, page = 1) {
  const url = page > 1
    ? `/genres/${slug}/page/${page}/`
    : `/genres/${slug}/`;

  const { data } = await client.get(url);
  const $ = cheerio.load(data);

  const animeList = [];

  $('.col-anime-con').each((_, el) => {
    const $el = $(el);

    const genres = [];
    $el.find('.col-anime-genre a').each((__, a) => genres.push($(a).text().trim()));

    // [FIX] Versi lama: synopsisRaw.replace(/^<p>|<\/p>$/g, '').trim()
    // Cheerio .text() sudah menghapus semua tag HTML, sehingga regex ini tidak
    // pernah cocok dan hanya buang-buang proses. Cukup .trim() saja.
    const synopsis = $el.find('.col-synopsis p').text().trim();

    animeList.push({
      title: $el.find('.col-anime-title a').text().trim(),
      url: $el.find('.col-anime-title a').attr('href') || '',
      studio: $el.find('.col-anime-studio').text().trim(),
      episodes: $el.find('.col-anime-eps').text().trim(),
      rating: $el.find('.col-anime-rating').text().trim() || null,
      genres,
      thumbnail: $el.find('.col-anime-cover img').attr('src') || '',
      synopsis,
      season: $el.find('.col-anime-date').text().trim(),
    });
  });

  const pagination = {
    currentPage: page,
    totalPages: page,
    hasNext: false,
    nextPage: null,
    hasPrev: page > 1,
    prevPage: page > 1 ? page - 1 : null,
  };

  const pageLinks = [];
  $('.pagenavix .page-numbers').each((_, el) => {
    const num = parseInt($(el).text().trim(), 10);
    if (!isNaN(num)) pageLinks.push(num);
  });

  if (pageLinks.length > 0) {
    pagination.totalPages = Math.max(...pageLinks);
  }

  pagination.hasNext = $('.pagenavix .next.page-numbers').length > 0;
  if (pagination.hasNext) {
    pagination.nextPage = page + 1;
  }

  return { genre: slug, page: pagination, animeList };
}

module.exports = {
  scrapeHomepage,
  searchAnime,
  scrapeAnimeDetail,
  scrapeEpisodeDetail,
  scrapeAnimeList,
  scrapeJadwalRilis,
  scrapeGenreList,
  scrapeGenreDetail,
};
