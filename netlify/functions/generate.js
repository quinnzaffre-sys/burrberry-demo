exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let userBase64, poseBase64, poseLabel;
  try {
    ({ userBase64, poseBase64, poseLabel } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: 'Invalid request body' };
  }

  if (!userBase64 || !poseBase64 || !poseLabel) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: 'API key not configured on server' };
  }

  const prompt = [
    'You are a fashion virtual try-on AI for Burberry.',
    'You are given two images:',
    '  Image 1 — a photo of the user (face and body reference).',
    `  Image 2 — a Burberry campaign photo of a model wearing the Knight Stamp Cotton Hoodie (${poseLabel} pose, lighting, background, and product reference).`,
    '',
    'Generate a single photorealistic image that replaces the model in Image 2 with the user from Image 1.',
    '',
    'Rules:',
    `• Adopt the EXACT ${poseLabel} pose, camera angle, framing, lighting, and background from Image 2.`,
    "• Use the user's face, skin tone, hair, and body proportions from Image 1.",
    '• The user wears the same Burberry Knight Stamp Cotton Hoodie (cornflower blue) exactly as the model in Image 2.',
    "• Match the hoodie's fabric drape, shadows, and fit to the campaign image.",
    '• The result must look like a professional Burberry campaign photo with the user as the model.',
    '• Output only the image — no text, no borders, no watermarks.',
  ].join('\n');

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: userBase64 } },
            { inline_data: { mime_type: 'image/jpeg', data: poseBase64 } },
          ],
        }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      }),
    }
  );

  const data = await geminiRes.json();
  return {
    statusCode: geminiRes.status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
};
