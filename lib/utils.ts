export function resizeToJpeg(source: CanvasImageSource, w: number, h: number, maxW = 1536, q = 0.88): string {
  const scale = Math.min(1, maxW / w);
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
export function cropToAspect(video: HTMLVideoElement, aspect: number) {
  const vw = video.videoWidth, vh = video.videoHeight;
  let sw = vw, sh = vw / aspect;
  if (sh > vh) { sh = vh; sw = vh * aspect; }
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  c.getContext('2d')!.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, sw, sh);
  return c;
}
export function shutterSound() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext; const ctx = new AC();
    const len = ctx.sampleRate * 0.09, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3) * 0.5;
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.start();
  } catch {}
}
export function downloadDataUrl(url: string) {
  const a = document.createElement('a'); a.href = url; a.download = `DSLR_AI_${Date.now()}.jpg`;
  document.body.appendChild(a); a.click(); a.remove();
}
