import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hardwood — NBA Prediction Machine",
  description:
    "Monte Carlo NBA game & season predictions (TypeScript / Python / Rust-WASM), live schedule, seeding, bracketology, and embedded betting markets.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
