export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: string[]) {
    super(message);
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/login") {
    window.location.reload(); // phiên hết hạn → hiện trang đăng nhập
  }
  if (!res.ok) throw new ApiError(data.error ?? `Lỗi ${res.status}`, res.status, data.details);
  return data as T;
}

export const get = <T = any>(p: string) => api<T>("GET", p);
export const post = <T = any>(p: string, b: unknown = {}) => api<T>("POST", p, b);
export const patch = <T = any>(p: string, b: unknown) => api<T>("PATCH", p, b);
export const put = <T = any>(p: string, b: unknown) => api<T>("PUT", p, b);
export const del = <T = any>(p: string) => api<T>("DELETE", p);

/** Tải file từ API (docx/xlsx) – hiển thị lỗi nếu server trả JSON lỗi. */
export async function download(path: string): Promise<void> {
  const res = await fetch(path);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error ?? `Lỗi ${res.status}`, res.status);
  }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const name = decodeURIComponent(cd.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? cd.match(/filename="([^"]+)"/)?.[1] ?? "export");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
