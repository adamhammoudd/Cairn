"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { NAV_ITEMS } from "@/lib/nav-items";

interface SidebarProps {
  displayName: string;
  plan: "free" | "premium";
}

export function Sidebar({ displayName, plan }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col gap-0.5 border-r border-line px-4 py-6">
      <div className="mb-6 px-2">
        <Logo size={26} />
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = item.route === "/" ? pathname === "/" : pathname.startsWith(item.route);
          return (
            <Link
              key={item.route}
              href={item.route}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${
                isActive ? "bg-active text-primary" : "text-muted"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? "bg-accent" : "bg-transparent"}`}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="mt-2 flex items-center gap-2.5 border-t border-line pt-2.5">
        <div
          className="h-[30px] w-[30px] shrink-0 rounded-full"
          style={{ background: "linear-gradient(135deg, #5EE6A6, #22B573)" }}
        />
        <div className="flex flex-col overflow-hidden">
          <span className="truncate text-[13px] text-primary">{displayName}</span>
          <span className="text-[11.5px] text-muted capitalize">{plan} plan</span>
        </div>
      </div>
    </aside>
  );
}
