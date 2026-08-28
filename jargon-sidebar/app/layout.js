export const metadata = {
  title: "Live Jargon Sidebar",
  description:
    "Transcribe a talk, catch the jargon as it lands, and keep a running sidebar of short definitions in context.",
};

import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
