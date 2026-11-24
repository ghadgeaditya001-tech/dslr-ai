export const DSLR_PROMPT =
  "Transform this uploaded image into an ultra-realistic, high-resolution photograph captured on a full-frame DSLR camera with an 85mm f/1.4 prime lens. Automatically balance the lighting, fix harsh shadows, and apply natural, true-to-life color grading. Create a smooth, authentic shallow depth-of-field (DSLR bokeh) in the background while keeping the main subject in tack-sharp focus. Remove any grain, pixelation, or low-light noise, and restore crisp details in clothing and natural skin texture without artificial over-smoothing or plastic look. Strictly preserve the person's exact facial features, expression, pose, and original background environment—just elevate the overall camera quality to look like a raw, professional studio-grade capture.";

export const MODELS = ['gemini-3.1-flash-image', 'gemini-nano-banana-2.1', 'gemini-3-pro-image'];

export async function enhanceWithGemini(opts: { apiKey: string; model: string; jpegDataUrl: string; signal?: AbortSignal }): Promise<string> {
  const { apiKey, model, jpegDataUrl, signal } = opts;
  if (!apiKey) throw new Error('No API key. Open Settings and paste your Google AI Studio key, or turn on Demo mode.');
  const base64 = jpegDataUrl.replace(/^data:image\/jpeg;base64,/, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: base64 } }, { text: DSLR_PROMPT }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    });
  } catch { throw new Error('Network error. Check your connection and try again.'); }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message || `Request failed (${res.status})`;
    if (res.status === 429) throw new Error(`Quota or rate limit reached: ${msg}`);
    throw new Error(msg);
  }
  if (json?.promptFeedback?.blockReason) throw new Error(`Blocked by safety filter: ${json.promptFeedback.blockReason}`);
  const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
  const d = img?.inlineData ?? img?.inline_data;
  if (!d) {
    const finish = json?.candidates?.[0]?.finishReason;
    const text = parts.find((p) => p.text)?.text;
    throw new Error(text ? `Gemini returned text instead of an image: ${text}` : `Gemini returned no image${finish ? ` (${finish})` : ''}.`);
  }
  return `data:${d.mimeType || d.mime_type || 'image/jpeg'};base64,${d.data}`;
}
