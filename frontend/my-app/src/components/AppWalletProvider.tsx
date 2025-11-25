"use client";

import dynamic from "next/dynamic";
import { ReactNode } from "react";

const WalletComponent = dynamic(
  () => import("./WalletProvider").then((mod) => mod.WalletComponent),
  { ssr: false }
);

export default function AppWalletProvider({ children }: { children: ReactNode }) {
  return <WalletComponent>{children}</WalletComponent>;
}
