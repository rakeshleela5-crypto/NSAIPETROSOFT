export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:8000';

export interface HealthResponse {
  status: string;
  database: string;
  environment: string;
  timestamp: string;
}

export interface Item {
  id: number;
  title: string;
  description?: string | null;
  created_at: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed with status: ${response.status}`);
  }
  return response.json();
}

export async function fetchItems(): Promise<Item[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/items`);
  if (!response.ok) {
    throw new Error(`Failed to fetch items with status: ${response.status}`);
  }
  return response.json();
}

export async function createItem(data: { title: string; description?: string }): Promise<Item> {
  const response = await fetch(`${API_BASE_URL}/api/v1/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`Failed to create item with status: ${response.status}`);
  }
  return response.json();
}
