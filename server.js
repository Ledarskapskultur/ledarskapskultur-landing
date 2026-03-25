const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'leads.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

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

app.listen(PORT, () => {
  console.log(`\n✅ Server körs på http://localhost:${PORT}`);
  console.log(`   Landingssida: http://localhost:${PORT}/index.html`);
  console.log(`   Adminportal:  http://localhost:${PORT}/admin.html\n`);
});
