"use client";

import {
  Bell,
  ClipboardPenLine,
  Fuel,
  Gauge,
  House,
  LayoutGrid,
  Menu,
  WalletCards
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

const navigation = [
  { href: "/", label: "Home", icon: House },
  { href: "/day", label: "Today", icon: ClipboardPenLine },
  { href: "/shifts", label: "Shifts", icon: Gauge },
  { href: "/stock", label: "Stock", icon: Fuel },
  { href: "/finance", label: "Finance", icon: WalletCards },
  { href: "/more", label: "More", icon: LayoutGrid }
];

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      document.querySelectorAll<HTMLTableElement>(".data-table").forEach((table) => {
        const labels = [...table.querySelectorAll("thead th")].map((heading) => heading.textContent?.trim() ?? "");
        table.querySelectorAll("tbody tr").forEach((row) => {
          [...row.children].forEach((cell, index) => {
            if (cell instanceof HTMLTableCellElement && labels[index]) cell.dataset.label = labels[index];
          });
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    const blurNumberInputOnWheel = () => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.type === "number") active.blur();
    };
    document.addEventListener("wheel", blurNumberInputOnWheel, { passive: true });
    return () => document.removeEventListener("wheel", blurNumberInputOnWheel);
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Annai Agencies home">
          <span className="brand-mark"><Fuel aria-hidden="true" size={20} /></span>
          <span>
            <strong>Annai Agencies</strong>
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
            <span><strong>Operations storage</strong><small>Records are live</small></span>
          </div>
          <Link className="owner-chip" href="/settings">
            <span className="avatar">OW</span>
            <span><strong>Owner workspace</strong><small>Manual operations</small></span>
          </Link>
        </div>
      </aside>

      <div className="app-main">
        <header className="mobile-header">
          <Link className="brand compact" href="/" aria-label="Annai Agencies home">
            <span className="brand-mark"><Fuel aria-hidden="true" size={18} /></span>
            <strong>Annai Agencies</strong>
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
