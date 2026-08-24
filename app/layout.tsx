import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Pine Ledger — Trading Journal",
  description: "Calendar-style trade journal with auto P/L and equity curve",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Without JS the entrance animations never run — make sure content still shows. */}
        <noscript>
          <style>{`[data-anim]{visibility:visible !important}`}</style>
        </noscript>
      </head>
      <body className={`${display.variable} ${body.variable} ${mono.variable} bg-base text-chalk font-body antialiased`}>
        {children}
      </body>
    </html>
  );
}
