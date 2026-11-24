# DSLR AI Camera (Next.js + Tailwind + Gemini)

## Run
    npm install
    cp .env.local.example .env.local   # optional: NEXT_PUBLIC_GEMINI_API_KEY=...
    npm run dev                        # http://localhost:3000

The camera needs HTTPS or localhost. To test on a phone: deploy to Vercel or run `npx ngrok http 3000`.
First launch: tap the gear, paste your Google AI Studio key, or switch on Demo mode.

## Wrap with Capacitor
    # next.config.js: uncomment output:'export' and images.unoptimized
    npm i @capacitor/core @capacitor/cli @capacitor/android
    npx cap init "DSLR AI" com.example.dslrai --web-dir=out
    npm run build && npx cap add android && npx cap sync && npx cap open android
Add CAMERA and INTERNET permissions in AndroidManifest.xml. For saving straight into the Photos
gallery inside the native app, swap downloadDataUrl() for @capacitor/filesystem or a media-save plugin.

## Notes
- NEXT_PUBLIC_ keys ship in the client bundle: fine for personal use, don't publish a build containing your key.
- Model IDs are editable in Settings in case Google renames or changes them.
