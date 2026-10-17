import "./globals.css";
import { APP_NAME } from "@/lib/site";

export const metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Private account tracking for partners.",
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
