export default async function handler(req, res) {
  const { path, action } = req.query;
  const hubspotToken = process.env.HUBSPOT_TOKEN;
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // --- 1. ACCIÓN: CARGAR TODAS LAS ASIGNACIONES DE LAS COLUMNAS ---
  // Se activa cuando el frontend pide: /api/hubspot?action=loadAllAssignments
  if (req.method === 'GET' && action === 'loadAllAssignments') {
    const stages = ['fdk1', 'fdk2', 'fdk3', 'entrega', 'seguimiento'];
    const allAssignments = {};

    try {
      await Promise.all(stages.map(async (s) => {
        const r = await fetch(`${redisUrl}/get/stage_members:${s}`, {
          headers: { Authorization: `Bearer ${redisToken}` }
        });
        const data = await r.json();
        // Upstash devuelve el string, lo convertimos a array. Si no hay nada, array vacío.
        allAssignments[s] = data.result ? JSON.parse(data.result) : [];
      }));
      return res.status(200).json(allAssignments);
    } catch (e) {
      return res.status(500).json({ error: "Error cargando Redis" });
    }
  }

  // --- 2. ACCIÓN: GUARDAR UNA COLUMNA (CUANDO ARRASTRAS) ---
  // Se activa con el fetch POST que envía { action: 'saveStageAssignment', ... }
  if (req.method === 'POST' && req.body.action === 'saveStageAssignment') {
    const { stageId, members } = req.body;
    try {
      await fetch(`${redisUrl}/set/stage_members:${stageId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}` },
        body: JSON.stringify(JSON.stringify(members)) // Doble stringify para Redis REST API
      });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: "Error guardando en Redis" });
    }
  }

  // --- 3. PROXY PARA HUBSPOT (LO QUE YA TENÍAS) ---
  // Para los conteos y datos del Pipeline
  if (path) {
    try {
      const hsResponse = await fetch(`https://api.hubapi.com/${path}`, {
        method: req.method,
        headers: {
          'Authorization': `Bearer ${hubspotToken}`,
          'Content-Type': 'application/json',
        },
        body: req.method === 'POST' ? JSON.stringify(req.body) : undefined
      });

      const data = await hsResponse.json();
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(400).json({ error: "Acción no válida" });
}
