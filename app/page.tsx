'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

const DSLR_PROMPT =
  "Transform this uploaded image into an ultra-realistic, high-resolution photograph captured on a full-frame DSLR camera with an 85mm f/1.4 prime lens. Automatically balance the lighting, fix harsh shadows, and apply natural, true-to-life color grading. Create a smooth, authentic shallow depth-of-field (DSLR bokeh) in the background while keeping the main subject in tack-sharp focus. Remove any grain, pixelation, or low-light noise, and restore crisp details in clothing and natural skin texture without artificial over-smoothing or plastic look. Strictly preserve the person's exact facial features, expression, pose, and original background environment—just elevate the overall camera quality to look like a raw, professional studio-grade capture.";

interface PhotoItem {
  id: string;
  original: string;
  enhanced: string;
  timestamp: number;
}
export default function DSLRCameraApp() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [showGrid, setShowGrid] = useState(true);
  const [flashOn, setFlashOn] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);

  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('gemini-3.1-flash-image');
  const [autoSave, setAutoSave] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [currentRaw, setCurrentRaw] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState<PhotoItem | null>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const [history, setHistory] = useState<PhotoItem[]>([]);
    useEffect(() => {
    try {
      const savedKey = localStorage.getItem('dslr_gemini_key') || '';
      const savedModel = localStorage.getItem('dslr_gemini_model') || 'gemini-3.1-flash-image';
      const savedAuto = localStorage.getItem('dslr_auto_save');
      const savedDemo = localStorage.getItem('dslr_demo_mode');
      setApiKey(savedKey);
      setModelName(savedModel);
      if (savedAuto !== null) setAutoSave(savedAuto === 'true');
      if (savedDemo !== null) setDemoMode(savedDemo === 'true');
    } catch {}
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  };

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError(
        'Camera access blocked. Please allow Camera permission in browser settings and reload.'
      );
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startCamera]);

  const toggleFlash = async () => {
    const nextState = !flashOn;
    setFlashOn(nextState);
    try {
      const track = streamRef.current?.getVideoTracks().at(0);
      if (track && 'applyConstraints' in track) {
        await track.applyConstraints({
          advanced: [{ torch: nextState } as any],
        });
      }
    } catch {}
  };

  const downloadImage = (dataUrl: string) => {
    try {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'DSLR_AI_' + Date.now() + '.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Saved to Gallery ✓');
    } catch {
      showToast('Tap "Save to Gallery" to download');
    }
  };
    const enhanceWithGemini = async (compressedDataUrl: string) => {
    setIsProcessing(true);
    setErrorMsg(null);
    setStatusText('Sending to Gemini 3.1 Vision...');

    try {
      if (demoMode) {
        setStatusText('Applying 85mm f/1.4 DSLR bokeh (Demo)...');
        await new Promise((r) => setTimeout(r, 1800));
        const item: PhotoItem = {
          id: String(Date.now()),
          original: compressedDataUrl,
          enhanced: compressedDataUrl,
          timestamp: Date.now(),
        };
        setActivePhoto(item);
        setHistory((prev) => [item, ...prev]);
        if (autoSave) downloadImage(compressedDataUrl);
        setIsProcessing(false);
        return;
      }

      if (!apiKey.trim()) {
        setIsProcessing(false);
        setShowSettings(true);
        setErrorMsg('Please paste your Google Gemini API Key in Settings first.');
        return;
      }

      const base64Data = compressedDataUrl.split(',').at(1) || '';
      setStatusText('Applying 85mm f/1.4 lens & studio lighting...');

      const apiUrl =
        'https://googleapis.com' +
        modelName.trim() +
        ':generateContent?key=' +
        encodeURIComponent(apiKey.trim());

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: DSLR_PROMPT },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['IMAGE'],
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || 'API Error (' + response.status + ')');
      }

      setStatusText('Finalizing natural skin tones & saving...');
      const parts = data?.candidates?.at(0)?.content?.parts || [];
      const imagePart = parts.find((p: any) => p.inlineData?.data);

      if (!imagePart) {
        throw new Error('Gemini did not return an image. Check model name or API quota.');
      }

      const outMime = imagePart.inlineData.mimeType || 'image/jpeg';
      const enhancedDataUrl = 'data:' + outMime + ';base64,' + imagePart.inlineData.data;

      const newPhoto: PhotoItem = {
        id: String(Date.now()),
        original: compressedDataUrl,
        enhanced: enhancedDataUrl,
        timestamp: Date.now(),
      };

      setActivePhoto(newPhoto);
      setSliderPos(50);
      setHistory((prev) => [newPhoto, ...prev]);

      if (autoSave) {
        downloadImage(enhancedDataUrl);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to enhance photo. Please retry.');
    } finally {
      setIsProcessing(false);
    }
  };
    const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 180);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;

    const maxDim = 1536;
    let targetW = vw;
    let targetH = vh;
    if (vw > maxDim || vh > maxDim) {
      if (vw > vh) {
        targetW = maxDim;
        targetH = Math.round((vh * maxDim) / vw);
      } else {
        targetH = maxDim;
        targetW = Math.round((vw * maxDim) / vh);
      }
    }

    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(targetW, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, targetW, targetH);

    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setCurrentRaw(compressedDataUrl);
    await enhanceWithGemini(compressedDataUrl);
  };

  const handleTapFocus = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setFocusPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setTimeout(() => setFocusPoint(null), 900);
  };

  const saveSettings = () => {
    try {
      localStorage.setItem('dslr_gemini_key', apiKey);
      localStorage.setItem('dslr_gemini_model', modelName);
      localStorage.setItem('dslr_auto_save', String(autoSave));
      localStorage.setItem('dslr_demo_mode', String(demoMode));
    } catch {}
    setShowSettings(false);
    showToast('Settings Saved ✓');
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-white select-none flex flex-col justify-between">
      <canvas ref={canvasRef} className="hidden" />

      <header className="z-20 flex items-center justify-between px-4 pt-4 pb-2 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase bg-amber-500 text-black rounded">
            85mm f/1.4
          </span>
          <span className="text-xs text-zinc-300 font-mono">RAW AI</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleFlash}
            className={
              'px-2.5 py-1.5 rounded-full text-xs font-medium border ' +
              (flashOn
                ? 'bg-amber-400 text-black border-amber-400'
                : 'bg-zinc-900/80 text-zinc-300 border-zinc-700')
            }
          >
            ⚡ {flashOn ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => setShowGrid(!showGrid)}
            className={
              'px-2.5 py-1.5 rounded-full text-xs font-medium border ' +
              (showGrid
                ? 'bg-white text-black border-white'
                : 'bg-zinc-900/80 text-zinc-300 border-zinc-700')
            }
          >
            # Grid
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-full bg-zinc-900/80 border border-zinc-700 text-white active:scale-95"
            aria-label="Settings"
          >
            ⚙️
          </button>
        </div>
      </header>
            <div
        onClick={handleTapFocus}
        className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden"
      >
        {cameraError ? (
          <div className="p-6 text-center max-w-sm">
            <p className="text-red-400 text-sm mb-4">{cameraError}</p>
            <button
              onClick={startCamera}
              className="px-4 py-2 bg-amber-500 text-black font-semibold rounded-lg text-sm"
            >
              Retry Camera
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={'h-full w-full object-cover ' + (facingMode === 'user' ? 'scale-x-[-1]' : '')}
          />
        )}

        {showGrid && !cameraError && (
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            <div className="border-r border-b border-white/20" />
            <div className="border-r border-b border-white/20" />
            <div className="border-b border-white/20" />
            <div className="border-r border-b border-white/20" />
            <div className="border-r border-b border-white/20" />
            <div className="border-b border-white/20" />
            <div className="border-r border-white/20" />
            <div className="border-r border-white/20" />
            <div />
          </div>
        )}

        {focusPoint && (
          <div
            style={{ left: focusPoint.x - 28, top: focusPoint.y - 28 }}
            className="pointer-events-none absolute w-14 h-14 border-2 border-amber-400 rounded-full animate-ping"
          />
        )}

        {shutterFlash && <div className="pointer-events-none absolute inset-0 bg-white z-30" />}
      </div>

      <footer className="z-20 px-6 pb-8 pt-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex items-center justify-between">
        <button
          onClick={() => history.at(0) && setActivePhoto(history.at(0)!)}
          className="w-12 h-12 rounded-xl overflow-hidden border-2 border-zinc-700 bg-zinc-900 flex items-center justify-center"
        >
          {history.at(0) ? (
            <img src={history.at(0)?.enhanced} alt="Last shot" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] text-zinc-500">GALLERY</span>
          )}
        </button>

        <button
          onClick={handleCapture}
          disabled={isProcessing}
          className="w-20 h-20 rounded-full border-4 border-white p-1 flex items-center justify-center active:scale-90 transition disabled:opacity-50"
          aria-label="Capture Photo"
        >
          <div className="w-full h-full rounded-full bg-white" />
        </button>

        <button
          onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
          className="w-12 h-12 rounded-full bg-zinc-900/90 border border-zinc-700 flex items-center justify-center text-lg active:rotate-180 transition-transform"
          aria-label="Switch Camera"
        >
          🔄
        </button>
      </footer>

      {isProcessing && currentRaw && (
        <div className="fixed inset-0 z-40 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6">
          <div className="relative w-64 h-80 rounded-2xl overflow-hidden border border-amber-500/50 shadow-2xl mb-6">
            <img src={currentRaw} alt="Processing" className="w-full h-full object-cover opacity-70" />
            <div className="absolute inset-x-0 top-0 h-1 bg-amber-400 animate-bounce" />
          </div>
          <p className="text-amber-400 font-semibold text-base mb-1">AI DSLR Processing...</p>
          <p className="text-zinc-300 text-xs text-center">{statusText}</p>
        </div>
      )}

      {errorMsg && !isProcessing && (
        <div className="fixed inset-x-4 top-20 z-50 bg-red-950/95 border border-red-500 rounded-xl p-4 shadow-xl">
          <p className="text-xs text-red-200 mb-3">{errorMsg}</p>
          <div className="flex gap-2">
            {currentRaw && (
              <button
                onClick={() => enhanceWithGemini(currentRaw)}
                className="px-3 py-1.5 bg-amber-500 text-black text-xs font-bold rounded-lg"
              >
                Retry Enhancement
              </button>
            )}
            <button
              onClick={() => setErrorMsg(null)}
              className="px-3 py-1.5 bg-zinc-800 text-white text-xs rounded-lg"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {activePhoto && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              DSLR 85mm f/1.4 Output
            </span>
            <button
              onClick={() => setActivePhoto(null)}
              className="px-3 py-1.5 bg-zinc-800 rounded-lg text-xs font-semibold"
            >
              ✕ Back to Camera
            </button>
          </div>

          <div className="relative my-4 flex-1 w-full max-w-md mx-auto rounded-2xl overflow-hidden border border-zinc-800">
            <img
              src={activePhoto.enhanced}
              alt="Enhanced DSLR"
              className="absolute inset-0 w-full h-full object-contain bg-zinc-950"
            />
            <div
              style={{ clipPath: 'inset(0 ' + (100 - sliderPos) + '% 0 0)' }}
              className="absolute inset-0"
            >
              <img
                src={activePhoto.original}
                alt="Original Raw"
                className="w-full h-full object-contain bg-zinc-950"
              />
            </div>

            <div
              style={{ left: sliderPos + '%' }}
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-amber-400 shadow"
            />

            <span className="absolute top-3 left-3 px-2 py-0.5 bg-black/70 text-[10px] rounded">
              BEFORE
            </span>
            <span className="absolute top-3 right-3 px-2 py-0.5 bg-amber-500 text-black font-bold text-[10px] rounded">
              AFTER DSLR
            </span>
          </div>

          <div className="max-w-md w-full mx-auto space-y-3 pb-4">
            <input
              type="range"
              min={0}
              max={100}
              value={sliderPos}
              onChange={(e) => setSliderPos(Number(e.target.value))}
              className="w-full accent-amber-400"
            />
            <div className="flex gap-3">
              <button
                onClick={() => downloadImage(activePhoto.enhanced)}
                className="flex-1 py-3 bg-amber-500 text-black font-bold rounded-xl text-sm"
              >
                ⬇ Save to Gallery
              </button>
              <button
                onClick={() => setActivePhoto(null)}
                className="flex-1 py-3 bg-zinc-800 text-white font-semibold rounded-xl text-sm"
              >
                Take Another
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">DSLR AI Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-zinc-400 text-sm">
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Google Gemini API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2.5 bg-black border border-zinc-700 rounded-xl text-sm text-white focus:border-amber-400 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Gemini Image Model</label>
              <select
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="w-full px-3 py-2.5 bg-black border border-zinc-700 rounded-xl text-sm text-white"
              >
                <option value="gemini-3.1-flash-image">gemini-3.1-flash-image (Recommended)</option>
                <option value="gemini-nano-banana-2.1">gemini-nano-banana-2.1</option>
                <option value="gemini-3-pro-image">gemini-3-pro-image</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-zinc-300">Auto-Save to Gallery</span>
              <input
                type="checkbox"
                checked={autoSave}
                onChange={(e) => setAutoSave(e.target.checked)}
                className="w-4 h-4 accent-amber-400"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-300">Demo Mode (Test without API Key)</span>
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
                className="w-4 h-4 accent-amber-400"
              />
            </div>

            <button
              onClick={saveSettings}
              className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl text-sm"
>
Save Settings



)}
{toastMsg && (

{toastMsg}

)}

);
              }
              
