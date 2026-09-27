import "./globals.css";

export const metadata = {
  title: "TwiTok Admin Control Center",
  description: "Private administration and safety control center for TwiTok."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
