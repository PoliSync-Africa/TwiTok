import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TwiTok — Africa's Video Platform",
  description: "Our Stories • Our People • Our Culture • Our Future"
};

export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}