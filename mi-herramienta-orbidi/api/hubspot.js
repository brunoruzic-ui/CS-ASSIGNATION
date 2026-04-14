export default async function handler(req, res) {
  const token = process.env.HUBSPOT_TOKEN;
  const { path } = req.query;
  
  const url = `https://api.hubapi.com/${path}`;

  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : null,
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error conectando con HubSpot' });
  }
}
