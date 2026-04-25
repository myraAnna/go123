import { API_BASE } from "@/constants/api";
import { ApiError } from "@/queries/onboarding";

export type OrderLine = {
  menuItemId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type CreatedOrder = {
  orderId: string;
  items: OrderLine[];
  totalCents: number;
};

export async function createOrder(
  items: { menuItemId: string; qty: number }[],
): Promise<CreatedOrder> {
  const res = await fetch(`${API_BASE}/v1/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });

  if (!res.ok) throw new ApiError(res.status);

  return (await res.json()) as CreatedOrder;
}

export function paidCallbackUrl(orderId: string): string {
  const email = "kaniellau12@gmail.com";
  return `${API_BASE}/callback/orders/${orderId}/paid?email=${encodeURIComponent(email)}`;
}
