import type { VatRate } from "./vat";

export type Product = {
  id: number;
  sku: string;
  name: string;
  description: string;
  stock: number;
  min_stock: number;
  cost_cents: number;
  price_cents: number;
  vat_rate: VatRate;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductInput = {
  id?: number | null;
  sku: string;
  name: string;
  description?: string;
  stock?: number;
  min_stock?: number;
  cost_cents: number;
  price_cents: number;
  vat_rate: VatRate;
  active?: boolean;
};

export type Customer = {
  id: number;
  name: string;
  email: string;
  phone: string;
  nif: string;
  notes: string;
  created_at: string;
};

export type CustomerInput = {
  id?: number | null;
  name: string;
  email?: string;
  phone?: string;
  nif?: string;
  notes?: string;
};

export type SaleLineInput = {
  product_id: number;
  qty: number;
  unit_price_cents?: number | null;
  discount_cents?: number;
};

export type SaleLine = {
  id: number;
  sale_id: number;
  product_id: number;
  product_name?: string;
  qty: number;
  unit_price_cents: number;
  vat_rate: VatRate;
  line_base_cents: number;
  line_vat_cents: number;
  line_total_cents: number;
};

export type Sale = {
  id: number;
  customer_id: number | null;
  customer_name?: string | null;
  number: string;
  sold_at: string;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  notes: string;
  status: string;
  lines?: SaleLine[];
};

export type CashKind = "income" | "expense" | "adjustment";

export type CashMovement = {
  id: number;
  kind: CashKind;
  amount_cents: number;
  category: string;
  description: string;
  sale_id: number | null;
  occurred_at: string;
};

export type CashInput = {
  kind: CashKind;
  amount_cents: number;
  category: string;
  description?: string;
  occurred_at?: string | null;
};

export type VatBucket = {
  vat_rate: VatRate;
  base_cents: number;
  vat_cents: number;
  total_cents: number;
};

export type VatSummary = {
  from: string;
  to: string;
  buckets: VatBucket[];
  base_cents: number;
  vat_cents: number;
  total_cents: number;
};

export type DashboardStats = {
  sales_today_cents: number;
  sales_month_cents: number;
  sales_today_count: number;
  sales_month_count: number;
  cash_balance_cents: number;
  low_stock: Product[];
  vat_month_cents: number;
  base_month_cents: number;
};

export type Settings = {
  shop_name: string;
  ollama_model: string;
  ollama_url: string;
  default_vat: VatRate;
};

export type AiMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AiChatResult = {
  reply: string;
  model: string;
  offline?: boolean;
};

/** app roles */
export type UserRole = "admin" | "cajero";

export type AuthUser = {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  must_change_password: boolean;
  temp_password_issued_at: string | null;
};

export type UserInput = {
  id?: number | null;
  username: string;
  display_name: string;
  role: UserRole;
  /** Optional permanent credential on edit only; create always issues a 14-char temp password. */
  pin?: string | null;
  active?: boolean;
};

export type CreateUserResult = {
  user: AuthUser;
  /** Present only when a new temporary password was generated (create). */
  temporary_password?: string;
};

export type LoginResult = {
  user: AuthUser;
  token: string;
};
