/**
 * Permission catalog and role matrix.
 *
 * Pure data (no server-only imports) so it can be consumed by both the app and
 * the seed script. Permissions follow `resource.action`. Most resources are
 * forward-looking scaffolding for modules that arrive in later phases; Phase 1
 * only actively enforces the Admin / Users / Roles / Audit-log permissions,
 * which belong to the Owner.
 */

export const RESOURCES = [
  "dashboard",
  "sales",
  "purchases",
  "other_income",
  "expenses",
  "cash_transfers",
  "inventory",
  "kardex",
  "reports",
  "admin",
  "users",
  "roles",
  "audit_log",
  "transactions",
] as const;
export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = [
  "view",
  "create",
  "edit_draft",
  "post",
  "approve",
  "export",
  "void",
  "delete_draft",
  "manage",
] as const;
export type Action = (typeof ACTIONS)[number];

export type PermissionCode = `${Resource}.${Action}`;

export interface PermissionDef {
  resource: Resource;
  action: Action;
  code: PermissionCode;
  description: string;
}

function p(resource: Resource, actions: Action[]): PermissionDef[] {
  return actions.map((action) => ({
    resource,
    action,
    code: `${resource}.${action}` as PermissionCode,
    description: `${action.replace(/_/g, " ")} ${resource.replace(/_/g, " ")}`,
  }));
}

const TXN_ACTIONS: Action[] = [
  "view",
  "create",
  "edit_draft",
  "post",
  "approve",
  "export",
  "void",
  "delete_draft",
];

/** The full set of permissions seeded into the database. */
export const PERMISSION_DEFS: PermissionDef[] = [
  ...p("dashboard", ["view"]),
  ...p("sales", TXN_ACTIONS),
  ...p("purchases", TXN_ACTIONS),
  ...p("other_income", TXN_ACTIONS),
  ...p("expenses", TXN_ACTIONS),
  ...p("cash_transfers", TXN_ACTIONS),
  ...p("inventory", ["view", "create", "edit_draft", "post", "export", "manage"]),
  ...p("kardex", ["view", "export"]),
  ...p("reports", ["view", "export"]),
  ...p("admin", ["view", "manage"]),
  ...p("users", ["view", "manage"]),
  ...p("roles", ["view", "manage"]),
  ...p("audit_log", ["view", "export"]),
  // Future guarded actions - Owner only. No "delete posted" permission exists.
  ...p("transactions", ["delete_draft", "void"]),
];

export const OWNER_ROLE = "OWNER";

export interface RoleDef {
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  isProtected: boolean;
  /** "*" grants every permission; otherwise an explicit list of codes. */
  permissions: "*" | PermissionCode[];
}

export const ROLE_DEFS: RoleDef[] = [
  {
    code: OWNER_ROLE,
    name: "Owner",
    description: "Full system access. Protected system role.",
    isSystem: true,
    isProtected: true,
    permissions: "*",
  },
  {
    code: "MANAGER",
    name: "Manager",
    description: "Operational management across modules.",
    isSystem: true,
    isProtected: false,
    permissions: [
      "dashboard.view",
      "sales.view", "sales.create", "sales.edit_draft", "sales.post", "sales.approve", "sales.export", "sales.void",
      "purchases.view", "purchases.create", "purchases.edit_draft", "purchases.post", "purchases.approve", "purchases.export", "purchases.void",
      "other_income.view", "other_income.create", "other_income.edit_draft", "other_income.post", "other_income.approve", "other_income.export",
      "expenses.view", "expenses.create", "expenses.edit_draft", "expenses.post", "expenses.approve", "expenses.export",
      "cash_transfers.view", "cash_transfers.create", "cash_transfers.edit_draft", "cash_transfers.post", "cash_transfers.approve",
      "inventory.view", "inventory.create", "inventory.edit_draft", "inventory.post", "inventory.manage", "inventory.export",
      "kardex.view", "kardex.export",
      "reports.view", "reports.export",
    ],
  },
  {
    code: "ACCOUNTANT",
    name: "Accountant",
    description: "Records and posts financial transactions.",
    isSystem: true,
    isProtected: false,
    permissions: [
      "dashboard.view",
      "sales.view", "sales.create", "sales.edit_draft", "sales.post", "sales.export",
      "purchases.view", "purchases.create", "purchases.edit_draft", "purchases.post", "purchases.export",
      "other_income.view", "other_income.create", "other_income.edit_draft", "other_income.post",
      "expenses.view", "expenses.create", "expenses.edit_draft", "expenses.post",
      "cash_transfers.view", "cash_transfers.create", "cash_transfers.edit_draft", "cash_transfers.post",
      "inventory.view", "kardex.view", "kardex.export",
      "reports.view", "reports.export",
    ],
  },
  {
    code: "CASHIER",
    name: "Sales / Cashier",
    description: "Point-of-sale and receipts.",
    isSystem: true,
    isProtected: false,
    permissions: [
      "dashboard.view",
      "sales.view", "sales.create", "sales.edit_draft", "sales.post",
      "inventory.view", "kardex.view",
    ],
  },
  {
    code: "STOREKEEPER",
    name: "Storekeeper",
    description: "Stock movements and inventory.",
    isSystem: true,
    isProtected: false,
    permissions: [
      "dashboard.view",
      "inventory.view", "inventory.create", "inventory.edit_draft", "inventory.post", "inventory.manage",
      "kardex.view", "kardex.export",
      "purchases.view",
    ],
  },
  {
    code: "AUDITOR",
    name: "Viewer / Auditor",
    description: "Read-only access to operational data and reports.",
    isSystem: true,
    isProtected: false,
    permissions: [
      "dashboard.view",
      "sales.view", "sales.export",
      "purchases.view", "purchases.export",
      "other_income.view", "expenses.view",
      "cash_transfers.view",
      "inventory.view", "kardex.view", "kardex.export",
      "reports.view", "reports.export",
    ],
  },
];
