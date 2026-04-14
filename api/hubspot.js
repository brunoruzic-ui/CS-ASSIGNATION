export default async function handler(req, res) {
  const { path } = req.query;
  const hubspotToken = process.env.HUBSPOT_TOKEN;
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // --- ACCIÓN 1: GUARDAR ASIGNACIÓN ---
  if (req.method === 'POST') {
    const { dealId, csName } = req.body;
    
    try {
      // Guardamos en Upstash Redis usando su API REST
      await fetch(`${redisUrl}/set/deal:${dealId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}` },
        body: JSON.stringify(csName)
      });
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Error guardando en Redis' });
    }
  }

  // --- ACCIÓN 2: LEER DE HUBSPOT + CRUZAR DATOS ---
  try {
    const hsResponse = await fetch(`https://api.hubapi.com/${path}`, {
      headers: {
        'Authorization': `Bearer ${hubspotToken}`,
        'Content-Type': 'application/json',
      }
    });

    const data = await hsResponse.json();

    // Si la respuesta tiene resultados (es una lista de deals)
    if (data.results && Array.isArray(data.results)) {
      // Consultamos Redis para cada deal en paralelo
      const resultsWithAssignments = await Promise.all(
        data.results.map(async (deal) => {
          try {
            const redisRes = await fetch(`${redisUrl}/get/deal:${deal.id}`, {
              headers: { Authorization: `Bearer ${redisToken}` }
            });
            const kvData = await redisRes.json();
            
            return {
              ...deal,
              properties: {
                ...deal.properties,
                local_cs_assignment: kvData.result || "" // Inyectamos el CS de nuestra BBDD
              }
            };
          } catch (e) {
            return deal; // Si falla Redis, devolvemos el deal original
          }
        })
      );
      data.results = resultsWithAssignments;
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
