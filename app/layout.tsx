import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NBA Prediction Machine",
  description:
    "Monte Carlo NBA game & season predictions (TypeScript / Python / Rust-WASM), seeding, bracketology, and a bets aggregator.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
