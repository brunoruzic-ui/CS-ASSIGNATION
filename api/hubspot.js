export default async function handler(req, res) {
  // Asegúrate de que estas variables existen en Vercel
  const hubspotToken = process.env.HUBSPOT_TOKEN;
  const redisUrl = process.env.KV_REST_API_URL;
  const redisToken = process.env.KV_REST_API_TOKEN;

  // 1. Manejo de errores de configuración
  if (!redisUrl || !redisToken) {
    return res.status(500).json({ error: "Faltan variables KV en Vercel" });
  }

  const { path, action } = req.query;

  try {
    // --- LÓGICA DE BASE DE DATOS (REDIS) ---
    if (action === 'loadAllAssignments') {
      const stages = ['fdk1', 'fdk2', 'fdk3', 'entrega', 'seguimiento'];
      const results = {};
      for (const s of stages) {
        const r = await fetch(`${redisUrl}/get/stage_members:${s}`, {
          headers: { Authorization: `Bearer ${redisToken}` }
        });
        const d = await r.json();
        results[s] = d.result ? JSON.parse(d.result) : [];
      }
      return res.status(200).json(results);
    }

    if (req.method === 'POST' && req.body.action === 'saveStageAssignment') {
      await fetch(`${redisUrl}/set/stage_members:${req.body.stageId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}` },
        body: JSON.stringify(JSON.stringify(req.body.members))
      });
      return res.status(200).json({ ok: true });
    }

    // --- LÓGICA DE HUBSPOT ---
    if (path) {
      const hsResponse = await fetch(`https://api.hubapi.com/${path}`, {
        method: req.method,
        headers: {
          'Authorization': `Bearer ${hubspotToken}`,
          'Content-Type': 'application/json'
        },
        // Enviamos el body solo si existe (para el search)
        body: req.method === 'POST' ? JSON.stringify(req.body) : undefined
      });

      const data = await hsResponse.json();
      return res.status(hsResponse.ok ? 200 : hsResponse.status).json(data);
    }

    return res.status(400).json({ error: "Petición no reconocida" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error interno del servidor", details: error.message });
  }
}
