"use client";

import {
  Bell,
  Fuel,
  Gauge,
  House,
  LayoutGrid,
  Menu,
  WalletCards
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  { href: "/", label: "Home", icon: House },
  { href: "/shifts", label: "Shifts", icon: Gauge },
  { href: "/stock", label: "Stock", icon: Fuel },
  { href: "/finance", label: "Finance", icon: WalletCards },
  { href: "/more", label: "More", icon: LayoutGrid }
];

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function AppShell({ children, outletName, ownerName }: { children: ReactNode; outletName: string; ownerName: string }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Forecourt home">
          <span className="brand-mark"><Fuel aria-hidden="true" size={20} /></span>
          <span>
            <strong>Forecourt</strong>
            <small>Owner operations</small>
          </span>
        </Link>

        <nav className="side-nav" aria-label="Primary navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            const current = isCurrent(pathname, item.href);
            return (
              <Link
                aria-current={current ? "page" : undefined}
                className={current ? "nav-item active" : "nav-item"}
                href={item.href}
                key={item.href}
              >
                <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="outlet-chip">
            <span className="outlet-dot" />
            <span><strong>{outletName}</strong><small>Outlet is live</small></span>
          </div>
          <Link className="owner-chip" href="/settings">
            <span className="avatar">{ownerName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
            <span><strong>{ownerName}</strong><small>Owner</small></span>
          </Link>
        </div>
      </aside>

      <div className="app-main">
        <header className="mobile-header">
          <Link className="brand compact" href="/" aria-label="Forecourt home">
            <span className="brand-mark"><Fuel aria-hidden="true" size={18} /></span>
            <strong>Forecourt</strong>
          </Link>
          <div className="mobile-header-actions">
            <Link href="/more#alerts" aria-label="View alerts"><Bell size={19} /></Link>
            <Link aria-label="Open menu" href="/more"><Menu size={20} /></Link>
          </div>
        </header>
        {children}
      </div>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navigation.map((item) => {
          const Icon = item.icon;
          const current = isCurrent(pathname, item.href);
          return (
            <Link
              aria-current={current ? "page" : undefined}
              className={current ? "bottom-nav-item active" : "bottom-nav-item"}
              href={item.href}
              key={item.href}
            >
              <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
