export class ApiError extends Error {
  status: number;
  payload?: Record<string, unknown>;
  sessionExpired: boolean;
  networkError: boolean;
  vpnHint: boolean;
  directHint: boolean;
  canConnectVpn: boolean;
  connectionAction: boolean;

  constructor(
    message: string,
    status: number,
    payload?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.sessionExpired = Boolean(payload?.session_expired || status === 401);
    this.networkError = Boolean(payload?.network_error || payload?.network);
    this.vpnHint = Boolean(payload?.vpn_hint);
    this.directHint = Boolean(payload?.direct_hint);
    this.canConnectVpn = Boolean(payload?.can_connect_vpn);
    this.connectionAction = Boolean(payload?.connection_action || payload?.session_expired);
  }
}

export async function apiRequest<T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
  },
): Promise<T> {
  const method = options?.method ?? (options?.body !== undefined ? "POST" : "GET");
  const init: RequestInit = {
    method,
    signal: options?.signal,
    credentials: "same-origin",
  };

  if (options?.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new ApiError(
      "无法连接到本地吉大综合服务，请确认程序正在运行，或关闭旧标签页后重新双击「启动吉大综合.bat」",
      0,
      { network: true, network_error: true },
    );
  }
  let data: Record<string, unknown> | null = null;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }

  if (data && data.offline === true && data.ok !== false && (res.ok || res.status === 401)) {
    return data as T;
  }

  if (!res.ok || (data && data.ok === false)) {
    const msg =
      (typeof data?.error === "string" && data.error) ||
      (res.status === 401
        ? "登录会话已过期或未授权，请重新登录"
        : `请求失败 (${res.status})`);
    throw new ApiError(msg, res.status, data ?? undefined);
  }

  return data as T;
}

export const apiGet = <T>(path: string, signal?: AbortSignal) =>
  apiRequest<T>(path, { method: "GET", signal });

export const apiPost = <T>(path: string, body: unknown = {}, signal?: AbortSignal) =>
  apiRequest<T>(path, { method: "POST", body, signal });

export const apiDelete = <T>(path: string) =>
  apiRequest<T>(path, { method: "DELETE" });
