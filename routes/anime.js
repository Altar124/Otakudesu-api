const express = require('express');
const router = express.Router();
const {
  scrapeHomepage,
  searchAnime,
  scrapeAnimeDetail,
  scrapeEpisodeDetail,
  scrapeAnimeList,
  scrapeJadwalRilis,
  scrapeGenreList,
  scrapeGenreDetail,
} = require('../services/scraper');

// Regex slug yang aman: huruf, angka, strip, underscore
const SLUG_RE = /^[\w-]+$/;

/**
 * Helper: validasi slug agar tidak menerima path traversal atau karakter berbahaya.
 * [FIX] Sebelumnya tidak ada validasi sama sekali untuk parameter slug.
 */
function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug) && slug.length <= 200;
}

// GET /api/home
router.get('/home', async (req, res) => {
  try {
    const data = await scrapeHomepage();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/search?q=re+zero
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Parameter q diperlukan.' });
    }
    if (query.length > 200) {
      return res.status(400).json({ success: false, error: 'Query terlalu panjang.' });
    }
    const data = await searchAnime(query);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/anime/:slug
router.get('/anime/:slug', async (req, res) => {
  // [FIX] Validasi slug sebelum dikirim ke scraper
  if (!isValidSlug(req.params.slug)) {
    return res.status(400).json({ success: false, error: 'Slug tidak valid.' });
  }
  try {
    const data = await scrapeAnimeDetail(req.params.slug);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/episode/:slug
router.get('/episode/:slug', async (req, res) => {
  // [FIX] Validasi slug
  if (!isValidSlug(req.params.slug)) {
    return res.status(400).json({ success: false, error: 'Slug tidak valid.' });
  }
  try {
    const data = await scrapeEpisodeDetail(req.params.slug);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/anime-list
router.get('/anime-list', async (req, res) => {
  try {
    const data = await scrapeAnimeList();
    const total = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
    res.json({ success: true, total, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/jadwal-rilis
router.get('/jadwal-rilis', async (req, res) => {
  try {
    const data = await scrapeJadwalRilis();
    const total = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
    res.json({ success: true, total, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/genre-list
router.get('/genre-list', async (req, res) => {
  try {
    const data = await scrapeGenreList();
    res.json({ success: true, total: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/genre/:slug?page=1
router.get('/genre/:slug', async (req, res) => {
  // [FIX] Validasi slug
  if (!isValidSlug(req.params.slug)) {
    return res.status(400).json({ success: false, error: 'Slug tidak valid.' });
  }

  const page = parseInt(req.query.page, 10) || 1;

  // [FIX] Versi lama tidak memvalidasi nilai page negatif atau nol
  if (page < 1 || page > 9999) {
    return res.status(400).json({ success: false, error: 'Parameter page tidak valid.' });
  }

  try {
    const data = await scrapeGenreDetail(req.params.slug, page);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
