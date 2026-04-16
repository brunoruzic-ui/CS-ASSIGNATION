export default async function handler(req, res) {
  // --- 1. CAPA DE SEGURIDAD (El Portero) ---
  const internalKey = req.headers['x-api-key']; // Leemos la llave
  
  if (internalKey !== process.env.INTERNAL_API_KEY) {
    // Si no hay llave o es incorrecta, devolvemos un 401 limpio y cortamos la ejecución
    return res.status(401).json({ error: "No autorizado. Intento bloqueado por falta de credenciales internas." });
  }

  // --- 2. CONFIGURACIÓN (Si pasamos el portero) ---
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
        body: JSON.stringify(req.body.members)
      });
      return res.status(200).json({ ok: true });
    }

    // --- LÓGICA DE HUBSPOT ---
    if (action === 'getProjects') {
  const cacheKey = 'hubspot:projects:v2';

  // 1. Intentar caché
  const cached = await fetch(`${redisUrl}/get/${cacheKey}`, {
    headers: { Authorization: `Bearer ${redisToken}` }
  });
  const cachedData = await cached.json();
  if (cachedData.result) {
    try {
      return res.status(200).json(JSON.parse(cachedData.result));
    } catch (e) {}
  }

  // 2. Fetch real a HubSpot — objeto custom projects
  let allResults = [];
  let after = 0;
  let hasMore = true;

  while (hasMore) {
    const hsResponse = await fetch(
      `https://api.hubapi.com/crm/v3/objects/2-110970937/search`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hubspotToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: ['hs_pipeline_stage', 'hs_pipeline'],
          limit: 200,
          after: after
        })
      }
    );
    const data = await hsResponse.json();
    allResults = allResults.concat(data.results || []);
    if (data.paging?.next?.after) {
      after = data.paging.next.after;
    } else {
      hasMore = false;
    }
  }

  const payload = { results: allResults };

  // 3. Guardar en caché 30 min
  await fetch(`${redisUrl}/set/${cacheKey}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: JSON.stringify(payload), ex: 1800 })
  });

  return res.status(200).json(payload);
}

      return res.status(200).json(data);
    }
    
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
