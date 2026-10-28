/**
 * Vercel Serverless API Route: /api/gemini
 * Allows secure backend calling of Google Gemini 1.5/2.0 Flash API using server-side GEMINI_API_KEY.
 * Runs seamlessly on Vercel's serverless edge.
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, clientKey } = req.body;
    // Prefer environment variable on Vercel, fallback to client-provided key
    const apiKey = process.env.GEMINI_API_KEY || clientKey;

    if (!apiKey) {
      return res.status(400).json({ 
        error: 'No Gemini API key configured. Provide GEMINI_API_KEY in Vercel environment variables or enter it in the app settings.' 
      });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Gemini API error: ${errText}` });
    }

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    return res.status(200).json({ result: candidateText });
  } catch (error) {
    console.error('Serverless Gemini Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
