const express = require('express');
const cors = require('cors');
const animeRoutes = require('./routes/anime');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware umum ---
app.use(cors());           // [FIX] Package cors sudah ada tapi belum dipakai sama sekali
app.use(express.json());

// --- Rate Limiter sederhana per IP ---
// [FIX] Versi lama: Map entries tidak pernah dihapus → memory leak.
// Map ini terus membengkak seiring bertambahnya unique IP yang masuk.
// Solusi: jalankan cleanup berkala untuk hapus entry IP yang sudah tidak aktif.
const requestCounts = new Map();

const WINDOW_MS = 60_000;   // 1 menit
const MAX_REQUESTS = 30;

// Cleanup setiap 5 menit: hapus entry yang sudah tidak punya timestamp aktif
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of requestCounts.entries()) {
    const active = timestamps.filter(t => now - t < WINDOW_MS);
    if (active.length === 0) {
      requestCounts.delete(ip);   // Hapus IP yang tidak aktif
    } else {
      requestCounts.set(ip, active);
    }
  }
}, 5 * 60_000);

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();

  const prev = requestCounts.get(ip) || [];
  const timestamps = prev.filter(t => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      error: 'Terlalu banyak request, coba lagi nanti.',
    });
  }

  timestamps.push(now);
  requestCounts.set(ip, timestamps);
  next();
});

// --- Routes ---
app.use('/api', animeRoutes);

app.get('/', (req, res) => {
  // [FIX] Versi lama: package.json versi "1.0.0", tapi di sini di-hardcode "2.3.0".
  // Pakai package.json sebagai satu sumber kebenaran.
  const { version, name } = require('./package.json');
  res.json({ name, version, status: 'running' });
});

// --- 404 handler ---
// [FIX] Tidak ada handler untuk route yang tidak ditemukan.
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} tidak ditemukan.` });
});

// --- Global error handler ---
// [FIX] Tidak ada global error handler. Jika ada error tak tertangkap di middleware,
// Express akan mengirim HTML error page bukan JSON.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`otakudesu-api berjalan di http://localhost:${PORT}`);
});
