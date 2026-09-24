export type Me = {
  user: { id: string; email?: string; name?: string; roles: string[] };
  tenant: { id: string; slug: string; name: string; defaultCurrency: string };
};

export type Supplier = {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  sourceSystem: string;
  createdAt: string;
};
