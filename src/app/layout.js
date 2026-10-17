import "./globals.css";
import { APP_NAME } from "@/lib/site";

export const metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Account tracking for the V100 and Cycle Method projects.",
  robots: { index: false, follow: false },
};

export const viewport = {
  themeColor: "#0b1020",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
