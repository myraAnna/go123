import { API_BASE } from "@/constants/api";

export type DraftItem = {
  name: string;
  priceCents: number;
  category: string;
};

export type MenuItem = {
  id: string;
  name: string;
  priceCents: number;
  category: string;
};

export class ApiError extends Error {
  constructor(public status: number, message?: string) {
    super(message ?? `Request failed: ${status}`);
  }
}

export async function uploadOnboardingImage(file: File): Promise<DraftItem[]> {
  const fd = new FormData();
  fd.append("image", file);

  const res = await fetch(`${API_BASE}/v1/onboarding/image`, {
    method: "POST",
    body: fd,
  });

  if (!res.ok) throw new ApiError(res.status);

  const data = (await res.json()) as { items: DraftItem[] };
  return data.items;
}

export async function submitOnboardingForm(
  items: { name: string; priceCents: number }[],
): Promise<MenuItem[]> {
  const res = await fetch(`${API_BASE}/v1/onboarding/form`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });

  if (!res.ok) throw new ApiError(res.status);

  const data = (await res.json()) as { items: MenuItem[] };
  return data.items;
}
