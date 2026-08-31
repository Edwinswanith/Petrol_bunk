import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/newsreader/500.css";
import "@fontsource/newsreader/600.css";
import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: "Forecourt | Petrol Pump Operations",
  description: "Single-owner petrol pump operations, stock, reconciliation and margin control."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="en">
      <body>
        <AppShell outletName={process.env.OUTLET_NAME ?? "Swanith Fuels"} ownerName={process.env.OWNER_NAME ?? "Edwin Swanith"}>{children}</AppShell>
      </body>
    </html>
  );
}
