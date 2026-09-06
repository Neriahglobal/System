import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Truck,
  Coins,
  Receipt,
  ArrowLeftRight,
  BarChart3,
  Settings,
} from "lucide-react";

export interface NavLeaf {
  label: string;
  href: string;
  enabled: boolean;
  /** Permission required to see it (Owner always sees enabled items). */
  requires?: string;
}

export interface NavEntry {
  label: string;
  icon: LucideIcon;
  /** A direct link (leaf) ... */
  href?: string;
  enabled: boolean;
  ownerOnly?: boolean;
  requires?: string;
  /** ...or a group of children. */
  items?: NavLeaf[];
}

export const NAV: NavEntry[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", enabled: true },
  {
    label: "Sales",
    icon: ShoppingCart,
    enabled: true,
    requires: "sales.view",
    items: [
      { label: "Create Sale", href: "/sales/new", enabled: true, requires: "sales.create" },
      { label: "Sales History", href: "/sales/history", enabled: true, requires: "sales.view" },
      { label: "Customer Payments", href: "/sales/customer-payments", enabled: true, requires: "sales.view" },
    ],
  },
  {
    label: "Inventory",
    icon: Boxes,
    enabled: true,
    requires: "inventory.view",
    items: [
      { label: "Current Stock", href: "/inventory", enabled: true, requires: "inventory.view" },
      { label: "Kardex", href: "/inventory/kardex", enabled: true, requires: "inventory.view_kardex" },
      { label: "Stock Transfers", href: "/inventory/transfers", enabled: true, requires: "inventory.transfer_create" },
      { label: "Stock Adjustments", href: "/inventory/adjustments", enabled: true, requires: "inventory.adjustment_create" },
      { label: "Opening Balances", href: "/inventory/opening-balances", enabled: true, requires: "inventory.opening_balance" },
    ],
  },
  { label: "Purchases", icon: Truck, href: "/purchases", enabled: false },
  { label: "Other Income", icon: Coins, href: "/other-income", enabled: false },
  { label: "Expenses", icon: Receipt, href: "/expenses", enabled: false },
  { label: "Cash Transfers", icon: ArrowLeftRight, href: "/cash-transfers", enabled: false },
  { label: "Reports", icon: BarChart3, href: "/reports", enabled: false },
  { label: "Admin", icon: Settings, href: "/admin", enabled: true, ownerOnly: true },
];

/** Whether a user (with a permission set) may see a nav entry/leaf. */
export function canSee(
  entry: { requires?: string; ownerOnly?: boolean },
  isOwner: boolean,
  perms: Set<string>,
): boolean {
  if (entry.ownerOnly) return isOwner;
  if (isOwner) return true;
  if (entry.requires) return perms.has(entry.requires);
  return true;
}
