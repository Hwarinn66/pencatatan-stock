export interface Product {
  id: number;
  sku: string;
  name: string;
  category_id: number;
  category_name: string;
  unit: string;
  stock: number;
  location_id: number;
  location_code: string;
  qr_token: string;
  image: string | null;
  description: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}
export interface StockTransaction {
  id: number;
  transaction_number: string;
  product_id: number;
  location_id: number;
  location_code: string;
  transaction_type: "IN" | "OUT" | "ADJUSTMENT";
  quantity: number | null;
  stock_before: number | null;
  stock_after: number | null;
  status: "PENDING" | "APPROVED" | "CANCELLED";
  scanned_at: string;
  approved_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
  name: string;
  sku: string;
  unit: string;
  stock: number;
}
export interface Lookup {
  id: number;
  name: string;
  code?: string;
  active?: number;
  description?: string;
}
