// ─────────────────────────────────────────────────────────────────────────────
//  app.js  –  Daily Facts PWA
//  Depende de: Supabase JS (cargado desde CDN en index.html)
//  Variables de entorno: window.SUPABASE_URL, window.SUPABASE_KEY
// ─────────────────────────────────────────────────────────────────────────────

// ── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL  = window.ENV?.SUPABASE_URL  || 'https://TU_PROYECTO.supabase.co';
const SUPABASE_KEY  = window.ENV?.SUPABASE_KEY  || 'TU_ANON_KEY';
const ANTHROPIC_URL = '/api/expand';   // proxy seguro – nunca expongas la API key al cliente

// ── Categories config ─────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'historia',  label: 'Historia',   emoji: '📜', color: 'cat-historia',  available: true  },
  { key: 'misterio',  label: 'Misterios',  emoji: '🔍', color: 'cat-misterio',  available: true },
  { key: 'mitologia', label: 'Mitología',  emoji: '⚡', color: 'cat-mitologia', available: true },
  { key: 'crimen',    label: 'Crímenes',   emoji: '🩸', color: 'cat-crimen',    available: false },
  { key: 'poesia',    label: 'Poesía',     emoji: '🪶', color: 'cat-poesia',    available: false },
  { key: 'ciencia',   label: 'Ciencia',    emoji: '🔭', color: 'cat-ciencia',   available: false },
];

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  category:     localStorage.getItem('df_category')    || 'historia',
  streak:       JSON.parse(localStorage.getItem('df_streak') || '[]'),
  todayFact:    null,
  archiveFacts: [],
  notifications: localStorage.getItem('df_notif') === 'true',
};

// ── Supabase client ───────────────────────────────────────────────────────
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setTopDate();
  buildStreakBar();
  buildCatGrid();
  buildSettings();
  await loadTodayFact();
  await loadArchive();
  registerServiceWorker();
});

// ─────────────────────────────────────────────────────────────────────────────
//  DATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function setTopDate() {
  const d   = new Date();
  const days   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  document.getElementById('topDate').textContent =
    `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  STREAK
// ─────────────────────────────────────────────────────────────────────────────
function buildStreakBar() {
  const bar  = document.getElementById('streakBar');
  const week = getLast7Days();
  bar.innerHTML = week.map(day => {
    const done = state.streak.includes(day);
    return `<div class="streak-day${done ? ' done' : ''}"></div>`;
  }).join('');
}

function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });
}

function markTodayRead() {
  const today = todayISO();
  if (!state.streak.includes(today)) {
    state.streak.push(today);
    // Keep only last 30 days
    state.streak = state.streak.filter(d => {
      const diff = (new Date() - new Date(d)) / 86400000;
      return diff <= 30;
    });
    localStorage.setItem('df_streak', JSON.stringify(state.streak));
    buildStreakBar();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  LOAD TODAY'S FACT  (desde Supabase)
// ─────────────────────────────────────────────────────────────────────────────
async function loadTodayFact() {
  const { data, error } = await db
    .from('facts')
    .select('*')
    .eq('date', todayISO())
    .eq('category', state.category)
    .single();

  if (error || !data) {
    // Fallback: muestra contenido de demo si Supabase no está configurado
    renderTodayFact(DEMO_FACT);
    return;
  }

  state.todayFact = data;
  renderTodayFact(data);
}

function renderTodayFact(fact) {
  document.getElementById('heroTitle').textContent   = fact.title;
  document.getElementById('heroExcerpt').textContent = fact.excerpt;
  document.getElementById('heroPill').textContent    = CATEGORIES.find(c => c.key === state.category)?.label || 'Historia';
  document.getElementById('heroImg').src             = fact.image_url || '';
  document.getElementById('heroDay').textContent     = `Día ${getDayOfYear()}`;
  markTodayRead();
}

// ─────────────────────────────────────────────────────────────────────────────
//  LOAD ARCHIVE
// ─────────────────────────────────────────────────────────────────────────────
async function loadArchive() {
  const cat = CATEGORIES.find(c => c.key === state.category);
  document.getElementById('archiveTitle').textContent = `Archivo — ${cat?.label || 'Historia'}`;

  const { data, error } = await db
    .from('facts')
    .select('id, date, title, image_url, category')
    .eq('category', state.category)
    .lt('date', todayISO())
    .order('date', { ascending: false })
    .limit(20);

  const facts = (error || !data || data.length === 0) ? DEMO_ARCHIVE : data;
  renderArchive(facts);
}

function renderArchive(facts) {
  const list = document.getElementById('archiveList');
  list.innerHTML = facts.map(f => {
    const dateLabel = formatDateLabel(f.date);
    return `
      <div class="archive-item" onclick="openArchiveFact('${f.id}')">
        <img class="archive-thumb" src="${f.image_url || ''}" alt="${f.title}"
             onerror="this.style.background='var(--bg2)';this.src=''">
        <div>
          <div class="archive-meta">${dateLabel} · ${CATEGORIES.find(c=>c.key===f.category)?.label||''}</div>
          <div class="archive-title">${f.title}</div>
        </div>
      </div>`;
  }).join('');
}

async function openArchiveFact(id) {
  const { data } = await db.from('facts').select('*').eq('id', id).single();
  if (data) openArticleWithFact(data);
}

// ─────────────────────────────────────────────────────────────────────────────
//  ARTICLE MODAL  (con expansión por IA)
// ─────────────────────────────────────────────────────────────────────────────
function openArticle() {
  const fact = state.todayFact || DEMO_FACT;
  openArticleWithFact(fact);
}

function openArticleWithFact(fact) {
  document.getElementById('modalPill').textContent  = CATEGORIES.find(c=>c.key===fact.category)?.label || 'Historia';
  document.getElementById('modalTitle').textContent = fact.title;
  document.getElementById('modalImg').src           = fact.image_url || '';

  // Si ya hay full_text guardado, lo usamos directamente
  if (fact.full_text) {
    renderModalBody(fact.full_text);
  } else {
    // Pedir expansión a la IA en tiempo real
    document.getElementById('modalBody').innerHTML = `
      <div class="modal-loading">
        <div class="spinner"></div>
        <span>Expandiendo el hecho...</span>
      </div>`;
    expandWithAI(fact);
  }

  document.getElementById('articleModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeArticle() {
  document.getElementById('articleModal').classList.remove('open');
  document.body.style.overflow = '';
}

async function expandWithAI(fact) {
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:    fact.title,
        excerpt:  fact.excerpt,
        category: fact.category,
      }),
    });

    if (!res.ok) throw new Error('API error');
    const { text } = await res.json();
    renderModalBody(text);
  } catch (e) {
    renderModalBody(fact.excerpt + '\n\n[Conecta la API para leer el artículo completo]');
  }
}

function renderModalBody(text) {
  const paragraphs = text.split('\n\n').filter(Boolean);
  document.getElementById('modalBody').innerHTML =
    paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
//  CATEGORIES SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function buildCatGrid() {
  const grid = document.getElementById('catGrid');
  grid.innerHTML = CATEGORIES.map(cat => {
    const isActive = cat.key === state.category;
    const locked   = !cat.available ? 'locked' : '';
    const dot      = isActive ? '<span class="cat-active-dot"></span>' : '';
    const sub      = isActive ? 'Activa' : (cat.available ? 'Disponible' : 'Próximamente');
    return `
      <div class="cat-card ${cat.color} ${locked}"
           onclick="${cat.available ? `selectCategory('${cat.key}')` : 'showToast(\"Próximamente\")'}"
           role="button" tabindex="0">
        ${dot}
        <span class="cat-emoji">${cat.emoji}</span>
        <div class="cat-name">${cat.label}</div>
        <div class="cat-sub">${sub}</div>
      </div>`;
  }).join('');
}

async function selectCategory(key) {
  if (key === state.category) return;
  state.category = key;
  localStorage.setItem('df_category', key);
  buildCatGrid();
  showScreen('home', document.querySelector('[data-screen="home"]'));
  await loadTodayFact();
  await loadArchive();
}

// ─────────────────────────────────────────────────────────────────────────────
//  SETTINGS SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function buildSettings() {
  const list = document.getElementById('settingsList');
  list.innerHTML = `
    <div class="settings-item">
      <div class="settings-icon">🔔</div>
      <span class="settings-label">Notificaciones diarias (9h)</span>
      <button class="toggle ${state.notifications ? 'on' : ''}"
              id="notifToggle" onclick="toggleNotifications()"></button>
    </div>
    <div class="settings-item">
      <div class="settings-icon">🌍</div>
      <span class="settings-label">Idioma</span>
      <span class="settings-value">Español</span>
    </div>
    <div class="settings-item">
      <div class="settings-icon">📅</div>
      <span class="settings-label">Racha actual</span>
      <span class="settings-value">${currentStreak()} días 🔥</span>
    </div>
    <div class="settings-item">
      <div class="settings-icon">📖</div>
      <span class="settings-label">Hechos leídos</span>
      <span class="settings-value">${state.streak.length}</span>
    </div>
  `;
}

function currentStreak() {
  let streak = 0;
  const sorted = [...state.streak].sort().reverse();
  for (let i = 0; i < sorted.length; i++) {
    const expected = new Date();
    expected.setDate(expected.getDate() - i);
    if (sorted[i] === expected.toISOString().split('T')[0]) streak++;
    else break;
  }
  return streak;
}

async function toggleNotifications() {
  if (!('Notification' in window)) {
    showToast('Tu navegador no soporta notificaciones');
    return;
  }

  if (!state.notifications) {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { showToast('Permiso denegado'); return; }
    state.notifications = true;
    showToast('Notificaciones activadas ✓');
  } else {
    state.notifications = false;
    showToast('Notificaciones desactivadas');
  }

  localStorage.setItem('df_notif', state.notifications);
  document.getElementById('notifToggle').classList.toggle('on', state.notifications);

  // Registra suscripción push con OneSignal si está configurado
  if (window.OneSignal && state.notifications) {
    OneSignal.push(() => OneSignal.registerForPushNotifications());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHARE
// ─────────────────────────────────────────────────────────────────────────────
async function shareToday() {
  const fact = state.todayFact || DEMO_FACT;
  const shareData = {
    title: '📜 ' + fact.title,
    text:  fact.excerpt,
    url:   window.location.href,
  };

  if (navigator.share) {
    await navigator.share(shareData).catch(() => {});
  } else {
    await navigator.clipboard.writeText(`${fact.title}\n\n${fact.excerpt}\n\n${window.location.href}`);
    showToast('Copiado al portapapeles ✓');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────
function showScreen(name, btn) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// ─────────────────────────────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SERVICE WORKER
// ─────────────────────────────────────────────────────────────────────────────
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.warn);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────────────────────────────────────
function getDayOfYear() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}

function formatDateLabel(dateStr) {
  const d    = new Date(dateStr);
  const diff = Math.floor((new Date() - d) / 86400000);
  if (diff === 1) return 'Ayer';
  if (diff === 0) return 'Hoy';
  return `Hace ${diff} días`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  DEMO DATA  (para cuando Supabase no está configurado)
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_FACT = {
  id:        'demo-1',
  date:      todayISO(),
  category:  'historia',
  title:     'La caída del Imperio Romano de Occidente',
  excerpt:   'En el año 476 d.C., el jefe bárbaro Odoacro depuso al último emperador romano, Rómulo Augústulo. Un evento que los historiadores debaten: ¿fue una caída súbita o una transformación de siglos?',
  image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Romulus_Augustulus.jpg/640px-Romulus_Augustulus.jpg',
  full_text:  null,
};

const DEMO_ARCHIVE = [
  {
    id: 'demo-2', date: (() => { const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().split('T')[0]; })(),
    category: 'historia',
    title: 'La Revolución Francesa y el Reinado del Terror',
    image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Marie_Antoinette_Adult.jpg/640px-Marie_Antoinette_Adult.jpg',
  },
  {
    id: 'demo-3', date: (() => { const d=new Date(); d.setDate(d.getDate()-2); return d.toISOString().split('T')[0]; })(),
    category: 'historia',
    title: 'Gutenberg y la invención de la imprenta',
    image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Gutenberg_Bible%2C_Lenox_Copy%2C_New_York_Public_Library%2C_2009._Pic_01.jpg/640px-Gutenberg_Bible%2C_Lenox_Copy%2C_New_York_Public_Library%2C_2009._Pic_01.jpg',
  },
];
