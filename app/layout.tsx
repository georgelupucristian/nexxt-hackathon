import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avansul",
  description: "Strange pentru avansul casei tale.",
  icons: { icon: "/seal-static.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
