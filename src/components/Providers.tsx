"use client";

import { usePathname } from "next/navigation";
import { GridStoreProvider } from "./GridStore";
import { LatticeSourceProvider } from "./lattice/latticeSource";

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/experiment/site-polygon-morphogenesis") return <>{children}</>;
  return (
    <GridStoreProvider>
      <LatticeSourceProvider>{children}</LatticeSourceProvider>
    </GridStoreProvider>
  );
}
