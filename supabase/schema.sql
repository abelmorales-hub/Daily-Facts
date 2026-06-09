-- ─────────────────────────────────────────────────────────────────────────────
--  supabase/schema.sql  –  Daily Facts
--  Ejecuta esto en el SQL Editor de tu proyecto Supabase
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tabla principal de hechos ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facts (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  date        DATE        NOT NULL,
  category    TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  excerpt     TEXT        NOT NULL,
  full_text   TEXT,
  image_url   TEXT,
  era         TEXT,                  -- Ej: "Siglo XV", "Antigüedad"
  region      TEXT,                  -- Ej: "Europa", "Asia"
  created_at  TIMESTAMPTZ DEFAULT now(),

  -- Un solo hecho por categoría por día
  CONSTRAINT facts_date_category_unique UNIQUE (date, category)
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_facts_date     ON facts (date DESC);
CREATE INDEX IF NOT EXISTS idx_facts_category ON facts (category);
CREATE INDEX IF NOT EXISTS idx_facts_date_cat ON facts (date DESC, category);

-- ── 2. Tabla de usuarios (opcional, para racha en servidor) ──────────────────
CREATE TABLE IF NOT EXISTS users (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  email             TEXT        UNIQUE,
  active_categories TEXT[]      DEFAULT ARRAY['historia'],
  streak_dates      DATE[]      DEFAULT ARRAY[]::DATE[],
  push_token        TEXT,
  notifications_on  BOOLEAN     DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now(),
  last_seen         TIMESTAMPTZ DEFAULT now()
);

-- ── 3. Tabla de lectura (para estadísticas) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS reads (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  fact_id    UUID        REFERENCES facts(id) ON DELETE CASCADE,
  user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  read_at    TIMESTAMPTZ DEFAULT now()
);

-- ── 4. Row Level Security (RLS) ──────────────────────────────────────────────

-- facts: lectura pública, escritura solo desde service_role (cron)
ALTER TABLE facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facts_public_read"
  ON facts FOR SELECT
  USING (true);

CREATE POLICY "facts_service_write"
  ON facts FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- users: solo el propio usuario puede leer/escribir
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_read"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users_own_write"
  ON users FOR ALL
  USING (auth.uid() = id);

-- reads: escritura pública (anon), lectura propia
ALTER TABLE reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reads_insert"
  ON reads FOR INSERT
  WITH CHECK (true);

-- ── 5. Función para obtener el hecho de hoy ──────────────────────────────────
CREATE OR REPLACE FUNCTION get_today_fact(p_category TEXT)
RETURNS SETOF facts
LANGUAGE sql STABLE
AS $$
  SELECT * FROM facts
  WHERE  date     = CURRENT_DATE
  AND    category = p_category
  LIMIT 1;
$$;

-- ── 6. Vista del archivo (últimos 30 hechos por categoría) ───────────────────
CREATE OR REPLACE VIEW archive_view AS
  SELECT
    f.id,
    f.date,
    f.category,
    f.title,
    f.excerpt,
    f.image_url,
    f.era,
    f.region,
    ROW_NUMBER() OVER (PARTITION BY f.category ORDER BY f.date DESC) AS recency_rank
  FROM facts f
  WHERE f.date < CURRENT_DATE
  ORDER BY f.date DESC;

-- ── 7. Datos de ejemplo para probar ─────────────────────────────────────────
INSERT INTO facts (date, category, title, excerpt, full_text, image_url, era, region)
VALUES (
  CURRENT_DATE,
  'historia',
  'La caída del Imperio Romano de Occidente',
  'En el año 476 d.C., el jefe bárbaro Odoacro depuso al último emperador romano. ¿Fue una caída súbita o la culminación de siglos de transformación?',
  'El Imperio Romano de Occidente no cayó de un día para otro. Durante los siglos IV y V, el poder imperial fue cediendo paulatinamente ante las presiones externas de los pueblos germánicos y las tensiones internas de un estado que había crecido más de lo que podía administrar.

El 4 de septiembre del año 476, el caudillo hérulo Odoacro tomó Rávena, la capital imperial, y obligó a Rómulo Augústulo a abdicar. Sin embargo, la imagen del último emperador es profundamente irónica: Rómulo llevaba el nombre del fundador legendario de Roma, y Augústulo era el diminutivo de Augusto, el primer emperador. El niño depuesto no fue ejecutado, sino exiliado a un castillo en el sur de Italia con una pensión.

El historiador Edward Gibbon popularizó esta fecha como el fin de la Antigüedad en su monumental obra del siglo XVIII. Hoy los historiadores debaten si ese momento fue realmente una ruptura o simplemente una transición hacia la Europa medieval. Lo que es indudable es que una idea de Roma sobrevivió en la Iglesia, en el Imperio de Oriente y en el imaginario colectivo de Occidente durante siglos.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Romulus_Augustulus.jpg/640px-Romulus_Augustulus.jpg',
  'Antigüedad tardía, S. V d.C.',
  'Europa, Imperio Romano'
)
ON CONFLICT (date, category) DO NOTHING;
