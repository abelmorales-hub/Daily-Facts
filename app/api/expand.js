// ─────────────────────────────────────────────────────────────────────────────
//  api/expand.js  –  Vercel Serverless Function
//  Recibe: { title, excerpt, category }
//  Devuelve: { text } con el artículo completo generado por Claude
//
//  ¡NUNCA pongas ANTHROPIC_API_KEY en el frontend!
//  Esta función corre en el servidor (Vercel) de forma segura.
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, excerpt, category } = req.body;

  if (!title || !excerpt) {
    return res.status(400).json({ error: 'Missing title or excerpt' });
  }

  const categoryPrompts = {
    historia:  'Eres un historiador apasionado que explica hechos históricos con rigor pero de forma narrativa y amena.',
    misterio:  'Eres un investigador que narra misterios históricos con tensión y detalle, respetando los hechos documentados.',
    mitologia: 'Eres un experto en mitología comparada que explica los mitos con su contexto cultural y sus variantes.',
    crimen:    'Eres un criminólogo que narra casos históricos con precisión y respeto hacia las víctimas.',
    poesia:    'Eres un crítico literario que explica poemas y sus autores con pasión y contexto cultural.',
    ciencia:   'Eres un divulgador científico que hace accesible la historia de los descubrimientos más importantes.',
  };

  const systemPrompt = categoryPrompts[category] || categoryPrompts.historia;

  const userPrompt = `
Título: ${title}
Resumen: ${excerpt}

Escribe un artículo completo sobre este hecho de exactamente 3 párrafos. 
Cada párrafo debe tener entre 60 y 90 palabras.
El primer párrafo contextualiza el hecho en su época.
El segundo párrafo describe el acontecimiento en detalle.
El tercer párrafo explica el impacto y legado hasta hoy.
Escribe en español, en segunda persona del plural narrativo, sin subtítulos ni markdown.
Separa los párrafos con una línea en blanco.
  `.trim();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':         'application/json',
        'x-api-key':            process.env.ANTHROPIC_API_KEY,
        'anthropic-version':    '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 700,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    return res.status(200).json({ text });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
