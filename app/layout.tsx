import './globals.css';
import type { Metadata, Viewport } from 'next';
export const metadata: Metadata = { title: 'DSLR AI Camera', manifest: '/manifest.json', icons: { icon: '/icon.svg' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, viewportFit: 'cover', themeColor: '#000000' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
