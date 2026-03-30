const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase
const SUPABASE_URL = 'https://rhzpdctiyaiwyzizcbeb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoenBkY3RpeWFpd3p5aXpjYmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MjQ4ODYsImV4cCI6MjA5MDQwMDg4Nn0.83AqASO-CP5hP03-g1YmcogXZquSU0iwKDw9RS9pdmg';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DB_FILE = path.join(__dirname, 'leads.json');
const RECEIPTS_DIR = path.join(__dirname, 'receipts');
const RECEIPTS_DB = path.join(__dirname, 'receipts.json');

if (!fs.existsSync(RECEIPTS_DIR)) fs.mkdirSync(RECEIPTS_DIR);
if (!fs.existsSync(RECEIPTS_DB)) fs.writeFileSync(RECEIPTS_DB, JSON.stringify([]));

const upload = multer({
  storage: multer.diskStorage({
    destination: RECEIPTS_DIR,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
  })
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Init DB file
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

function readLeads() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); }
  catch { return []; }
}

function writeLeads(leads) {
  fs.writeFileSync(DB_FILE, JSON.stringify(leads, null, 2));
}

// POST /api/leads — spara ny förfrågan
app.post('/api/leads', (req, res) => {
  const { name, company, phone, email, role, challenge } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name och email krävs' });

  const lead = {
    id: Date.now(),
    name, company, phone, email, role, challenge,
    status: 'ny',
    createdAt: new Date().toISOString(),
  };

  const leads = readLeads();
  leads.unshift(lead);
  writeLeads(leads);

  console.log(`[NEW LEAD] ${name} — ${company} — ${email}`);
  res.status(201).json({ ok: true });
});

// GET /api/leads — hämta alla leads
app.get('/api/leads', (req, res) => {
  res.json(readLeads());
});

// PATCH /api/leads/:id — uppdatera status
app.patch('/api/leads/:id', (req, res) => {
  const id = Number(req.params.id);
  const leads = readLeads();
  const lead = leads.find(l => l.id === id);
  if (!lead) return res.status(404).json({ error: 'Hittades ej' });
  Object.assign(lead, req.body);
  writeLeads(leads);
  res.json({ ok: true });
});

// DELETE /api/leads/:id
app.delete('/api/leads/:id', (req, res) => {
  const id = Number(req.params.id);
  const leads = readLeads().filter(l => l.id !== id);
  writeLeads(leads);
  res.json({ ok: true });
});

// --- Kvitto-API ---

function readReceipts() {
  try { return JSON.parse(fs.readFileSync(RECEIPTS_DB, 'utf-8')); }
  catch { return []; }
}
function writeReceipts(r) {
  fs.writeFileSync(RECEIPTS_DB, JSON.stringify(r, null, 2));
}

// Spara kvitto via kamera (base64) eller filuppladdning
app.post('/api/receipts', upload.single('image'), (req, res) => {
  let imagePath;

  if (req.file) {
    imagePath = '/receipts/' + req.file.filename;
  } else if (req.body.imageData) {
    const matches = req.body.imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Ogiltigt bildformat' });
    const ext = matches[1];
    const data = Buffer.from(matches[2], 'base64');
    // Use OCR-extracted filename if provided, otherwise timestamp
    let basename = req.body.filename
      ? req.body.filename.replace(/[<>:"\/\\|?*]/g, '_').substring(0, 80)
      : String(Date.now());
    // Ensure unique by appending timestamp
    const filename = basename + '_' + Date.now() + '.' + ext;
    fs.writeFileSync(path.join(RECEIPTS_DIR, filename), data);
    imagePath = '/receipts/' + filename;
  } else {
    return res.status(400).json({ error: 'Ingen bild bifogad' });
  }

  const receipt = {
    id: Date.now(),
    imagePath,
    ocrText: req.body.ocrText || '',
    filename: req.body.filename || '',
    source: req.body.source || 'camera',
    createdAt: new Date().toISOString(),
  };

  const receipts = readReceipts();
  receipts.unshift(receipt);
  writeReceipts(receipts);

  console.log(`[KVITTO] Sparat: ${req.body.filename || imagePath}`);
  res.status(201).json(receipt);
});

// Spara kvitto via multipart FormData (pålitligare för stora bilder)
app.post('/api/receipts/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Ingen bild bifogad' });

  const imagePath = '/receipts/' + req.file.filename;
  const receipt = {
    id: Date.now(),
    imagePath,
    ocrText: '',
    filename: '',
    source: req.body.source || 'camera',
    createdAt: new Date().toISOString(),
  };

  const receipts = readReceipts();
  receipts.unshift(receipt);
  writeReceipts(receipts);

  console.log(`[KVITTO] Sparat via upload: ${imagePath}`);
  res.status(201).json(receipt);
});

// Spara tolkade transaktioner från bild
app.post('/api/transactions', (req, res) => {
  const { transactions, imageData } = req.body;
  if (!transactions) return res.status(400).json({ error: 'Inga transaktioner' });

  let imagePath = null;
  if (imageData) {
    const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1];
      const data = Buffer.from(matches[2], 'base64');
      const filename = 'tx-' + Date.now() + '.' + ext;
      fs.writeFileSync(path.join(RECEIPTS_DIR, filename), data);
      imagePath = '/receipts/' + filename;
    }
  }

  const entry = {
    id: Date.now(),
    transactions,
    imagePath,
    createdAt: new Date().toISOString(),
  };

  const txFile = path.join(__dirname, 'transactions.json');
  let all = [];
  try { all = JSON.parse(fs.readFileSync(txFile, 'utf-8')); } catch {}
  all.unshift(entry);
  fs.writeFileSync(txFile, JSON.stringify(all, null, 2));

  console.log(`[TRANSAKTIONER] ${transactions.length} st sparade`);
  res.status(201).json(entry);
});

// Hämta alla kvitton
app.get('/api/receipts', (req, res) => {
  res.json(readReceipts());
});

// Hämta alla transaktioner
app.get('/api/transactions', (req, res) => {
  const txFile = path.join(__dirname, 'transactions.json');
  try { res.json(JSON.parse(fs.readFileSync(txFile, 'utf-8'))); }
  catch { res.json([]); }
});

// Radera kvitto
// Uppdatera kvitto med OCR-data
app.patch('/api/receipts/:id', (req, res) => {
  const id = Number(req.params.id);
  const receipts = readReceipts();
  const receipt = receipts.find(r => r.id === id);
  if (!receipt) return res.status(404).json({ error: 'Hittades ej' });
  if (req.body.ocrText !== undefined) receipt.ocrText = req.body.ocrText;
  if (req.body.filename) receipt.filename = req.body.filename;
  writeReceipts(receipts);
  console.log(`[KVITTO] Uppdaterat: ${receipt.filename || receipt.id}`);
  res.json({ ok: true });
});

app.delete('/api/receipts/:id', (req, res) => {
  const id = Number(req.params.id);
  const receipts = readReceipts();
  const receipt = receipts.find(r => r.id === id);
  if (receipt) {
    const filePath = path.join(__dirname, receipt.imagePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  writeReceipts(receipts.filter(r => r.id !== id));
  res.json({ ok: true });
});

// ========== SUPABASE API ENDPOINTS ==========

// GET /api/db/:table - Hämta data från vilken tabell som helst
app.get('/api/db/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { data, error } = await supabase.from(table).select('*');

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error(`Error fetching ${req.params.table}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/db/:table - Lägg in ny data
app.post('/api/db/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { data, error } = await supabase
      .from(table)
      .insert([req.body])
      .select();

    if (error) throw error;
    res.status(201).json(data?.[0]);
  } catch (error) {
    console.error(`Error inserting into ${req.params.table}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/db/:table/:id - Hämta en specifik post
app.get('/api/db/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error(`Error fetching from ${req.params.table}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/db/:table/:id - Uppdatera en post
app.patch('/api/db/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const { data, error } = await supabase
      .from(table)
      .update(req.body)
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json(data?.[0]);
  } catch (error) {
    console.error(`Error updating ${req.params.table}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/db/:table/:id - Radera en post
app.delete('/api/db/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    console.error(`Error deleting from ${req.params.table}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Static files serving (must come AFTER API routes)
app.use(express.static(__dirname));
app.use('/receipts', express.static(RECEIPTS_DIR));

// Explicit routes for HTML files (before static middleware is sometimes needed)
app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/kvitton.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'kvitton.html'));
});

// Root route - test that server is working
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ Server körs på http://localhost:${PORT}`);
  console.log(`   Landingssida: http://localhost:${PORT}/index.html`);
  console.log(`   Adminportal:  http://localhost:${PORT}/admin.html`);
  console.log(`   Kvittoapp:    http://localhost:${PORT}/kvitton.html`);
  console.log(`   Dashboard:    http://localhost:${PORT}/dashboard.html\n`);
  console.log(`✅ Supabase ansluten: ${SUPABASE_URL}\n`);
});
