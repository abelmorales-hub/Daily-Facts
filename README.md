# 📜 Daily Facts — Guía de instalación completa

Una PWA que muestra un hecho fascinante cada día, generado automáticamente con IA.
Diseñada para escalar a múltiples categorías: historia, misterios, mitología, crímenes, poesía, ciencia.

---

## Estructura del proyecto

```
dailyfacts/
├── app/
│   ├── index.html          ← La app (PWA)
│   ├── app.js              ← Lógica: Supabase + UI + estado
│   ├── sw.js               ← Service Worker (offline + push)
│   ├── manifest.json       ← Config PWA (instalable en móvil)
│   └── api/
│       └── expand.js       ← Serverless function (Vercel) — proxy seguro a Claude
├── scripts/
│   ├── generate-daily.js   ← Cron: genera el hecho del día con Claude
│   └── package.json
├── supabase/
│   └── schema.sql          ← Tablas, RLS y datos de ejemplo
├── .github/
│   └── workflows/
│       └── daily-generate.yml  ← GitHub Action: cron diario 06:00 UTC
├── vercel.json             ← Config de despliegue en Vercel
└── README.md               ← Este archivo
```

---

## Stack (todo gratuito para empezar)

| Servicio | Uso | Plan gratuito |
|----------|-----|---------------|
| **Vercel** | Hosting + Serverless Functions | Ilimitado para proyectos personales |
| **Supabase** | Base de datos PostgreSQL | 500 MB, 2 proyectos |
| **Anthropic API** | Generación de contenido con Claude | Créditos de inicio (~$5) |
| **GitHub Actions** | Cron job diario | 2.000 min/mes |
| **Wikimedia Commons** | Imágenes de dominio público | Gratuito, sin límite |

---

## PASO 1 — Crear la base de datos en Supabase

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta
2. Crea un nuevo proyecto (guarda la contraseña de la base de datos)
3. Ve a **SQL Editor** y pega el contenido de `supabase/schema.sql`
4. Haz clic en **Run** — se crearán las tablas, políticas y datos de ejemplo
5. Ve a **Settings → API** y copia:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_KEY` (para el frontend)
   - **service_role key** → `SUPABASE_SERVICE_KEY` (para el cron, ¡nunca al frontend!)

---

## PASO 2 — Configurar la app

Edita `app/index.html` justo antes de `</body>`:

```html
<script>
  window.ENV = {
    SUPABASE_URL: 'https://TU_PROYECTO.supabase.co',
    SUPABASE_KEY: 'TU_ANON_KEY_AQUI',
  };
</script>
<!-- Supabase JS SDK -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="app.js"></script>
```

> ⚠️ La `anon key` es segura para el frontend (Supabase RLS la protege).
> La `service_role key` NUNCA va al frontend.

---

## PASO 3 — Desplegar en Vercel

```bash
# Instala Vercel CLI si no lo tienes
npm i -g vercel

# Desde la carpeta dailyfacts/
vercel

# Cuando te pregunte, configura:
# - Root directory: app
# - Build command: (vacío)
# - Output directory: .
```

Luego en el dashboard de Vercel → **Settings → Environment Variables**, añade:
```
ANTHROPIC_API_KEY = sk-ant-...
SUPABASE_URL      = https://TU_PROYECTO.supabase.co
SUPABASE_SERVICE_KEY = eyJ...
```

---

## PASO 4 — Configurar el cron de generación

### Opción A: GitHub Actions (recomendado)

1. Sube el proyecto a GitHub
2. Ve a **Settings → Secrets and variables → Actions**
3. Añade los 3 secrets: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
4. El workflow `.github/workflows/daily-generate.yml` se ejecutará automáticamente cada día a las 06:00 UTC

Para ejecutarlo manualmente: **Actions → Generate Daily Facts → Run workflow**

### Opción B: Vercel Cron (alternativa)

Crea `app/api/cron-generate.js`:

```javascript
// Vercel ejecuta esto según el schedule en vercel.json
export default async function handler(req, res) {
  // Verifica que viene de Vercel Cron
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Aquí llamas a la lógica de generate-daily.js adaptada
  res.status(200).json({ ok: true });
}
```

---

## PASO 5 — Generar el primer hecho manualmente

```bash
cd scripts
npm install
cp .env.example .env     # Edita con tus claves
node generate-daily.js
```

`.env`:
```env
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

---

## PASO 6 — Instalar como app en el móvil

1. Abre tu URL de Vercel en Safari (iOS) o Chrome (Android)
2. iOS: pulsa **Compartir → Añadir a pantalla de inicio**
3. Android: pulsa el menú → **Instalar app**

La app aparecerá como cualquier app nativa en tu pantalla de inicio.

---

## Activar una nueva categoría

1. En `scripts/generate-daily.js`, descomenta la categoría en `ACTIVE_CATEGORIES`
2. En `app/app.js`, cambia `available: false` a `available: true` para esa categoría
3. Ejecuta el cron manualmente para generar el primer hecho
4. Despliega con `vercel --prod`

---

## Monetización (cuando tengas usuarios)

- **Freemium**: 1 categoría gratis, el resto con suscripción (~2€/mes con RevenueCat)
- **Sin anuncios como diferenciador**: igual que DailyArt, comunica que es una app limpia
- **Merchandise / comunidad**: Discord de aficionados a la historia, etc.
- **B2B**: licenciar el contenido a apps de educación o museos

---

## Coste estimado en producción

| Elemento | Coste mensual |
|----------|--------------|
| Vercel (hosting) | Gratis |
| Supabase | Gratis hasta 500MB |
| Claude API (6 categorías × 30 días × ~300 tokens) | ~$0.50/mes |
| **Total para empezar** | **~$0.50/mes** |

Con 1.000 usuarios activos: sigue siendo <$5/mes gracias al caché en Supabase.

---

## Licencia

MIT — Úsalo, modifícalo y compártelo libremente.
