export default async function handler(req, res) {
  // --- USAMOS LOS NOMBRES EXACTOS DE TU FOTO ---
  const hubspotToken = process.env.HUBSPOT_TOKEN;
  const redisUrl = process.env.KV_REST_API_URL; // Antes era UPSTASH_...
  const redisToken = process.env.KV_REST_API_TOKEN; // Antes era UPSTASH_...

  // 1. CHEQUEO DE BBDD (Para el semáforo)
  if (req.query.check === 'db') {
    try {
      const r = await fetch(`${redisUrl}/ping`, { 
        headers: { Authorization: `Bearer ${redisToken}` } 
      });
      return res.status(r.ok ? 200 : 500).json({ status: r.ok });
    } catch (e) { 
      return res.status(500).json({ error: "BBDD no responde", detail: e.message }); 
    }
  }

  // 2. CARGAR ASIGNACIONES
  if (req.query.action === 'loadAllAssignments') {
    try {
      const stages = ['fdk1', 'fdk2', 'fdk3', 'entrega', 'seguimiento'];
      const results = {};
      await Promise.all(stages.map(async s => {
        const r = await fetch(`${redisUrl}/get/stage_members:${s}`, { 
          headers: { Authorization: `Bearer ${redisToken}` } 
        });
        const d = await r.json();
        results[s] = d.result ? JSON.parse(d.result) : [];
      }));
      return res.status(200).json(results);
    } catch (e) { return res.status(500).json({ error: "Error en Redis" }); }
  }

  // 3. GUARDAR ASIGNACIÓN (POST)
  if (req.method === 'POST' && req.body.action === 'saveStageAssignment') {
    try {
      await fetch(`${redisUrl}/set/stage_members:${req.body.stageId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}` },
        body: JSON.stringify(JSON.stringify(req.body.members))
      });
      return res.status(200).json({ ok: true });
    } catch (e) { return res.status(500).json({ error: "No se pudo guardar" }); }
  }

  // 4. PROXY HUBSPOT
  if (req.query.path) {
    try {
      const response = await fetch(`https://api.hubapi.com/${req.query.path}`, {
        method: req.method,
        headers: { 'Authorization': `Bearer ${hubspotToken}`, 'Content-Type': 'application/json' },
        body: req.method === 'POST' ? JSON.stringify(req.body) : undefined
      });
      const data = await response.json();
      return res.status(response.ok ? 200 : response.status).json(data);
    } catch (e) { return res.status(500).json({ error: "HubSpot Fail" }); }
  }
}
