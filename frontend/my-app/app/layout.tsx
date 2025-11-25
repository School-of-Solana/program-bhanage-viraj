import { Buffer } from "buffer";
if (typeof window !== "undefined") {
  window.Buffer = window.Buffer || Buffer;
}

import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import AppWalletProvider from "../src/components/AppWalletProvider";
import { Press_Start_2P } from 'next/font/google';

const pressStart2P = Press_Start_2P({ 
  weight: '400',
  subsets: ['latin'],
  variable: '--font-press-start'
});

export const metadata = {
  title: "Minecraft Raffle ⛏️",
  description: "Pixel-perfect raffle dApp with Minecraft vibes",
};

export default function RootLayout({ children }: any) {
  return (
    <html lang="en" className={pressStart2P.variable}>
      <body suppressHydrationWarning className={pressStart2P.className}>
        <AppWalletProvider>{children}</AppWalletProvider>
      </body>
    </html>
  );
}
