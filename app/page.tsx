'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

const h = React.createElement;

const DSLR_PROMPT =
  "Transform this uploaded image into an ultra-realistic, high-resolution photograph captured on a full-frame DSLR camera with an 85mm f/1.4 prime lens. Automatically balance the lighting, fix harsh shadows, and apply natural, true-to-life color grading. Create a smooth, authentic shallow depth-of-field (DSLR bokeh) in the background while keeping the main subject in tack-sharp focus. Remove any grain, pixelation, or low-light noise, and restore crisp details in clothing and natural skin texture without artificial over-smoothing or plastic look. Strictly preserve the person's exact facial features, expression, pose, and original background environment—just elevate the overall camera quality to look like a raw, professional studio-grade capture.";

export default function DSLRCameraApp() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [facingMode, setFacingMode] = useState('environment');
  const [showGrid, setShowGrid] = useState(true);
  const [flashOn, setFlashOn] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('gemini-3.1-flash-image');
  const [autoSave, setAutoSave] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [currentRaw, setCurrentRaw] = useState(null);
  const [activePhoto, setActivePhoto] = useState(null);
  const [sliderPos, setSliderPos] = useState(50);
  const [history, setHistory] = useState([]);
    useEffect(() => {
    try {
      setApiKey(localStorage.getItem('dslr_gemini_key') || '');
      setModelName(localStorage.getItem('dslr_gemini_model') || 'gemini-3.1-flash-image');
      const savedAuto = localStorage.getItem('dslr_auto_save');
      if (savedAuto !== null) setAutoSave(savedAuto === 'true');
    } catch (e) {}
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  };

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) {
      setCameraError('Camera access blocked. Allow Camera permission in Chrome settings and tap Retry.');
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  const downloadImage = (dataUrl) => {
    try {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'DSLR_AI_' + Date.now() + '.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Saved to Gallery ✓');
    } catch (e) {
      showToast('Tap Save to Gallery');
    }
  };
     const enhanceWithGemini = async (compressedDataUrl) => {
    setIsProcessing(true);
    setErrorMsg(null);
    setStatusText('Sending to Gemini AI...');

    try {
      if (!apiKey.trim()) {
        setIsProcessing(false);
        setShowSettings(true);
        setErrorMsg('Please paste your AIzaSy... Gemini API Key in Settings first.');
        return;
      }

      const base64Data = compressedDataUrl.split(',').at(1) || '';
      setStatusText('Applying 85mm f/1.4 DSLR lens & lighting...');

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
                { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
              ],
            },
          ],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error((data && data.error && data.error.message) || 'API Error ' + response.status);
      }

      const parts = (data && data.candidates && data.candidates.at(0) && data.candidates.at(0).content && data.candidates.at(0).content.parts) || [];
      const imagePart = parts.find((p) => p.inlineData && p.inlineData.data);

      if (!imagePart) {
        throw new Error('No image returned. Check your API Key (must start with AIzaSy) or model.');
      }

      const outMime = imagePart.inlineData.mimeType || 'image/jpeg';
      const enhancedDataUrl = 'data:' + outMime + ';base64,' + imagePart.inlineData.data;

      const newPhoto = { id: String(Date.now()), original: compressedDataUrl, enhanced: enhancedDataUrl };
      setActivePhoto(newPhoto);
      setSliderPos(50);
      setHistory((prev) => [newPhoto, ...prev]);
      if (autoSave) downloadImage(enhancedDataUrl);
    } catch (err) {
      setErrorMsg((err && err.message) || 'Enhancement failed. Tap Retry.');
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
    const scale = Math.min(1, maxDim / Math.max(vw, vh));
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const compressed = canvas.toDataURL('image/jpeg', 0.88);
    setCurrentRaw(compressed);
    await enhanceWithGemini(compressed);
  };

  const saveSettings = () => {
    try {
      localStorage.setItem('dslr_gemini_key', apiKey);
      localStorage.setItem('dslr_gemini_model', modelName);
      localStorage.setItem('dslr_auto_save', String(autoSave));
    } catch (e) {}
    setShowSettings(false);
    showToast('Settings Saved ✓');
  };

  const lastShot = history.at(0);

  return h(
    'main',
    { className: 'relative h-screen w-screen overflow-hidden bg-black text-white flex flex-col justify-between select-none' },
    h('canvas', { ref: canvasRef, className: 'hidden' }),
    h(
      'header',
      { className: 'z-20 flex items-center justify-between px-4 pt-4 pb-2 bg-black/70' },
      h('span', { className: 'px-2 py-0.5 text-xs font-bold bg-amber-500 text-black rounded' }, '85mm f/1.4 AI'),
      h(
        'div',
        { className: 'flex items-center gap-2' },
        h(
          'button',
          {
            onClick: () => setShowGrid(!showGrid),
            className: 'px-3 py-1 rounded-full text-xs border border-zinc-700 bg-zinc-900',
          },
          showGrid ? '# Grid ON' : '# Grid OFF'
        ),
        h(
          'button',
          {
            onClick: () => setShowSettings(true),
            className: 'px-3 py-1 rounded-full text-xs border border-zinc-700 bg-zinc-900',
          },
          '⚙️ Settings'
        )
      )
    ),
    h(
      'div',
      { className: 'relative flex-1 w-full h-full flex items-center justify-center overflow-hidden' },
      cameraError
        ? h(
            'div',
            { className: 'p-6 text-center' },
            h('p', { className: 'text-red-400 text-sm mb-4' }, cameraError),
            h('button', { onClick: startCamera, className: 'px-4 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm' }, 'Retry Camera')
          )
        : h('video', {
            ref: videoRef,
            autoPlay: true,
            playsInline: true,
            muted: true,
            className: 'h-full w-full object-cover ' + (facingMode === 'user' ? 'scale-x-[-1]' : ''),
          }),
      shutterFlash && h('div', { className: 'pointer-events-none absolute inset-0 bg-white z-30' })
    ),
    h(
      'footer',
      { className: 'z-20 px-6 pb-8 pt-4 bg-black/80 flex items-center justify-between' },
      h(
        'button',
        {
          onClick: () => lastShot && setActivePhoto(lastShot),
          className: 'w-12 h-12 rounded-xl overflow-hidden border border-zinc-700 bg-zinc-900 flex items-center justify-center text-[10px]',
        },
        lastShot ? h('img', { src: lastShot.enhanced, alt: 'Last', className: 'w-full h-full object-cover' }) : 'GALLERY'
      ),
      h(
        'button',
        {
          onClick: handleCapture,
          disabled: isProcessing,
          className: 'w-20 h-20 rounded-full border-4 border-white p-1 flex items-center justify-center active:scale-90',
        },
        h('div', { className: 'w-full h-full rounded-full bg-white' })
      ),
      h(
        'button',
        {
          onClick: () => setFacingMode((p) => (p === 'environment' ? 'user' : 'environment')),
          className: 'w-12 h-12 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-lg',
        },
        '🔄'
      )
    ),
    isProcessing &&
      h(
        'div',
        { className: 'fixed inset-0 z-40 bg-black/90 flex flex-col items-center justify-center p-6' },
        h('p', { className: 'text-amber-400 font-bold text-base mb-2' }, 'AI DSLR Processing...'),
        h('p', { className: 'text-zinc-300 text-xs text-center' }, statusText)
      ),
    errorMsg &&
      !isProcessing &&
      h(
        'div',
        { className: 'fixed inset-x-4 top-20 z-50 bg-red-950 border border-red-500 rounded-xl p-4' },
        h('p', { className: 'text-xs text-red-200 mb-3' }, errorMsg),
        h(
          'div',
          { className: 'flex gap-2' },
          currentRaw &&
            h('button', { onClick: () => enhanceWithGemini(currentRaw), className: 'px-3 py-1.5 bg-amber-500 text-black text-xs font-bold rounded-lg' }, 'Retry'),
          h('button', { onClick: () => setErrorMsg(null), className: 'px-3 py-1.5 bg-zinc-800 text-white text-xs rounded-lg' }, 'Close')
        )
      ),
    activePhoto &&
      h(
        'div',
        { className: 'fixed inset-0 z-50 bg-black flex flex-col justify-between p-4' },
        h(
          'div',
          { className: 'flex items-center justify-between' },
          h('span', { className: 'text-xs font-bold text-amber-400' }, 'DSLR 85mm f/1.4 RESULT'),
          h('button', { onClick: () => setActivePhoto(null), className: 'px-3 py-1.5 bg-zinc-800 rounded-lg text-xs' }, '✕ Back')
        ),
        h('img', { src: activePhoto.enhanced, alt: 'DSLR Result', className: 'my-4 flex-1 w-full object-contain rounded-xl bg-zinc-950' }),
        h(
          'div',
          { className: 'flex gap-3 pb-4' },
          h('button', { onClick: () => downloadImage(activePhoto.enhanced), className: 'flex-1 py-3 bg-amber-500 text-black font-bold rounded-xl text-sm' }, '⬇ Save to Gallery'),
          h('button', { onClick: () => setActivePhoto(null), className: 'flex-1 py-3 bg-zinc-800 text-white font-semibold rounded-xl text-sm' }, 'Take Another')
        )
      ),
    showSettings &&
      h(
        'div',
        { className: 'fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4' },
        h(
          'div',
          { className: 'w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4' },
          h('h2', { className: 'text-base font-bold' }, 'DSLR AI Settings'),
          h('input', {
            type: 'password',
            value: apiKey,
            onChange: (e) => setApiKey(e.target.value),
            placeholder: 'Paste AIzaSy... Gemini API Key',
            className: 'w-full px-3 py-2.5 bg-black border border-zinc-700 rounded-xl text-sm text-white',
          }),
          h(
            'select',
            {
              value: modelName,
              onChange: (e) => setModelName(e.target.value),
              className: 'w-full px-3 py-2.5 bg-black border border-zinc-700 rounded-xl text-sm text-white',
            },
            h('option', { value: 'gemini-3.1-flash-image' }, 'gemini-3.1-flash-image'),
            h('option', { value: 'gemini-nano-banana-2.1' }, 'gemini-nano-banana-2.1'),
            h('option', { value: 'gemini-3-pro-image' }, 'gemini-3-pro-image')
          ),
          h(
            'div',
            { className: 'flex gap-2' },
            h('button', { onClick: saveSettings, className: 'flex-1 py-3 bg-amber-500 text-black font-bold rounded-xl text-sm' }, 'Save Settings'),
            h('button', { onClick: () => setShowSettings(false), className: 'px-4 py-3 bg-zinc-800 rounded-xl text-sm' }, 'Close')
          )
        )
      ),
    toastMsg && h('div', { className: 'fixed bottom-32 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-emerald-500 text-black font-bold text-xs rounded-full' }, toastMsg)
  );
    }
          
