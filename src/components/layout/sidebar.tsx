"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { NAV_ITEMS } from "./nav-config";
import { cn } from "@/lib/utils";

export function SidebarNav({
  isOwner,
  collapsed,
  onNavigate,
}: {
  isOwner: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
      {NAV_ITEMS.map((item) => {
        if (item.ownerOnly && !isOwner) return null;
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        if (!item.enabled) {
          return (
            <div
              key={item.href}
              title="Available in a later phase"
              className={cn(
                "flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-muted/60",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  <Lock className="h-3 w-3" />
                </>
              )}
            </div>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-active",
              active && "bg-sidebar-active text-white",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={cn(
        "flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4",
        collapsed && "justify-center px-0",
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
        <Image
          src="/logo.jpg"
          alt="Neriah Global"
          width={1080}
          height={964}
          className="h-full w-full object-contain p-0.5"
        />
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">Neriah ERP</p>
          <p className="truncate text-[11px] text-sidebar-muted">Agrobusiness Solution</p>
        </div>
      )}
    </div>
  );
}
