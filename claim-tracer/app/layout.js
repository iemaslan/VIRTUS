import "./globals.css";

export const metadata = {
  title: "Claim Tracer — which claims in this post have a real source?",
  description:
    "Paste a post. It is split into atomic claims, each one is traced to a source, and every claim is labelled Sourced, Weakly Sourced, or Untraceable. The verdicts are computed in code from the URLs search actually returned.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
