import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// ── Types ──────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  is_admin: boolean;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface Medication {
  id: number;
  name: string;
  active_ingredient: string | null;
  unit: string;
  notification_threshold_days: number;
  notes: string | null;
  created_at: string;
}

export interface Therapy {
  id: number;
  medication_id: number;
  dose_per_intake: number;
  intakes_per_day: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface StockEntry {
  id: number;
  medication_id: number;
  quantity: number;
  notes: string | null;
  created_at: string;
}

export interface StockLevel {
  medication: Medication;
  remaining_quantity: number;
  days_remaining: number | null;
  daily_dose: number;
  therapies_active: number;
}

export interface Setting {
  key: string;
  value: string | null;
}

export interface BackupFile {
  filename: string;
  size_bytes: number;
  created_at: string;
}

export interface ActiveIngredientSuggestion {
  active_ingredient: string;
  product_name: string;
  source_name: string;
  source_url: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────

export const authApi = {
  login: (username: string, password: string) =>
    api.post<Token>("/auth/login", { username, password }),
  register: (username: string, password: string) =>
    api.post<User>("/auth/register", { username, password }),
  me: () => api.get<User>("/auth/me"),
};

// ── Medications ───────────────────────────────────────────────────────────

export const medicationsApi = {
  list: () => api.get<Medication[]>("/medications"),
  get: (id: number) => api.get<Medication>(`/medications/${id}`),
  lookupActiveIngredients: (name: string) =>
    api.get<ActiveIngredientSuggestion[]>("/medications/active-ingredients/lookup", {
      params: { name },
    }),
  create: (data: Omit<Medication, "id" | "created_at">) =>
    api.post<Medication>("/medications", data),
  update: (id: number, data: Partial<Omit<Medication, "id" | "created_at">>) =>
    api.patch<Medication>(`/medications/${id}`, data),
  delete: (id: number) => api.delete(`/medications/${id}`),
};

// ── Therapies ─────────────────────────────────────────────────────────────

export const therapiesApi = {
  list: (medication_id?: number) =>
    api.get<Therapy[]>("/therapies", { params: medication_id ? { medication_id } : {} }),
  get: (id: number) => api.get<Therapy>(`/therapies/${id}`),
  create: (data: Omit<Therapy, "id" | "created_at">) =>
    api.post<Therapy>("/therapies", data),
  update: (id: number, data: Partial<Omit<Therapy, "id" | "created_at" | "medication_id">>) =>
    api.patch<Therapy>(`/therapies/${id}`, data),
  activate: (id: number) => api.post<Therapy>(`/therapies/${id}/activate`),
  deactivate: (id: number) => api.post<Therapy>(`/therapies/${id}/deactivate`),
  delete: (id: number) => api.delete(`/therapies/${id}`),
};

// ── Stock ─────────────────────────────────────────────────────────────────

export const stockApi = {
  levels: () => api.get<StockLevel[]>("/stock/levels"),
  level: (medication_id: number) =>
    api.get<StockLevel>(`/stock/levels/${medication_id}`),
  entries: (medication_id?: number) =>
    api.get<StockEntry[]>("/stock/entries", {
      params: medication_id ? { medication_id } : {},
    }),
  addEntry: (data: { medication_id: number; quantity: number; notes?: string }) =>
    api.post<StockEntry>("/stock/entries", data),
  updateEntry: (id: number, data: { quantity?: number; notes?: string | null }) =>
    api.patch<StockEntry>(`/stock/entries/${id}`, data),
  deleteEntry: (id: number) => api.delete(`/stock/entries/${id}`),
};

// ── Settings ──────────────────────────────────────────────────────────────

export const settingsApi = {
  list: () => api.get<Setting[]>("/settings"),
  get: (key: string) => api.get<Setting>(`/settings/${key}`),
  update: (key: string, value: string | null) =>
    api.put<Setting>(`/settings/${key}`, { value }),
};

// ── Backup ────────────────────────────────────────────────────────────────

export const backupApi = {
  list: () => api.get<BackupFile[]>("/backup"),
  create: () => api.post<BackupFile>("/backup/create"),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<BackupFile>("/backup/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  download: (filename: string) =>
    api.get(`/backup/download/${filename}`, { responseType: "blob" }),
  restore: (filename: string) => api.post(`/backup/restore/${filename}`),
  delete: (filename: string) => api.delete(`/backup/${filename}`),
};

export default api;
