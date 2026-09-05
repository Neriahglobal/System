import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Coins,
  Receipt,
  ArrowLeftRight,
  Boxes,
  BookOpen,
  BarChart3,
  Settings,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Enabled in Phase 1? Disabled items render greyed-out and non-clickable. */
  enabled: boolean;
  ownerOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, enabled: true },
  { label: "Sales", href: "/sales", icon: ShoppingCart, enabled: false },
  { label: "Purchases", href: "/purchases", icon: Truck, enabled: false },
  { label: "Other Income", href: "/other-income", icon: Coins, enabled: false },
  { label: "Expenses", href: "/expenses", icon: Receipt, enabled: false },
  { label: "Cash Transfers", href: "/cash-transfers", icon: ArrowLeftRight, enabled: false },
  { label: "Inventory", href: "/inventory", icon: Boxes, enabled: false },
  { label: "Kardex", href: "/kardex", icon: BookOpen, enabled: false },
  { label: "Reports", href: "/reports", icon: BarChart3, enabled: false },
  { label: "Admin", href: "/admin", icon: Settings, enabled: true, ownerOnly: true },
];
