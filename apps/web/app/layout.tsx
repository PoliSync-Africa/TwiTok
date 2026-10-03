import "./globals.css";
import type { Metadata } from "next";
import AuthGate from "./auth-gate";

export const metadata: Metadata = {
  title: "TwiTok — Social Video",
  description: "Create, discover and connect through short-form video."
};

export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="en">
      <body><AuthGate>{children}</AuthGate></body>
    </html>
  );
}
