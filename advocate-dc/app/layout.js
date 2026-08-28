import "./globals.css";
import Nav from "./nav.js";

export const metadata = {
  title: "Advocate DC — tenant rights and housing search for Washington, DC",
  description:
    "Two multi-agent pipelines for DC renters: turn a housing dispute into a ready-to-send action package, and find a home that fits your life and your real budget.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
