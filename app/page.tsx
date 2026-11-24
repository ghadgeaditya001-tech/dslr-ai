'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { enhanceWithGemini, MODELS } from '@/lib/gemini';
import { cropToAspect, downloadDataUrl, resizeToJpeg, shutterSound } from '@/lib/utils';

type Settings = { apiKey: string; model: string; autoSave: boolean; demo: boolean };
const DEFAULTS: Settings = { apiKey: '', model: MODELS[0], autoSave: true, demo: false };
const RATIOS: Record<string, number> = { '4:3': 4 / 3, '16:9': 16 / 9, '1:1': 1 };
const CSS_RATIO: Record<string, string> = { '4:3': '3 / 4', '16:9': '9 / 16', '1:1': '1 / 1' };
const STEPS = ['Sending to Gemini 3.1 Vision...', 'Applying 85mm f/1.4 bokeh...', 'Grading skin tones & saving...'];
type Shot = { before: string; after: string };

export default function Page() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ratio, setRatio] = useState('4:3');
  const [grid, setGrid] = useState(true);
  const [torch, setTorch] = useState(false);
  const [camError, setCamError] = useState('');
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [showSettings, setShowSettings] = useState(false);
  const [flash, setFlash] = useState(0);
  const [focus, setFocus] = useState<{ x: number; y: number; k: number } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [shot, setShot] = useState<Shot | null>(null);
  const [recent, setRecent] = useState<Shot[]>([]);
  const [toast, setToast] = useState('');
  const [split, setSplit] = useState(50);

  useEffect(() => {
    const envKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
    try { setSettings({ ...DEFAULTS, apiKey: envKey, ...JSON.parse(localStorage.getItem('dslr_settings') || '{}') }); }
    catch { setSettings({ ...DEFAULTS, apiKey: envKey }); }
  }, []);
  const saveSettings = (p: Partial<Settings>) => setSettings((o) => {
    const n = { ...o, ...p }; try { localStorage.setItem('dslr_settings', JSON.stringify(n)); } catch {} return n;
  });
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  const startCamera = useCallback(async () => {
    setCamError(''); setTorch(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (!navigator.mediaDevices?.getUserMedia) { setCamError('Camera needs HTTPS (or localhost) and a supported browser.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
    } catch (e: any) {
      setCamError(e?.name === 'NotAllowedError' ? 'Camera permission denied. Allow camera access in your browser or app settings, then tap Try again.'
        : e?.name === 'NotFoundError' ? 'No camera found on this device.' : `Camera error: ${e?.message || e}`);
    }
  }, [facing]);

  useEffect(() => { if (!shot && !pending) startCamera(); }, [startCamera, shot, pending]);
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    const caps: any = track?.getCapabilities?.();
    if (!caps?.torch) { say('Flash not supported on this camera'); return; }
    try { await track!.applyConstraints({ advanced: [{ torch: !torch } as any] }); setTorch(!torch); } catch { say('Flash unavailable'); }
  };

  const tapFocus = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setFocus({ x: e.clientX - r.left, y: e.clientY - r.top, k: Date.now() });
    try { (streamRef.current?.getVideoTracks()[0] as any)?.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] }); } catch {}
  };

  const process = async (original: string) => {
    setError(''); setPending(original); setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2500);
    try {
      let after: string;
      if (settings.demo) { await new Promise((r) => setTimeout(r, 4500)); after = await mockEnhance(original); }
      else after = await enhanceWithGemini({ apiKey: settings.apiKey, model: settings.model, jpegDataUrl: original });
      const s = { before: original, after };
      setShot(s); setRecent((r) => [s, ...r].slice(0, 20)); setSplit(50);
      if (settings.autoSave) { downloadDataUrl(after); say('Saved to Gallery ✓'); }
    } catch (e: any) { setError(e?.message || 'Something went wrong.'); }
    finally { clearInterval(timer); }
  };

  const capture = () => {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    shutterSound(); setFlash(Date.now());
    const cropped = cropToAspect(v, RATIOS[ratio]);
    process(resizeToJpeg(cropped, cropped.width, cropped.height, 1536, 0.88));
  };

  const processing = pending && !shot;
  return (
    <main className="fixed inset-0 bg-black overflow-hidden select-none">
      {!shot && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="relative max-w-full max-h-full" style={{ aspectRatio: CSS_RATIO[ratio], height: '100%' }} onPointerDown={tapFocus}>
            <video ref={videoRef} playsInline muted className={`absolute inset-0 w-full h-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`} />
            {grid && <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right,transparent 33.2%,rgba(255,255,255,.35) 33.3%,transparent 33.5%,transparent 66.5%,rgba(255,255,255,.35) 66.7%,transparent 66.8%),linear-gradient(to bottom,transparent 33.2%,rgba(255,255,255,.35) 33.3%,transparent 33.5%,transparent 66.5%,rgba(255,255,255,.35) 66.7%,transparent 66.8%)' }} />}
            {focus && <div key={focus.k} className="focus-ring absolute w-16 h-16 -ml-8 -mt-8 border-2 border-amber-lens rounded-md pointer-events-none" style={{ left: focus.x, top: focus.y }} />}
          </div>
        </div>
      )}
      {flash > 0 && <div key={flash} className="flash absolute inset-0 bg-white pointer-events-none z-20" />}

      {!shot && (
        <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4 pb-3 bg-gradient-to-b from-black/70 to-transparent z-10" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
          <button aria-label="Flash" onClick={toggleTorch} className={`w-10 h-10 rounded-full grid place-items-center ${torch ? 'bg-amber-lens text-black' : 'bg-white/10'}`}>⚡</button>
          <div className="flex gap-1 bg-white/10 rounded-full p-1 text-xs">
            {Object.keys(RATIOS).map((r) => (
              <button key={r} onClick={() => setRatio(r)} className={`px-3 py-1.5 rounded-full ${ratio === r ? 'bg-amber-lens text-black font-semibold' : ''}`}>{r}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <button aria-label="Grid" onClick={() => setGrid(!grid)} className={`w-10 h-10 rounded-full grid place-items-center ${grid ? 'bg-white/25' : 'bg-white/10'}`}>#</button>
            <button aria-label="Settings" onClick={() => setShowSettings(true)} className="w-10 h-10 rounded-full bg-white/10 grid place-items-center">⚙</button>
          </div>
        </div>
      )}

      {!shot && (
        <div className="absolute bottom-0 inset-x-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-6 pt-8" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
          {recent.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-4">
              {recent.map((r, i) => (
                <button key={i} onClick={() => { setShot(r); setSplit(50); }} className="shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-white/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.after} alt="Recent shot" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="w-12 h-12" />
            <button aria-label="Shutter" onClick={capture} disabled={!!camError} className="w-20 h-20 rounded-full border-4 border-white grid place-items-center active:scale-95 transition disabled:opacity-40">
              <span className="w-[62px] h-[62px] rounded-full bg-white" />
            </button>
            <button aria-label="Flip camera" onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')} className="w-12 h-12 rounded-full bg-white/10 grid place-items-center text-xl">⟲</button>
          </div>
        </div>
      )}

      {camError && !shot && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/85 p-8 text-center">
          <div><p className="mb-4 text-sm text-stone-300">{camError}</p>
            <button onClick={startCamera} className="px-5 py-2.5 rounded-full bg-amber-lens text-black font-semibold">Try again</button></div>
        </div>
      )}

      {processing && (
        <div className="absolute inset-0 z-30 bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pending!} alt="Captured" className="absolute inset-0 w-full h-full object-contain opacity-60" />
          <div className="absolute inset-0 backdrop-blur-md bg-white/5" />
          {!error && <div className="absolute inset-0 overflow-hidden"><div className="scan-beam" /></div>}
          <div className="absolute inset-x-5 bottom-10 rounded-2xl bg-black/50 backdrop-blur-xl border border-white/15 p-5">
            {error ? (
              <>
                <p className="text-sm text-red-300 mb-4 break-words">{error}</p>
                <div className="flex gap-3">
                  <button onClick={() => process(pending!)} className="flex-1 py-3 rounded-full bg-amber-lens text-black font-semibold">Retry</button>
                  <button onClick={() => { setPending(null); setError(''); }} className="flex-1 py-3 rounded-full bg-white/10">Back to camera</button>
                </div>
              </>
            ) : (
              <ul className="space-y-2 text-sm">
                {STEPS.map((s, i) => (
                  <li key={s} className={i <= step ? 'text-white' : 'text-white/30'}>{i < step ? '✓ ' : i === step ? '◉ ' : '○ '}{s}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {shot && <Compare shot={shot} split={split} setSplit={setSplit}
        onSave={() => { downloadDataUrl(shot.after); say('Saved to Gallery ✓'); }}
        onBack={() => { setShot(null); setPending(null); }} />}

      {showSettings && (
        <div className="absolute inset-0 z-40 bg-black/60" onClick={() => setShowSettings(false)}>
          <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-0 bottom-0 w-[88%] max-w-sm bg-neutral-950 border-l border-white/10 p-5 overflow-y-auto" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 20px)' }}>
            <div className="flex justify-between items-center mb-6"><h2 className="text-lg font-semibold">Settings</h2><button aria-label="Close" onClick={() => setShowSettings(false)} className="text-2xl leading-none">×</button></div>
            <label className="block text-sm text-stone-400 mb-1">Gemini API key</label>
            <input type="password" value={settings.apiKey} onChange={(e) => saveSettings({ apiKey: e.target.value.trim() })} placeholder="Paste Google AI Studio key" className="w-full rounded-lg bg-white/10 px-3 py-2.5 text-sm mb-1 outline-none focus:ring-1 ring-amber-lens" />
            <p className="text-xs text-stone-500 mb-5">Stored only in this browser.</p>
            <label className="block text-sm text-stone-400 mb-1">Model</label>
            <select value={MODELS.includes(settings.model) ? settings.model : 'custom'} onChange={(e) => e.target.value !== 'custom' && saveSettings({ model: e.target.value })} className="w-full rounded-lg bg-white/10 px-3 py-2.5 text-sm mb-2">
              {MODELS.map((m) => <option key={m} value={m} className="text-black">{m}</option>)}
              <option value="custom" className="text-black">Custom</option>
            </select>
            <input value={settings.model} onChange={(e) => saveSettings({ model: e.target.value.trim() })} className="w-full rounded-lg bg-white/10 px-3 py-2 text-xs mb-5" aria-label="Model ID" />
            <Toggle label="Auto-save to gallery" on={settings.autoSave} set={(v) => saveSettings({ autoSave: v })} />
            <Toggle label="Demo mode (no API call)" on={settings.demo} set={(v) => saveSettings({ demo: v })} />
          </div>
        </div>
      )}

      {toast && <div className="absolute z-50 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-white text-black text-sm font-medium shadow-lg" style={{ top: 'calc(env(safe-area-inset-top) + 64px)' }}>{toast}</div>}
    </main>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button onClick={() => set(!on)} className="w-full flex items-center justify-between py-3 text-sm border-t border-white/10">
      <span>{label}</span>
      <span className={`w-11 h-6 rounded-full p-0.5 transition ${on ? 'bg-amber-lens' : 'bg-white/20'}`}><span className={`block w-5 h-5 rounded-full bg-white transition ${on ? 'translate-x-5' : ''}`} /></span>
    </button>
  );
}

function Compare({ shot, split, setSplit, onSave, onBack }: { shot: Shot; split: number; setSplit: (n: number) => void; onSave: () => void; onBack: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const move = (x: number) => { const r = box.current!.getBoundingClientRect(); setSplit(Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100))); };
  return (
    <div className="absolute inset-0 z-30 bg-black flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div ref={box} className="relative flex-1 touch-none overflow-hidden"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX); }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && move(e.clientX)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot.after} alt="DSLR result" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.before} alt="Original" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
        </div>
        <div className="absolute top-0 bottom-0 w-0.5 bg-white" style={{ left: `${split}%` }}>
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-white text-black grid place-items-center text-sm shadow-lg">↔</div>
        </div>
        <span className="absolute top-3 left-3 text-xs bg-black/60 px-2 py-1 rounded-full">Before</span>
        <span className="absolute top-3 right-3 text-xs bg-amber-lens text-black px-2 py-1 rounded-full font-semibold">After</span>
      </div>
      <div className="flex gap-3 p-4">
        <button onClick={onBack} className="flex-1 py-3.5 rounded-full bg-white/10">Back to camera</button>
        <button onClick={onSave} className="flex-1 py-3.5 rounded-full bg-amber-lens text-black font-semibold">Save again</button>
      </div>
    </div>
  );
}

// Demo mode: a canvas "grade" so the whole flow works without an API key.
async function mockEnhance(src: string): Promise<string> {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d')!; g.filter = 'contrast(1.08) saturate(1.12) brightness(1.03)'; g.drawImage(img, 0, 0); g.filter = 'none';
  const v = g.createRadialGradient(c.width / 2, c.height / 2, c.width * 0.25, c.width / 2, c.height / 2, c.width * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = v; g.fillRect(0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.92);
}
