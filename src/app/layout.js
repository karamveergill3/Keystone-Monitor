import "./globals.css";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { APP_NAME } from "@/lib/site";

// Self-hosted at build time, so the page loads no font from anywhere else
// (the Content-Security-Policy allows fonts from this origin only).
const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-grotesk", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-jetbrains", display: "swap" });

export const metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Account tracking for the V100 and Cycle Method projects.",
  robots: { index: false, follow: false },
};

export const viewport = {
  themeColor: "#06070b",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${mono.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
