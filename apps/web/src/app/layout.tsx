import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { THEME_KEY } from "@/lib/theme-key";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AX Grow", template: "%s · AX Grow" },
  description: "Automate, optimize and grow: Google Business Profile automation for agencies",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4fb" },
    { media: "(prefers-color-scheme: dark)", color: "#09081a" },
  ],
};

// Runs before the first paint, so a dark-theme user never sees a white flash.
// "system" (or nothing saved) follows the device and keeps following it.
const themeScript = `(function(){try{var k=${JSON.stringify(THEME_KEY)},d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");function a(){var s=null;try{s=localStorage.getItem(k)}catch(e){}var t=s==="light"||s==="dark"?s:(m.matches?"dark":"light");d.dataset.theme=t;d.dataset.themeChoice=s==="light"||s==="dark"?s:"system"}a();m.addEventListener("change",a);window.__applyTheme=a}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
