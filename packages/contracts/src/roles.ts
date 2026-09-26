export const ROLES = ['requester', 'approver', 'buyer', 'finance_controller', 'tenant_admin', 'supplier'] as const;
export type Role = (typeof ROLES)[number];
