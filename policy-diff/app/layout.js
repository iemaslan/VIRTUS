import "./globals.css";

export const metadata = {
  title: "Policy Diff — what actually changed, in plain English",
  description:
    "Compare two versions of a policy, contract, or set of rules. The diff is computed in code; the model only explains it, and every quote it uses is checked back against the document.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
