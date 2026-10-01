"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Slide" },
  { href: "/crops", label: "Crops" },
  { href: "/shapes", label: "Shapes" },
  { href: "/voids", label: "Voids" },
  { href: "/composition", label: "Composition" },
  { href: "/lattice", label: "Part 2" },
] as const;

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active =
          link.href === "/"
            ? pathname === "/"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className="rounded px-2.5 py-1 text-[11px] transition"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "#000" : "var(--muted)",
              border: active ? "1px solid transparent" : "1px solid var(--line)",
              fontWeight: active ? 600 : 400,
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
