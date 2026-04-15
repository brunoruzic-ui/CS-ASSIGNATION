export default async function handler(req, res) {
  const hubspotToken = process.env.HUBSPOT_TOKEN;
  const redisUrl = process.env.KV_REST_API_URL;
  const redisToken = process.env.KV_REST_API_TOKEN;

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
        
        // Lector seguro: Arregla los datos corruptos antiguos
        let parsed = [];
        if (d.result) {
            try {
                parsed = typeof d.result === 'string' ? JSON.parse(d.result) : d.result;
                if (typeof parsed === 'string') parsed = JSON.parse(parsed);
            } catch (e) { parsed = []; }
        }
        results[s] = Array.isArray(parsed) ? parsed : [];
      }
      return res.status(200).json(results);
    }

    if (req.method === 'POST' && req.body.action === 'saveStageAssignment') {
      await fetch(`${redisUrl}/set/stage_members:${req.body.stageId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}` },
        // CORRECCIÓN: Un solo stringify para no romper la lista
        body: JSON.stringify(req.body.members)
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
