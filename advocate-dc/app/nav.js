"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Know your rights", hint: "Tenant disputes" },
  { href: "/find", label: "Find a home", hint: "Search & negotiate" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        <span className="mark">Advocate</span>
        <span className="mark-sub">Washington, DC</span>
      </Link>
      <div className="nav-tabs">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`nav-tab ${pathname === tab.href ? "nav-tab-active" : ""}`}
          >
            <span className="nav-tab-label">{tab.label}</span>
            <span className="nav-tab-hint">{tab.hint}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
