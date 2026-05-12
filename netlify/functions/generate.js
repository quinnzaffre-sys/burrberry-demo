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
    'You are a fashion virtual try-on AI for Burberry. Generate a completely NEW photorealistic image — do not modify or composite onto Image 2.',
    '',
    'You are given:',
    '  Image 1 — the user (provides face, hair, skin tone, and body proportions).',
    `  Image 2 — a Burberry campaign photo (provides the ${poseLabel} pose, camera angle, framing, lighting, and background to replicate, and the jacket as the product reference).`,
    '',
    'Output a single image showing:',
    `  • The FULL BODY of the person from Image 1 — their face, hair, skin tone, and proportions — rendered entirely in the scene.`,
    `  • That person posed EXACTLY as the model in Image 2: same ${poseLabel} pose, same camera angle, same framing, same lighting, same background.`,
    '  • That person wearing the Burberry Reversible Check Hooded Jacket from Image 2 — preserve the check pattern, wave blue colourway, zip, hood, drape, and fit.',
    '',
    'Critical rules:',
    "  • Do NOT perform a face swap. Do NOT paste the user's face onto the existing model body.",
    '  • Generate the complete person from Image 1 as if they are standing in the campaign scene.',
    '  • Remove the original model entirely — every part of them should be replaced by the user.',
    '  • The result must look like a professional Burberry campaign photograph featuring the user.',
    '  • Output only the final image — no text, no borders, no watermarks.',
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
