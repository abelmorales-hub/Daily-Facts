#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  scripts/generate-daily.js
//  Genera el hecho del día para todas las categorías activas y lo guarda en Supabase.
//  Ejecutar cada día a las 06:00 UTC con GitHub Actions o Vercel Cron.
//
//  Variables de entorno necesarias (.env o secretos de GitHub):
//    ANTHROPIC_API_KEY
//    SUPABASE_URL
//    SUPABASE_SERVICE_KEY   ← usa la service_role key, no la anon
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// ── Clientes ────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Categorías activas ───────────────────────────────────────────────────────
const ACTIVE_CATEGORIES = [
  'historia',
  // Descomenta cuando actives cada categoría:
   'misterio',
   'mitologia',
   'crimen',
   'poesia',
   'ciencia',
];

// ── Prompts por categoría ────────────────────────────────────────────────────
const CATEGORY_CONFIG = {
  historia: {
    system: 'Eres un historiador experto. Generas hechos históricos fascinantes, rigurosos y poco conocidos.',
    prompt: (usedTitles) => `
Genera un hecho histórico fascinante para hoy.
NO uses ninguno de estos que ya hemos usado: ${usedTitles.join(', ') || 'ninguno todavía'}.

Responde SOLO con un JSON válido con esta estructura exacta, sin texto adicional:
{
  "title": "Título del hecho (máx 70 caracteres, impactante)",
  "excerpt": "Resumen en 2 frases que engancha (máx 200 caracteres)",
  "full_text": "Artículo completo en 3 párrafos separados por \\n\\n (entre 250-350 palabras total)",
  "image_query": "Término en inglés para buscar imagen en Wikimedia Commons (ej: 'Roman Empire fall 476')",
  "era": "Ejemplo: Siglo XV, Antigüedad, Edad Media, Siglo XX",
  "region": "Zona geográfica principal: Europa, Asia, América, etc."
}`,
  },

  misterio: {
    system: 'Eres un experto en misterios históricos no resueltos.',
    prompt: (usedTitles) => `
Genera un misterio histórico fascinante y documentado (no ficción).
NO uses: ${usedTitles.join(', ') || 'ninguno todavía'}.

Responde SOLO con JSON válido:
{
  "title": "Título intrigante (máx 70 caracteres)",
  "excerpt": "Resumen que genera intriga (máx 200 caracteres)",
  "full_text": "Explicación del misterio en 3 párrafos (250-350 palabras)",
  "image_query": "Término en inglés para Wikimedia Commons",
  "era": "Época del misterio",
  "region": "Lugar principal"
}`,
  },

  mitologia: {
    system: 'Eres un experto en mitología mundial comparada.',
    prompt: (usedTitles) => `
Genera un mito o leyenda fascinante de cualquier cultura del mundo.
NO uses: ${usedTitles.join(', ') || 'ninguno todavía'}.

Responde SOLO con JSON válido:
{
  "title": "Nombre del mito (máx 70 caracteres)",
  "excerpt": "Síntesis del mito (máx 200 caracteres)",
  "full_text": "Narración y contexto en 3 párrafos (250-350 palabras)",
  "image_query": "Término en inglés para Wikimedia Commons",
  "era": "Cultura y período",
  "region": "Cultura de origen"
}`,
  },

  crimen: {
    system: 'Eres un criminólogo que narra casos históricos con respeto y rigor.',
    prompt: (usedTitles) => `
Genera un caso criminal histórico documentado y relevante (mínimo 50 años atrás).
NO uses: ${usedTitles.join(', ') || 'ninguno todavía'}.

Responde SOLO con JSON válido:
{
  "title": "Título del caso (máx 70 caracteres)",
  "excerpt": "Contexto del caso (máx 200 caracteres)",
  "full_text": "Descripción del caso en 3 párrafos con respeto a las víctimas (250-350 palabras)",
  "image_query": "Término en inglés para Wikimedia Commons",
  "era": "Año o década",
  "region": "País o ciudad"
}`,
  },

  poesia: {
    system: 'Eres un crítico literario apasionado por la poesía universal.',
    prompt: (usedTitles) => `
Genera una entrada sobre un poema o poeta fascinante de cualquier época y cultura.
NO uses: ${usedTitles.join(', ') || 'ninguno todavía'}.

Responde SOLO con JSON válido:
{
  "title": "Nombre del poema o poeta (máx 70 caracteres)",
  "excerpt": "Lo que hace único a este poema/poeta (máx 200 caracteres)",
  "full_text": "Análisis y contexto en 3 párrafos (250-350 palabras)",
  "image_query": "Término en inglés para Wikimedia Commons",
  "era": "Siglo y movimiento literario",
  "region": "País o cultura"
}`,
  },

  ciencia: {
    system: 'Eres un divulgador científico que narra la historia de los descubrimientos.',
    prompt: (usedTitles) => `
Genera un hecho científico histórico fascinante: un descubrimiento, experimento o científico notable.
NO uses: ${usedTitles.join(', ') || 'ninguno todavía'}.

Responde SOLO con JSON válido:
{
  "title": "Título del descubrimiento (máx 70 caracteres)",
  "excerpt": "Qué lo hace extraordinario (máx 200 caracteres)",
  "full_text": "Historia del descubrimiento en 3 párrafos (250-350 palabras)",
  "image_query": "Término en inglés para Wikimedia Commons",
  "era": "Año o período",
  "region": "País o institución"
}`,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`\n🗓  Generando hechos para: ${today}\n`);

  for (const category of ACTIVE_CATEGORIES) {
    console.log(`📂 Categoría: ${category}`);

    // 1. Comprobar si ya existe el hecho de hoy
    const { data: existing } = await supabase
      .from('facts')
      .select('id')
      .eq('date', today)
      .eq('category', category)
      .single();

    if (existing) {
      console.log(`   ✅ Ya existe, saltando.\n`);
      continue;
    }

    // 2. Obtener títulos recientes para evitar repeticiones
    const { data: recentFacts } = await supabase
      .from('facts')
      .select('title')
      .eq('category', category)
      .order('date', { ascending: false })
      .limit(30);

    const usedTitles = recentFacts?.map(f => f.title) || [];

    // 3. Generar con Claude
    const config  = CATEGORY_CONFIG[category];
    let factData  = null;
    let attempts  = 0;

    while (!factData && attempts < 10) {
      attempts++;
      try {
        const response = await anthropic.messages.create({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          system:     config.system,
          messages:   [{ role: 'user', content: config.prompt(usedTitles) }],
        });

        const raw  = response.content[0].text.trim();
        const json = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        const candidate = JSON.parse(json);
        console.log(`   🤖 Generado: "${candidate.title}"`);

        // Comprobar imagen y full_text antes de aceptar
        const imageUrl = await getWikimediaImage(candidate.image_query);
        if (!imageUrl || !candidate.full_text) {
          console.log(`   ⚠️  Sin imagen o texto, reintentando...`);
          usedTitles.push(candidate.title);
          continue;
        }

        factData = { ...candidate, imageUrl };
        console.log(`   🖼  Imagen: ${imageUrl}`);

      } catch (e) {
        console.warn(`   ⚠️  Intento ${attempts} fallido:`, e.message);
        if (attempts === 10) throw e;
      }
    }

  

    // 5. Guardar en Supabase
    const { error } = await supabase.from('facts').insert({
      date:       today,
      category,
      title:      factData.title,
      excerpt:    factData.excerpt,
      full_text:  factData.full_text,
      image_url:  factData.imageUrl || null,
      era:        factData.era || null,
      region:     factData.region || null,
    });

    if (error) {
      console.error(`   ❌ Error guardando en Supabase:`, error.message);
    } else {
      console.log(`   ✅ Guardado correctamente.\n`);
    }
  }

  console.log('🏁 Proceso completado.\n');
}

// ─────────────────────────────────────────────────────────────────────────────
//  WIKIMEDIA COMMONS IMAGE SEARCH
// ─────────────────────────────────────────────────────────────────────────────
async function getWikimediaImage(query) {
  if (!query) return null;
  try {
    const url = `https://en.wikipedia.org/w/api.php?` + new URLSearchParams({
      action:      'query',
      generator:   'search',
      gsrsearch:   query,
      gsrnamespace: 6,   // File namespace
      gsrlimit:    5,
      prop:        'imageinfo',
      iiprop:      'url|size',
      iiurlwidth:  800,
      format:      'json',
      origin:      '*',
    });

    const res  = await fetch(url);
    const data = await res.json();
    const pages = Object.values(data?.query?.pages || {});

    const valid = pages
      .filter(p => p.imageinfo?.[0]?.url)
      .filter(p => {
        const u = p.imageinfo[0].url.toLowerCase();
        return !u.includes('.svg') && !u.includes('.ogg') && !u.includes('.ogv');
      });

    return valid[0]?.imageinfo[0]?.thumburl || valid[0]?.imageinfo[0]?.url || null;
  } catch {
    return null;
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
