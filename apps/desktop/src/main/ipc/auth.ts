/**
 * Auth IPC Handlers
 *
 * Desktop login flow, based on CAP project:
 * - Dev mode: Start local HTTP Server, Web redirects back after login
 * - Prod mode: Use Deep Link (multica://), Web redirects via deep link
 *
 * Reference: https://github.com/CapSoftware/Cap
 */

import http from "node:http";
import crypto from "node:crypto";
import { ipcMain, shell, BrowserWindow } from "electron";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { DATA_DIR } from "@multica/utils";
import type { AuthUser } from "@multica/types";

// ============================================================================
// Types
// ============================================================================

export type { AuthUser };

export interface AuthData {
  sid: string;
  user: AuthUser;
  deviceId?: string;
}

// Internal type for the full file structure (deviceId is always present)
interface AuthFileData {
  sid?: string;
  user?: AuthUser;
  deviceId: string;
}

// ============================================================================
// Device ID - 设备唯一标识
// ============================================================================

const AUTH_FILE_PATH = join(DATA_DIR, "auth.json");

/**
 * Generate a UUID v4 for device identification.
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * SHA-256 hash function.
 */
function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Generate encrypted Device-Id header value.
 * Algorithm (consistent with Web):
 * 1. SHA-256 hash of deviceId, take first 32 chars
 * 2. SHA-256 hash of step 1 result, take first 8 chars
 * 3. Return: step2[0:8] + step1[0:32] = 40 chars
 */
export function generateDeviceIdHeader(deviceId: string): string {
  if (!deviceId || typeof deviceId !== "string") {
    throw new Error("[Auth] Invalid deviceId for header generation");
  }

  const hash1 = sha256(deviceId);
  const hashedDeviceId = hash1.slice(0, 32);

  const hash2 = sha256(hashedDeviceId);
  return hash2.slice(0, 8) + hashedDeviceId;
}

/**
 * Read raw auth file data, handling all edge cases.
 * Returns null if file doesn't exist or is invalid.
 */
function readAuthFile(): Partial<AuthFileData> | null {
  try {
    if (!existsSync(AUTH_FILE_PATH)) {
      return null;
    }

    const raw = readFileSync(AUTH_FILE_PATH, "utf8").trim();
    if (!raw) {
      return null;
    }

    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null) {
      console.warn("[Auth] Invalid auth file format, ignoring");
      return null;
    }

    return data as Partial<AuthFileData>;
  } catch (error) {
    // JSON parse error or file read error
    console.error("[Auth] Failed to read auth file:", error);
    return null;
  }
}

/**
 * Write auth file data to disk.
 */
function writeAuthFile(data: Partial<AuthFileData>): boolean {
  try {
    mkdirSync(dirname(AUTH_FILE_PATH), { recursive: true });
    writeFileSync(AUTH_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("[Auth] Failed to write auth file:", error);
    return false;
  }
}

/**
 * Get or create a persistent Device ID.
 * Device ID persists across logins/logouts - it represents the device, not the user.
 */
export function getOrCreateDeviceId(): string {
  const existing = readAuthFile();

  // If we have a valid deviceId, return it
  if (existing?.deviceId && typeof existing.deviceId === "string") {
    return existing.deviceId;
  }

  // Generate new deviceId and persist it
  const newDeviceId = generateUUID();
  console.log("[Auth] Generated new Device ID:", newDeviceId.slice(0, 8) + "...");

  // Preserve any existing auth data while adding deviceId
  const dataToSave: Partial<AuthFileData> = existing
    ? { ...existing, deviceId: newDeviceId }
    : { deviceId: newDeviceId };

  if (!writeAuthFile(dataToSave)) {
    // Write failed, but we can still return the generated ID for this session
    console.error("[Auth] Failed to persist new Device ID");
  }

  return newDeviceId;
}

// ============================================================================
// Storage - 认证数据持久化
// ============================================================================

function loadAuthData(): AuthData | null {
  try {
    const data = readAuthFile();

    if (!data?.sid || !data?.user?.uid) {
      return null;
    }

    return {
      sid: data.sid,
      user: data.user,
      deviceId: data.deviceId,
    };
  } catch (error) {
    console.error("[Auth] Failed to load auth data:", error);
    return null;
  }
}

function saveAuthData(sid: string, user: AuthUser): boolean {
  try {
    // Ensure we have a deviceId (get existing or create new)
    const deviceId = getOrCreateDeviceId();

    const data: AuthFileData = { sid, user, deviceId };

    if (!writeAuthFile(data)) {
      return false;
    }

    console.log("[Auth] Auth data saved successfully");
    return true;
  } catch (error) {
    console.error("[Auth] Failed to save auth data:", error);
    return false;
  }
}

/**
 * Clear auth data (logout) while preserving Device ID.
 * Device ID persists across logins - it represents the device, not the user.
 */
function clearAuthData(): boolean {
  try {
    // Read existing data to preserve deviceId
    const existing = readAuthFile();
    const deviceId = existing?.deviceId || getOrCreateDeviceId();

    // Write back only the deviceId
    const preserved: Partial<AuthFileData> = { deviceId };

    if (!writeAuthFile(preserved)) {
      console.error("[Auth] Failed to preserve Device ID during logout");
      return false;
    }

    console.log("[Auth] Auth data cleared (Device ID preserved)");
    return true;
  } catch (error) {
    console.error("[Auth] Failed to clear auth data:", error);
    return false;
  }
}

// ============================================================================
// Login - 登录流程
// ============================================================================

let authServer: http.Server | null = null;
let mainWindowRef: BrowserWindow | null = null;

/**
 * 设置主窗口引用（用于发送 auth callback 和聚焦窗口）
 */
export function setMainWindow(win: BrowserWindow): void {
  mainWindowRef = win;
}

/**
 * 登录成功后的回调 HTML 页面
 * 参考：Cap/apps/desktop/src/components/callback.template.ts
 */
const callbackHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Multica Auth</title>
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      background-color: #f8f9fa;
    }
    .container {
      padding: 30px;
      max-width: 400px;
    }
    h1 {
      font-size: 24px;
      color: #12161F;
      margin-bottom: 12px;
    }
    p {
      font-size: 16px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Sign in successful</h1>
    <p>Please return to Multica app</p>
  </div>
</body>
</html>
`;

/**
 * 开发模式：创建本地 HTTP Server 接收登录回调
 * 参考：Cap/apps/desktop/src/utils/auth.ts - createLocalServerSession
 */
async function createLocalServerSession(): Promise<number> {
  // 如果已有 server，先关闭
  if (authServer) {
    authServer.close();
    authServer = null;
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      console.log("[Auth] Local server received request:", req.url);

      try {
        const url = new URL(req.url || "/", "http://localhost");

        // 处理回调请求（只接受 /callback 路径）
        if (url.pathname === "/callback") {
          const sid = url.searchParams.get("sid");
          const userJson = url.searchParams.get("user");

          // 返回成功页面
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          });
          res.end(callbackHtml);

          console.log("[Auth] Parsed params:", { sid, userJson });

          if (sid && userJson) {
            try {
              // URLSearchParams already decodes, so just parse JSON directly
              const user = JSON.parse(userJson) as AuthUser;
              console.log("[Auth] Received auth callback:", {
                sid: sid.substring(0, 8) + "...",
                user: user.name,
              });

              // 保存认证数据
              saveAuthData(sid, user);

              // 通知渲染进程
              console.log("[Auth] mainWindowRef:", mainWindowRef ? "exists" : "null");
              if (mainWindowRef && !mainWindowRef.isDestroyed()) {
                console.log("[Auth] Sending auth:callback to renderer...");
                mainWindowRef.webContents.send("auth:callback", { sid, user });
                console.log("[Auth] auth:callback sent!");
                // 聚焦窗口
                if (mainWindowRef.isMinimized()) mainWindowRef.restore();
                mainWindowRef.focus();
              } else {
                console.log("[Auth] ERROR: mainWindowRef is null or destroyed!");
              }
            } catch (parseError) {
              console.error("[Auth] Failed to parse user data:", parseError);
            }
          }

          // 关闭 server
          setTimeout(() => {
            server.close();
            authServer = null;
          }, 1000);
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      } catch (error) {
        console.error("[Auth] Error handling request:", error);
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    });

    server.on("error", (err) => {
      console.error("[Auth] Server error:", err);
      reject(err);
    });

    // 监听随机端口
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        console.log("[Auth] Local server started on port:", port);
        authServer = server;
        resolve(port);
      } else {
        reject(new Error("Failed to get server address"));
      }
    });
  });
}

/**
 * 开始登录流程
 * 参考：Cap/apps/desktop/src/utils/auth.ts - createSignInMutation
 */
async function startLogin(): Promise<void> {
  const isDev = !!process.env.ELECTRON_RENDERER_URL;
  const webUrl =
    (import.meta as unknown as { env: Record<string, string> }).env
      .MAIN_VITE_WEB_URL || "http://localhost:3000";

  console.log("[Auth] Starting login, isDev:", isDev, "webUrl:", webUrl);

  if (isDev) {
    // 开发模式：启动本地 Server，Web 回调到这个 Server
    try {
      const port = await createLocalServerSession();
      const loginUrl = `${webUrl}/api/desktop/session?port=${port}&platform=web`;
      console.log("[Auth] Opening login URL:", loginUrl);
      shell.openExternal(loginUrl);
    } catch (error) {
      console.error("[Auth] Failed to start local server:", error);
    }
  } else {
    // 生产模式：直接打开登录页，通过 deep link 回调
    const loginUrl = `${webUrl}/api/desktop/session?platform=desktop`;
    console.log("[Auth] Opening login URL:", loginUrl);
    shell.openExternal(loginUrl);
  }
}

/**
 * 处理 Deep Link 回调（生产模式）
 * 在 main/index.ts 的 app.on('open-url') 中调用
 */
export function handleAuthDeepLink(url: string): void {
  console.log("[Auth] Handling deep link:", url);

  try {
    const parsedUrl = new URL(url);

    // multica://focus - just focus the window
    if (parsedUrl.host === "focus" || parsedUrl.pathname === "//focus") {
      console.log("[Auth] Focus request received");
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        if (mainWindowRef.isMinimized()) mainWindowRef.restore();
        mainWindowRef.focus();
      }
      return;
    }

    // multica://auth?sid=xxx&user=xxx
    if (
      parsedUrl.host === "auth" ||
      parsedUrl.pathname === "//auth" ||
      parsedUrl.pathname === "/auth"
    ) {
      const sid = parsedUrl.searchParams.get("sid");
      const userJson = parsedUrl.searchParams.get("user");

      if (sid && userJson) {
        const user = JSON.parse(decodeURIComponent(userJson)) as AuthUser;
        console.log("[Auth] Deep link auth received:", {
          sid: sid.substring(0, 8) + "...",
          user: user.name,
        });

        // 保存认证数据
        saveAuthData(sid, user);

        // 通知渲染进程
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.webContents.send("auth:callback", { sid, user });
          if (mainWindowRef.isMinimized()) mainWindowRef.restore();
          mainWindowRef.focus();
        }
      }
    }
  } catch (error) {
    console.error("[Auth] Failed to handle deep link:", error);
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

export function registerAuthHandlers(): void {
  // 加载认证数据
  ipcMain.handle("auth:load", () => {
    return loadAuthData();
  });

  // 保存认证数据
  ipcMain.handle("auth:save", (_, sid: string, user: AuthUser) => {
    return saveAuthData(sid, user);
  });

  // 清除认证数据（登出）
  ipcMain.handle("auth:clear", () => {
    return clearAuthData();
  });

  // 开始登录
  ipcMain.handle("auth:startLogin", () => {
    return startLogin();
  });

  // 获取 Device ID（原始值）
  ipcMain.handle("auth:getDeviceId", () => {
    return getOrCreateDeviceId();
  });

  // 获取加密后的 Device-Id header 值
  ipcMain.handle("auth:getDeviceIdHeader", () => {
    const deviceId = getOrCreateDeviceId();
    return generateDeviceIdHeader(deviceId);
  });
}
