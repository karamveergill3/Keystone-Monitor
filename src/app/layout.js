import "./globals.css";
import { IBM_Plex_Sans } from "next/font/google";
import { APP_NAME } from "@/lib/site";

// Self-hosted at build time, so the page loads no font from anywhere else
// (the Content-Security-Policy allows fonts from this origin only).
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });

export const metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Account tracking for the V100 and Cycle Method projects.",
  robots: { index: false, follow: false },
};

export const viewport = {
  themeColor: "#f7f3ec",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={plex.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
