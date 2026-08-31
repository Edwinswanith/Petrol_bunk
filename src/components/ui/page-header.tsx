import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: { label: string; href: string; icon?: ReactNode };
}) {
  return (
    <header className="page-header reveal reveal-1">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action ? (
        <Link className="button primary" href={action.href}>
          {action.icon}
          {action.label}
        </Link>
      ) : null}
    </header>
  );
}
