/**
 * Browser fallback store (localStorage) for `vite dev` without Tauri.
 * Same surface as Rust commands so the UI works offline in the browser.
 */
import type {
  AiChatResult,
  AiMessage,
  AuthUser,
  CashInput,
  CashMovement,
  Company,
  CompanyMember,
  CreateUserResult,
  Customer,
  CustomerInput,
  DashboardStats,
  LoginResult,
  Product,
  ProductInput,
  Sale,
  SaleLineInput,
  Settings,
  UserInput,
  UserRole,
  VatSummary,
} from "../types";
import {
  billingByCompany,
  canAccessCompany,
  companiesForUser,
  filterByCompanyId,
  pickDefaultCompanyId,
  seedCompanies,
  seedCompanyMembers,
} from "../company/context";
import type { VatRate } from "../vat";
import { isVatRate, splitInclusive } from "../vat";
import { hashCredential, hashPin, validatePin, verifyCredential } from "../auth/pin";
import {
  clearTempCredentialFields,
  generateTempPassword,
  issueTempCredentialFields,
  shouldRejectExpiredTemp,
  validatePermanentPassword,
} from "../auth/password-policy";
import { countsInBusinessTotals, planCancelSale } from "../sales/cancel-sale";
import {
  netSaleTotalCents,
  planPartialReturn,
  remainingLineAmounts,
  type ReturnLineRequest,
} from "../sales/partial-return";
import { extractOllamaReply, ollamaChatBody } from "../ai/ollama-reply";
import {
  createBackupEnvelope,
  createPreMigrationBackup,
  validateBackup,
  type BackupEnvelope,
} from "../backup/backup";

const KEY = "hexa-crm-store-v5";
/** Legacy localStorage keys (pre-rename) — read once, then persist under KEY. */
const LEGACY_STORE_KEYS = [
  "nix-c-store-v5",
  "nix-c-store-v4",
  "nix-c-store-v3",
  "nix-c-store-v2",
  "nix-c-store-v1",
] as const;

/** In-memory fallback when localStorage is unavailable (tests / SSR). */
let memoryStore: Store | null = null;

type StoredUser = AuthUser & { pin_hash: string };

type SessionRec = {
  user_id: number;
  created_at: string;
  active_company_id: number | null;
};

type Store = {
  companies: Company[];
  company_members: CompanyMember[];
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  saleLines: NonNullable<Sale["lines"]>;
  cash: CashMovement[];
  stockMovements: {
    id: number;
    product_id: number;
    delta: number;
    reason: string;
    created_at: string;
  }[];
  users: StoredUser[];
  sessions: Record<string, SessionRec>;
  settings: Settings;
  seq: {
    product: number;
    customer: number;
    sale: number;
    line: number;
    cash: number;
    stock: number;
    user: number;
    company: number;
  };
};

function now() {
  return new Date().toISOString();
}

function defaultSettings(): Settings {
  return {
    shop_name: "Mi Tienda",
    ollama_model: "qwen3.5:4b",
    ollama_url: "http://127.0.0.1:11434",
    default_vat: 21,
    idle_timeout_minutes: 15,
  };
}

async function defaultUsers(t: string): Promise<StoredUser[]> {
  return [
    {
      id: 1,
      username: "admin",
      display_name: "Administrador",
      role: "admin",
      active: true,
      created_at: t,
      pin_hash: await hashPin("1234"),
      must_change_password: false,
      temp_password_issued_at: null,
    },
    {
      id: 2,
      username: "cajero",
      display_name: "Cajero",
      role: "cajero",
      active: true,
      created_at: t,
      pin_hash: await hashPin("0000"),
      must_change_password: false,
      temp_password_issued_at: null,
    },
  ];
}

function seed(): Store {
  const t = now();
  const companies = seedCompanies(t);
  const products: Product[] = [
    {
      id: 1,
      company_id: 1,
      sku: "CAF-001",
      name: "Café de especialidad 250g",
      description: "Tueste medio, origen Colombia",
      category: "Alimentación",
      stock: 40,
      min_stock: 10,
      cost_cents: 450,
      price_cents: 990,
      vat_rate: 10,
      active: true,
      created_at: t,
      updated_at: t,
    },
    {
      id: 2,
      company_id: 1,
      sku: "LIB-021",
      name: "Libro de cocina mediterránea",
      description: "Edición tapa blanda",
      category: "Libros",
      stock: 12,
      min_stock: 5,
      cost_cents: 900,
      price_cents: 1890,
      vat_rate: 4,
      active: true,
      created_at: t,
      updated_at: t,
    },
    {
      id: 3,
      company_id: 1,
      sku: "TEC-110",
      name: "Auriculares Bluetooth",
      description: "Cancelación de ruido",
      category: "Tecnología",
      stock: 8,
      min_stock: 4,
      cost_cents: 2500,
      price_cents: 4990,
      vat_rate: 21,
      active: true,
      created_at: t,
      updated_at: t,
    },
    {
      id: 4,
      company_id: 1,
      sku: "ALI-050",
      name: "Miel artesanal 500g",
      description: "Producción local",
      category: "Alimentación",
      stock: 3,
      min_stock: 6,
      cost_cents: 350,
      price_cents: 750,
      vat_rate: 10,
      active: true,
      created_at: t,
      updated_at: t,
    },
  ];

  return {
    companies,
    company_members: [],
    products,
    customers: [
      {
        id: 1,
        company_id: 1,
        name: "Cliente contado",
        email: "",
        phone: "",
        nif: "",
        notes: "Cliente genérico",
        created_at: t,
      },
    ],
    sales: [],
    saleLines: [],
    cash: [],
    stockMovements: [],
    users: [],
    sessions: {},
    settings: defaultSettings(),
    seq: { product: 4, customer: 1, sale: 0, line: 0, cash: 0, stock: 0, user: 0, company: 2 },
  };
}

function normalizeUser(u: StoredUser): StoredUser {
  return {
    ...u,
    must_change_password: !!u.must_change_password,
    temp_password_issued_at: u.temp_password_issued_at ?? null,
  };
}

function load(): Store {
  if (typeof localStorage === "undefined") {
    if (!memoryStore) memoryStore = seed();
    memoryStore.users = memoryStore.users.map(normalizeUser);
    return memoryStore;
  }
  let raw = localStorage.getItem(KEY);
  if (!raw) {
    for (const legacy of LEGACY_STORE_KEYS) {
      raw = localStorage.getItem(legacy);
      if (raw) break;
    }
  }
  if (!raw) {
    const s = seed();
    save(s);
    return s;
  }
  try {
    const parsed = JSON.parse(raw) as Store;
    if (!parsed.users) parsed.users = [];
    else parsed.users = parsed.users.map(normalizeUser);
    if (parsed.products) {
      parsed.products = parsed.products.map((pr: any) => ({
        ...pr,
        category: pr.category ?? "",
      }));
    }
    if (!parsed.sessions) parsed.sessions = {};
    if (!parsed.companies) parsed.companies = [];
    if (!parsed.company_members) parsed.company_members = [];
    if (!parsed.seq) {
      parsed.seq = {
        product: 0,
        customer: 0,
        sale: 0,
        line: 0,
        cash: 0,
        stock: 0,
        user: 0,
        company: 0,
      };
    }
    if (parsed.seq.user == null) parsed.seq.user = parsed.users.length;
    if (parsed.seq.company == null) parsed.seq.company = parsed.companies?.length ?? 0;
    for (const [tok, sess] of Object.entries(parsed.sessions)) {
      if (sess && (sess as SessionRec).active_company_id === undefined) {
        (sess as SessionRec).active_company_id = 1;
      }
      parsed.sessions[tok] = sess as SessionRec;
    }
    memoryStore = parsed;
    // Migrate legacy keys onto the canonical KEY.
    save(parsed);
    return parsed;
  } catch {
    const s = seed();
    save(s);
    return s;
  }
}

function save(s: Store) {
  memoryStore = s;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(s));
  }
}

/** Test helper: wipe store. */
export function __resetBrowserStoreForTests() {
  memoryStore = null;
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(KEY);
    for (const legacy of LEGACY_STORE_KEYS) {
      localStorage.removeItem(legacy);
    }
  }
}

/** Test helper: current localStorage product key (for rename/compat tests). */
export function __browserStoreKeyForTests() {
  return KEY;
}

/** Test helper: legacy product keys still readable once. */
export function __legacyBrowserStoreKeysForTests() {
  return [...LEGACY_STORE_KEYS];
}

/** Test helper: backdate temp password issuance for a username. */
export function __forceExpireTempForTests(username: string, ageMs: number) {
  const s = load();
  const u = s.users.find((x) => x.username === username.toLowerCase());
  if (!u) throw new Error(`user ${username} not found`);
  u.must_change_password = true;
  u.temp_password_issued_at = new Date(Date.now() - ageMs).toISOString();
  save(s);
}

async function ensureUsers(s: Store): Promise<Store> {
  if (s.users.length === 0) {
    const users = await defaultUsers(now());
    s.users = users;
    s.seq.user = 2;
    save(s);
  }
  return ensureCompanies(s);
}

function ensureCompanies(s: Store): Store {
  const t = now();
  if (!s.companies?.length) {
    s.companies = seedCompanies(t);
    s.seq.company = 2;
  }
  if (!s.company_members?.length && s.users.length >= 2) {
    s.company_members = seedCompanyMembers({
      adminId: s.users[0].id,
      cajeroId: s.users[1]?.id ?? s.users[0].id,
    });
  } else if (!s.company_members) {
    s.company_members = [];
  }
  // Backfill company_id on legacy rows
  for (const p of s.products) {
    if (p.company_id == null) p.company_id = 1;
  }
  for (const c of s.customers) {
    if (c.company_id == null) c.company_id = 1;
  }
  for (const sale of s.sales) {
    if (sale.company_id == null) sale.company_id = 1;
  }
  for (const m of s.cash) {
    if (m.company_id == null) m.company_id = 1;
  }
  save(s);
  return s;
}

function sessionCompanyId(s: Store, token?: string | null): number {
  auth(s, token);
  const sess = token ? s.sessions[token] : null;
  const user = requireSession(s, token);
  const accessible = companiesForUser(user.id, s.company_members, s.companies);
  const id = pickDefaultCompanyId(accessible, sess?.active_company_id);
  if (id == null) throw new Error("Sin empresa asignada al usuario");
  if (sess && sess.active_company_id !== id) {
    sess.active_company_id = id;
    save(s);
  }
  return id;
}

function publicUser(u: StoredUser): AuthUser {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    active: u.active,
    created_at: u.created_at,
    must_change_password: !!u.must_change_password,
    temp_password_issued_at: u.temp_password_issued_at ?? null,
  };
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function requireSession(s: Store, token?: string | null): AuthUser {
  if (!token) throw new Error("Sesión no iniciada");
  const sess = s.sessions[token];
  if (!sess) throw new Error("Sesión inválida o expirada");
  const user = s.users.find((u) => u.id === sess.user_id && u.active);
  if (!user) throw new Error("Usuario no disponible");
  return publicUser(user);
}

function requireAdmin(s: Store, token?: string | null): AuthUser {
  const u = requireSession(s, token);
  if (u.role !== "admin") throw new Error("Se requieren permisos de administrador");
  return u;
}

function auth(s: Store, token?: string | null): AuthUser {
  return requireSession(s, token);
}

function cashBalance(s: Store): number {
  return s.cash.reduce((acc, m) => {
    if (m.kind === "expense") return acc - Math.abs(m.amount_cents);
    return acc + m.amount_cents;
  }, 0);
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export const browserApi = {
  /** Public: only shop display name for login screen. No secrets. */
  public_meta(): { shop_name: string } {
    const s = load();
    return { shop_name: s.settings.shop_name || "hexa-crm" };
  },

  async login(username: string, password: string): Promise<LoginResult> {
    let s = load();
    s = await ensureUsers(s);
    const user = s.users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.active
    );
    if (!user) throw new Error("Usuario o contraseña incorrectos");
    const ok = await verifyCredential(password, user.pin_hash);
    if (!ok) throw new Error("Usuario o contraseña incorrectos");

    if (
      shouldRejectExpiredTemp({
        must_change_password: !!user.must_change_password,
        temp_password_issued_at: user.temp_password_issued_at,
      })
    ) {
      throw new Error(
        "La contraseña temporal ha caducado (más de 24 h). Contacta al administrador para que genere una nueva."
      );
    }

    const token = randomToken();
    s = ensureCompanies(s);
    const accessible = companiesForUser(user.id, s.company_members, s.companies);
    const active_company_id = pickDefaultCompanyId(accessible);
    s.sessions[token] = {
      user_id: user.id,
      created_at: now(),
      active_company_id,
    };
    const entries = Object.entries(s.sessions);
    if (entries.length > 20) {
      s.sessions = Object.fromEntries(entries.slice(-20));
    }
    save(s);
    return {
      user: publicUser(user),
      token,
      companies: accessible,
      active_company_id,
    };
  },

  logout(token?: string | null): void {
    if (!token) return;
    const s = load();
    delete s.sessions[token];
    save(s);
  },

  async session_me(token?: string | null): Promise<AuthUser | null> {
    const s = await ensureUsers(load());
    if (!token) return null;
    try {
      return requireSession(s, token);
    } catch {
      return null;
    }
  },

  list_companies(token?: string | null): Company[] {
    const s = load();
    ensureCompanies(s);
    const user = auth(s, token);
    return companiesForUser(user.id, s.company_members, s.companies);
  },

  get_active_company(token?: string | null): Company | null {
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    return s.companies.find((c) => c.id === cid) ?? null;
  },

  set_active_company(company_id: number, token?: string | null): Company {
    const s = load();
    ensureCompanies(s);
    const user = auth(s, token);
    if (!token || !s.sessions[token]) throw new Error("Sesión no iniciada");
    if (!canAccessCompany(user.id, company_id, s.company_members)) {
      throw new Error("No tienes acceso a esa empresa");
    }
    s.sessions[token].active_company_id = company_id;
    save(s);
    const c = s.companies.find((x) => x.id === company_id);
    if (!c) throw new Error("Empresa no encontrada");
    return c;
  },

  billing_by_company(token?: string | null) {
    const s = load();
    ensureCompanies(s);
    auth(s, token);
    return billingByCompany(s.sales, s.companies);
  },

  async list_users(token?: string | null): Promise<AuthUser[]> {
    const s = await ensureUsers(load());
    requireAdmin(s, token);
    return s.users
      .map(publicUser)
      .sort((a, b) => a.username.localeCompare(b.username, "es"));
  },

  async upsert_user(input: UserInput, token?: string | null): Promise<CreateUserResult> {
    const s = await ensureUsers(load());
    requireAdmin(s, token);

    const role: UserRole = input.role === "cajero" ? "cajero" : "admin";
    const username = input.username.trim().toLowerCase();
    if (!username) throw new Error("Usuario obligatorio");

    if (input.id) {
      const i = s.users.findIndex((u) => u.id === input.id);
      if (i < 0) throw new Error("Usuario no encontrado");
      if (s.users[i].role === "admin" && role !== "admin") {
        const admins = s.users.filter((u) => u.role === "admin" && u.active && u.id !== input.id);
        if (admins.length === 0) throw new Error("Debe quedar al menos un administrador");
      }
      if (input.active === false && s.users[i].role === "admin") {
        const admins = s.users.filter((u) => u.role === "admin" && u.active && u.id !== input.id);
        if (admins.length === 0) throw new Error("No puedes desactivar el último administrador");
      }
      s.users[i] = {
        ...s.users[i],
        username,
        display_name: input.display_name.trim() || username,
        role,
        active: input.active ?? s.users[i].active,
      };
      if (input.pin) {
        // admin reset: issue new 14-char temp if value is the sentinel, else set permanent
        if (input.pin === "__regen_temp__") {
          const temporary_password = generateTempPassword();
          const fields = issueTempCredentialFields();
          s.users[i].pin_hash = await hashCredential(temporary_password);
          s.users[i].must_change_password = fields.must_change_password;
          s.users[i].temp_password_issued_at = fields.temp_password_issued_at;
          save(s);
          return { user: publicUser(s.users[i]), temporary_password };
        }
        const pinOk = !validatePin(input.pin);
        const pwOk = !validatePermanentPassword(input.pin);
        if (!pinOk && !pwOk) {
          throw new Error(validatePermanentPassword(input.pin) || "Credencial no válida");
        }
        s.users[i].pin_hash = await hashCredential(input.pin);
        const cleared = clearTempCredentialFields();
        s.users[i].must_change_password = cleared.must_change_password;
        s.users[i].temp_password_issued_at = cleared.temp_password_issued_at;
      }
      save(s);
      return { user: publicUser(s.users[i]) };
    }

    if (s.users.some((u) => u.username === username)) {
      throw new Error("Ese nombre de usuario ya existe");
    }

    const temporary_password = generateTempPassword();
    const fields = issueTempCredentialFields();
    s.seq.user += 1;
    const u: StoredUser = {
      id: s.seq.user,
      username,
      display_name: input.display_name.trim() || username,
      role,
      active: input.active ?? true,
      created_at: now(),
      pin_hash: await hashCredential(temporary_password),
      must_change_password: fields.must_change_password,
      temp_password_issued_at: fields.temp_password_issued_at,
    };
    s.users.push(u);
    // New users join SHOP; admins also join DEV when present
    ensureCompanies(s);
    s.company_members.push({ company_id: 1, user_id: u.id, role });
    if (role === "admin" && s.companies.some((c) => c.id === 2)) {
      s.company_members.push({ company_id: 2, user_id: u.id, role: "admin" });
    }
    save(s);
    return { user: publicUser(u), temporary_password };
  },

  async change_own_pin(currentPin: string, newPin: string, token?: string | null): Promise<void> {
    const s = await ensureUsers(load());
    const me = requireSession(s, token);
    const stored = s.users.find((u) => u.id === me.id)!;
    if (!(await verifyCredential(currentPin, stored.pin_hash))) {
      throw new Error("Contraseña actual incorrecta");
    }
    // Permanent: allow PIN (seed users) or longer password
    const pinErr = validatePin(newPin);
    const pwErr = validatePermanentPassword(newPin);
    if (pinErr && pwErr) throw new Error(pwErr);
    stored.pin_hash = await hashCredential(newPin);
    const cleared = clearTempCredentialFields();
    stored.must_change_password = cleared.must_change_password;
    stored.temp_password_issued_at = cleared.temp_password_issued_at;
    save(s);
  },

  /** Forced first-login change: current is the temporary password. */
  async complete_forced_password_change(
    currentPassword: string,
    newPassword: string,
    token?: string | null
  ): Promise<AuthUser> {
    const s = await ensureUsers(load());
    const me = requireSession(s, token);
    const stored = s.users.find((u) => u.id === me.id)!;
    if (!stored.must_change_password) {
      throw new Error("No hay cambio de contraseña pendiente");
    }
    if (
      shouldRejectExpiredTemp({
        must_change_password: true,
        temp_password_issued_at: stored.temp_password_issued_at,
      })
    ) {
      throw new Error("La contraseña temporal ha caducado. Contacta al administrador.");
    }
    if (!(await verifyCredential(currentPassword, stored.pin_hash))) {
      throw new Error("Contraseña temporal incorrecta");
    }
    const err = validatePermanentPassword(newPassword);
    if (err) throw new Error(err);
    if (newPassword.trim() === currentPassword.trim()) {
      throw new Error("La nueva contraseña debe ser distinta a la temporal");
    }
    stored.pin_hash = await hashCredential(newPassword);
    const cleared = clearTempCredentialFields();
    stored.must_change_password = cleared.must_change_password;
    stored.temp_password_issued_at = cleared.temp_password_issued_at;
    save(s);
    return publicUser(stored);
  },

  list_products(activeOnly = true, token?: string | null): Product[] {
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    return filterByCompanyId(s.products, cid)
      .filter((p) => (activeOnly ? p.active : true))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  },

  upsert_product(input: ProductInput, token?: string | null): Product {
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    const t = now();
    const vat = input.vat_rate;
    if (!isVatRate(vat)) throw new Error("Tipo de IVA no válido");

    if (input.id) {
      const i = s.products.findIndex((p) => p.id === input.id && (p.company_id ?? 1) === cid);
      if (i < 0) throw new Error("Producto no encontrado");
      const prev = s.products[i];
      s.products[i] = {
        ...prev,
        company_id: prev.company_id ?? cid,
        sku: input.sku,
        name: input.name,
        description: input.description ?? "",
        category: input.category ?? prev.category ?? "",
        stock: input.stock ?? prev.stock,
        min_stock: input.min_stock ?? prev.min_stock,
        cost_cents: input.cost_cents,
        price_cents: input.price_cents,
        vat_rate: vat,
        active: input.active ?? prev.active,
        updated_at: t,
      };
      save(s);
      return s.products[i];
    }

    s.seq.product += 1;
    const p: Product = {
      id: s.seq.product,
      company_id: cid,
      sku: input.sku,
      name: input.name,
      description: input.description ?? "",
      category: input.category ?? "",
      stock: input.stock ?? 0,
      min_stock: input.min_stock ?? 0,
      cost_cents: input.cost_cents,
      price_cents: input.price_cents,
      vat_rate: vat,
      active: input.active ?? true,
      created_at: t,
      updated_at: t,
    };
    s.products.push(p);
    save(s);
    return p;
  },

  adjust_stock(productId: number, delta: number, reason: string, token?: string | null): Product {
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    const p = s.products.find((x) => x.id === productId && (x.company_id ?? 1) === cid);
    if (!p) throw new Error("Producto no encontrado");
    p.stock += delta;
    p.updated_at = now();
    s.seq.stock += 1;
    s.stockMovements.push({
      id: s.seq.stock,
      product_id: productId,
      delta,
      reason,
      created_at: now(),
    });
    save(s);
    return p;
  },

  list_customers(token?: string | null): Customer[] {
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    return filterByCompanyId(s.customers, cid).sort((a, b) =>
      a.name.localeCompare(b.name, "es"),
    );
  },

  upsert_customer(input: CustomerInput, token?: string | null): Customer {
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    if (input.id) {
      const i = s.customers.findIndex((c) => c.id === input.id && (c.company_id ?? 1) === cid);
      if (i < 0) throw new Error("Cliente no encontrado");
      s.customers[i] = {
        ...s.customers[i],
        company_id: s.customers[i].company_id ?? cid,
        name: input.name,
        email: input.email ?? "",
        phone: input.phone ?? "",
        nif: input.nif ?? "",
        notes: input.notes ?? "",
      };
      save(s);
      return s.customers[i];
    }
    s.seq.customer += 1;
    const c: Customer = {
      id: s.seq.customer,
      company_id: cid,
      name: input.name,
      email: input.email ?? "",
      phone: input.phone ?? "",
      nif: input.nif ?? "",
      notes: input.notes ?? "",
      created_at: now(),
    };
    s.customers.push(c);
    save(s);
    return c;
  },

  create_sale(lines: SaleLineInput[], customerId?: number | null, notes?: string, token?: string | null): Sale {
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    if (!lines.length) throw new Error("La venta no tiene líneas");

    let subtotal = 0;
    let vat = 0;
    let total = 0;
    const built: NonNullable<Sale["lines"]> = [];

    for (const line of lines) {
      const product = s.products.find(
        (p) => p.id === line.product_id && (p.company_id ?? 1) === cid,
      );
      if (!product || !product.active) throw new Error("Producto no válido");
      if (product.stock < line.qty) {
        throw new Error(`Stock insuficiente de ${product.name}`);
      }
      const unit = line.unit_price_cents ?? product.price_cents;
      const discount = line.discount_cents ?? 0;
      const lineTotal = Math.max(0, unit * line.qty - discount);
      const rate = product.vat_rate as VatRate;
      const split = splitInclusive(lineTotal, rate);
      subtotal += split.baseCents;
      vat += split.vatCents;
      total += lineTotal;
      built.push({
        id: 0,
        sale_id: 0,
        product_id: product.id,
        product_name: product.name,
        qty: line.qty,
        returned_qty: 0,
        unit_price_cents: unit,
        vat_rate: rate,
        line_base_cents: split.baseCents,
        line_vat_cents: split.vatCents,
        line_total_cents: lineTotal,
      });
    }

    s.seq.sale += 1;
    const saleId = s.seq.sale;
    const number = `T-${String(saleId).padStart(5, "0")}`;
    const soldAt = now();
    const sale: Sale = {
      id: saleId,
      company_id: cid,
      customer_id: customerId ?? null,
      customer_name: customerId
        ? s.customers.find((c) => c.id === customerId)?.name ?? null
        : null,
      number,
      sold_at: soldAt,
      subtotal_cents: subtotal,
      vat_cents: vat,
      total_cents: total,
      refunded_cents: 0,
      notes: notes ?? "",
      status: "completed",
    };
    s.sales.push(sale);

    for (const bl of built) {
      s.seq.line += 1;
      bl.id = s.seq.line;
      bl.sale_id = saleId;
      s.saleLines.push(bl);
      const p = s.products.find((x) => x.id === bl.product_id)!;
      p.stock -= bl.qty;
      p.updated_at = soldAt;
      s.seq.stock += 1;
      s.stockMovements.push({
        id: s.seq.stock,
        product_id: bl.product_id,
        delta: -bl.qty,
        reason: `Venta ${number}`,
        created_at: soldAt,
      });
    }

    s.seq.cash += 1;
    s.cash.push({
      id: s.seq.cash,
      company_id: cid,
      kind: "income",
      amount_cents: total,
      category: "ventas",
      description: `Venta ${number}`,
      sale_id: saleId,
      occurred_at: soldAt,
    });

    save(s);
    return { ...sale, lines: built };
  },

  list_sales(token?: string | null): Sale[] {
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    return filterByCompanyId(s.sales, cid).sort((a, b) =>
      b.sold_at.localeCompare(a.sold_at),
    );
  },

  get_sale(id: number, token?: string | null): Sale {
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    const sale = s.sales.find((x) => x.id === id && (x.company_id ?? 1) === cid);
    if (!sale) throw new Error("Venta no encontrada");
    const lines = s.saleLines.filter((l) => l.sale_id === id);
    return { ...sale, lines };
  },

  cancel_sale(id: number, token?: string | null): Sale {
    // Full void = return every remaining unit (works after partial returns).
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    const sale = s.sales.find((x) => x.id === id && (x.company_id ?? 1) === cid);
    if (!sale) throw new Error("Venta no encontrada");
    if (sale.status === "cancelled") throw new Error("La venta ya está anulada");
    const lines = s.saleLines.filter((l) => l.sale_id === id);
    const requests: ReturnLineRequest[] = lines
      .map((l) => ({
        line_id: l.id,
        qty: Math.max(0, l.qty - (l.returned_qty ?? 0)),
      }))
      .filter((r) => r.qty > 0);
    if (!requests.length) throw new Error("La venta ya está anulada");
    // Full void = return all remaining units (same cash/stock path as partial).
    // planCancelSale remains the pure-rules reference for tests; application is unified here.
    if (sale.status === "completed" && !(sale.refunded_cents ?? 0)) {
      planCancelSale(
        {
          id: sale.id,
          number: sale.number,
          status: sale.status,
          total_cents: sale.total_cents,
        },
        lines.map((l) => ({ product_id: l.product_id, qty: l.qty })),
      );
    }
    return this.return_sale_lines(id, requests, token);
  },

  return_sale_lines(
    id: number,
    requests: ReturnLineRequest[],
    token?: string | null,
  ): Sale {
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    const sale = s.sales.find((x) => x.id === id && (x.company_id ?? 1) === cid);
    if (!sale) throw new Error("Venta no encontrada");
    const lines = s.saleLines.filter((l) => l.sale_id === id);
    const plan = planPartialReturn(
      {
        id: sale.id,
        number: sale.number,
        status: sale.status,
        total_cents: sale.total_cents,
        refunded_cents: sale.refunded_cents ?? 0,
      },
      lines.map((l) => ({
        id: l.id,
        product_id: l.product_id,
        qty: l.qty,
        returned_qty: l.returned_qty ?? 0,
        line_total_cents: l.line_total_cents,
        line_base_cents: l.line_base_cents,
        line_vat_cents: l.line_vat_cents,
      })),
      requests,
    );

    const t = now();
    sale.status = plan.new_status;
    sale.refunded_cents = plan.new_refunded_cents;

    for (const pl of plan.lines) {
      const line = lines.find((l) => l.id === pl.line_id);
      if (line) line.returned_qty = pl.new_returned_qty;
    }

    for (const r of plan.stock_restores) {
      const p = s.products.find((x) => x.id === r.product_id);
      if (!p) continue;
      p.stock += r.qty;
      p.updated_at = t;
      s.seq.stock += 1;
      s.stockMovements.push({
        id: s.seq.stock,
        product_id: r.product_id,
        delta: r.qty,
        reason: plan.cash_description,
        created_at: t,
      });
    }

    s.seq.cash += 1;
    s.cash.push({
      id: s.seq.cash,
      company_id: cid,
      kind: "expense",
      amount_cents: plan.cash_expense_cents,
      category: plan.cash_category,
      description: plan.cash_description,
      sale_id: sale.id,
      occurred_at: t,
    });

    save(s);
    return { ...sale, lines };
  },

  list_cash_movements(token?: string | null): CashMovement[] {
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    return filterByCompanyId(s.cash, cid).sort((a, b) =>
      b.occurred_at.localeCompare(a.occurred_at),
    );
  },

  create_cash_movement(input: CashInput, token?: string | null): CashMovement {
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    s.seq.cash += 1;
    const m: CashMovement = {
      id: s.seq.cash,
      company_id: cid,
      kind: input.kind,
      amount_cents: Math.abs(input.amount_cents),
      category: input.category,
      description: input.description ?? "",
      sale_id: null,
      occurred_at: input.occurred_at || now(),
    };
    s.cash.push(m);
    save(s);
    return m;
  },

  get_cash_balance(token?: string | null): number {
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    return cashBalance({ ...s, cash: filterByCompanyId(s.cash, cid) });
  },

  vat_summary(from: string, to: string, token?: string | null): VatSummary {
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    const bucketsMap = new Map<VatRate, { base: number; vat: number; total: number }>();
    for (const r of [0, 4, 10, 21] as VatRate[]) {
      bucketsMap.set(r, { base: 0, vat: 0, total: 0 });
    }

    for (const sale of filterByCompanyId(s.sales, cid)) {
      if (!countsInBusinessTotals(sale.status)) continue;
      const d = sale.sold_at.slice(0, 10);
      if (d < from || d > to) continue;
      for (const line of s.saleLines.filter((l) => l.sale_id === sale.id)) {
        const net = remainingLineAmounts({
          id: line.id,
          product_id: line.product_id,
          qty: line.qty,
          returned_qty: line.returned_qty ?? 0,
          line_total_cents: line.line_total_cents,
          line_base_cents: line.line_base_cents,
          line_vat_cents: line.line_vat_cents,
        });
        const b = bucketsMap.get(line.vat_rate)!;
        b.base += net.base_cents;
        b.vat += net.vat_cents;
        b.total += net.total_cents;
      }
    }

    const buckets = ([0, 4, 10, 21] as VatRate[]).map((vat_rate) => {
      const b = bucketsMap.get(vat_rate)!;
      return {
        vat_rate,
        base_cents: b.base,
        vat_cents: b.vat,
        total_cents: b.total,
      };
    });

    return {
      from,
      to,
      buckets,
      base_cents: buckets.reduce((a, b) => a + b.base_cents, 0),
      vat_cents: buckets.reduce((a, b) => a + b.vat_cents, 0),
      total_cents: buckets.reduce((a, b) => a + b.total_cents, 0),
    };
  },

  dashboard_stats(token?: string | null): DashboardStats {
    const s = load();
    ensureCompanies(s);
    const cid = sessionCompanyId(s, token);
    const today = dayKey(now());
    const month = monthKey(now());
    let sales_today_cents = 0;
    let sales_month_cents = 0;
    let sales_today_count = 0;
    let sales_month_count = 0;
    let vat_month_cents = 0;
    let base_month_cents = 0;

    for (const sale of filterByCompanyId(s.sales, cid)) {
      if (!countsInBusinessTotals(sale.status)) continue;
      const netTotal = netSaleTotalCents({
        total_cents: sale.total_cents,
        refunded_cents: sale.refunded_cents ?? 0,
        status: sale.status,
      });
      // Net base/VAT from remaining line quantities
      let netVat = 0;
      let netBase = 0;
      for (const line of s.saleLines.filter((l) => l.sale_id === sale.id)) {
        const rem = remainingLineAmounts({
          id: line.id,
          product_id: line.product_id,
          qty: line.qty,
          returned_qty: line.returned_qty ?? 0,
          line_total_cents: line.line_total_cents,
          line_base_cents: line.line_base_cents,
          line_vat_cents: line.line_vat_cents,
        });
        netVat += rem.vat_cents;
        netBase += rem.base_cents;
      }
      if (dayKey(sale.sold_at) === today) {
        sales_today_cents += netTotal;
        sales_today_count += 1;
      }
      if (monthKey(sale.sold_at) === month) {
        sales_month_cents += netTotal;
        sales_month_count += 1;
        vat_month_cents += netVat;
        base_month_cents += netBase;
      }
    }

    return {
      sales_today_cents,
      sales_month_cents,
      sales_today_count,
      sales_month_count,
      cash_balance_cents: cashBalance({
        ...s,
        cash: filterByCompanyId(s.cash, cid),
      }),
      low_stock: filterByCompanyId(s.products, cid).filter(
        (p) => p.active && p.stock <= p.min_stock,
      ),
      vat_month_cents,
      base_month_cents,
    };
  },

  get_settings(token?: string | null): Settings {
    const s = load();
    auth(s, token);
    return s.settings;
  },

  update_settings(partial: Partial<Settings>, token?: string | null): Settings {
    const s = load();
    requireAdmin(s, token);
    s.settings = { ...s.settings, ...partial };
    save(s);
    return s.settings;
  },

  async ai_chat(messages: AiMessage[], token?: string | null): Promise<AiChatResult> {
    const s = load();
    auth(s, token);
    const stats = this.dashboard_stats(token);
    const low = stats.low_stock.map((p) => `${p.name} (${p.stock})`).join(", ") || "ninguno";

    // Yesterday (local) for questions like "¿cuánto ganamos ayer?"
    const yesterday = (() => {
      const d = new Date(now());
      d.setDate(d.getDate() - 1);
      return dayKey(d.toISOString());
    })();
    let sales_yesterday_cents = 0;
    let sales_yesterday_count = 0;
    for (const sale of s.sales) {
      if (!countsInBusinessTotals(sale.status)) continue;
      if (dayKey(sale.sold_at) === yesterday) {
        sales_yesterday_cents += sale.total_cents;
        sales_yesterday_count += 1;
      }
    }

    const context = {
      tienda: s.settings.shop_name,
      fecha_hoy: dayKey(now()),
      ventas_hoy_eur: (stats.sales_today_cents / 100).toFixed(2),
      tickets_hoy: stats.sales_today_count,
      ventas_ayer_eur: (sales_yesterday_cents / 100).toFixed(2),
      tickets_ayer: sales_yesterday_count,
      ventas_mes_eur: (stats.sales_month_cents / 100).toFixed(2),
      tickets_mes: stats.sales_month_count,
      caja_eur: (stats.cash_balance_cents / 100).toFixed(2),
      iva_mes_eur: (stats.vat_month_cents / 100).toFixed(2),
      stock_bajo: low,
      productos: s.products
        .filter((p) => p.active)
        .slice(0, 20)
        .map((p) => ({
          name: p.name,
          stock: p.stock,
          pvp: (p.price_cents / 100).toFixed(2),
          iva: p.vat_rate,
        })),
    };

    const system = `Eres el asistente de la tienda "${s.settings.shop_name}" en España.
Responde en español, breve y práctico. Precios en EUR con IVA incluido.
Contexto actual (JSON compacto): ${JSON.stringify(context)}
No inventes datos fuera del contexto. Si falta info, dilo.`;

    try {
      const baseUrl = s.settings.ollama_url.replace(/\/$/, "");
      // think:false required for qwen3.5 / reasoning models (empty content otherwise).
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          ollamaChatBody(s.settings.ollama_model, [
            { role: "system", content: system },
            ...messages,
          ]),
        ),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Ollama HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
      }
      const data = (await res.json()) as {
        message?: { content?: string; thinking?: string };
        model?: string;
        error?: string;
      };
      if (data.error) {
        throw new Error(data.error);
      }
      const reply = extractOllamaReply(data.message);
      return {
        reply,
        model: data.model || s.settings.ollama_model,
      };
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      const offline = /fetch|network|Failed to fetch|ECONNREFUSED|connect/i.test(detail);
      return {
        reply: offline
          ? "No puedo conectar con Ollama. Comprueba que `ollama serve` está activo y el modelo está instalado. La app sigue funcionando sin IA."
          : `Error de Ollama: ${detail}`,
        model: s.settings.ollama_model,
        offline: true,
      };
    }
  },

  ollama_health(token?: string | null): Promise<{ ok: boolean; models: string[] }> {
    const s = load();
    auth(s, token);
    return fetch(`${s.settings.ollama_url}/api/tags`)
      .then(async (res) => {
        if (!res.ok) return { ok: false, models: [] as string[] };
        const data = (await res.json()) as { models?: { name: string }[] };
        return { ok: true, models: (data.models ?? []).map((m) => m.name) };
      })
      .catch(() => ({ ok: false, models: [] as string[] }));
  },

  async reset_demo(token?: string | null): Promise<void> {
    const s = load();
    if (s.users.length) requireAdmin(s, token);
    const fresh = seed();
    const users = await defaultUsers(now());
    fresh.users = users;
    fresh.seq.user = 2;
    save(fresh);
  },

  /** Full store export (admin). Versioned + checksum — see docs/BACKUP.md */
  async export_backup(token?: string | null): Promise<BackupEnvelope> {
    const s = load();
    requireAdmin(s, token);
    // Strip session tokens from backup for safer transport
    const { sessions: _s, ...rest } = s;
    return createBackupEnvelope({ ...rest, sessions: {} });
  },

  /** Validate and restore store from envelope (admin). Rejects corrupt copies. */
  async restore_backup(raw: unknown, token?: string | null): Promise<void> {
    const s = load();
    requireAdmin(s, token);
    const v = await validateBackup(raw);
    if (!v.ok) throw new Error(v.error);
    const payload = v.envelope.payload as Store;
    if (!payload || !Array.isArray(payload.products) || !Array.isArray(payload.users)) {
      throw new Error("Copia inválida: estructura de tienda incompleta.");
    }
    // Keep current sessions empty after restore — force re-login
    save({ ...payload, sessions: {} });
  },

  /** Snapshot before schema/migration-like operations (admin). */
  async pre_migration_backup(reason: string, token?: string | null): Promise<BackupEnvelope> {
    const s = load();
    requireAdmin(s, token);
    const { sessions: _s, ...rest } = s;
    return createPreMigrationBackup({ ...rest, sessions: {} }, reason);
  },
};
