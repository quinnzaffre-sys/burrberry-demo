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

  const prompt = `You are a photorealistic fashion try-on renderer. Work through the four steps below before generating any output.

━━━ STEP 1 — READ THE PERSON (Image 1) ━━━

Catalogue with forensic accuracy:

FACE & IDENTITY
- Face shape, bone structure, jawline, brow ridge, temple width
- Eyes: shape, colour, lash density, lid crease, spacing
- Nose: bridge width, tip shape, nostril flare
- Lips: fullness, cupid's bow, natural resting expression
- Skin: exact tone, undertone, texture, any distinctive marks
- Hair: every colour tone present, texture, curl pattern, length, natural direction of fall
- Gender presentation — read from the image, do not assume

BODY
- Shoulder width and slope
- Chest/bust width and depth
- Waist definition and position
- Hip width and shape
- Arm length relative to torso
- Overall silhouette and weight distribution
- Muscle definition or softness

━━━ STEP 2 — READ THE GARMENT (Image 2) ━━━

Extract with microscopic precision — you will reproduce this exactly:

- Fabric weave/texture at thread level
- Every colour and tone in the fabric including shadows in the weave
- Every logo, badge, label, embroidery, print — exact position, size, colour, stitching detail
- All hardware: zip teeth, zip pull, drawstring tips, any buttons
- Seam lines, topstitching, panel seams
- Hood structure: how it sits, edge finish, drawstring routing
- Hem and cuff finish
- Natural drape behaviour: how this specific fabric folds and falls under gravity

━━━ STEP 3 — EXTRACT THE POSE (Image 2) ━━━

Map every skeletal landmark from the model:
- Head: tilt, yaw (turn), pitch (nod) — all three axes
- Neck angle relative to spine
- Shoulder line: height differential and rotation
- Each arm: upper arm angle, elbow bend, forearm rotation, wrist angle, hand position, finger curl
- Spine: lumbar curve, thoracic posture, cervical curve
- Hips: lateral tilt and anterior/posterior tilt
- Legs: stance width, knee state, foot placement
- Centre of gravity and overall body lean

━━━ STEP 4 — GENERATE THE COMPOSITE ━━━

PERSON PLACEMENT
- Apply the pose skeleton from Step 3 to the PERSON's body dimensions from Step 1
- Scale every joint position to the person's actual limb lengths — do not use the model's proportions
- The person's body physically determines the final silhouette

HEAD & NECK (critical)
- The head size MUST come from Image 1 — derive it from the person's actual head-to-shoulder ratio
- The neck must flow seamlessly from the person's chin and jaw into their shoulders
- No size mismatch between head and body — the transition must be anatomically correct

GARMENT FIT
- Drape the garment over the person's specific body shape
- Where the person is broader: show authentic fabric tension and stretch
- Where the person is slimmer: show authentic looseness and natural fall
- Logos, seams, and hardware follow the fabric surface — they are not flat overlays
- Preserve every micro-detail from Step 2 exactly as catalogued

SCENE
- Use the exact background, surface, lighting direction, colour temperature, and shadows from Image 2
- Cast the person's shadow accurately into the scene
- Match the camera focal length, depth of field, and colour grade of Image 2
- No trace of the original model from Image 2 should remain

OUTPUT
- One seamless, photorealistic image — professional Burberry campaign quality
- ${poseLabel} pose
- No compositing artefacts, no seams at collar or cuffs
- Skin tone at all exposed areas matches Image 1 exactly
- Output the image only — no text, borders, or watermarks`;

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
