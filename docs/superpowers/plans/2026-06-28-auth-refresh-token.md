# Auth Refresh Token & Auto Re-login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add token refresh so expired sessions redirect to login gracefully, and active users never see their session expire (sliding 72h window).

**Architecture:** Backend exposes `POST /auth/refresh` (public route, validates current JWT, issues fresh 72h JWT). Frontend intercepts 401 responses — first tries silent refresh, retries the original request; if refresh fails, dispatches `api-401` which triggers logout + redirect to `/login`. On app mount, frontend checks if token expires within 24h and proactively refreshes.

**Tech Stack:** Go Fiber v2, golang-jwt/jwt v5, React 19, Zustand persist, TanStack Query

---

## Current State (What's Missing)

| | Status |
|--|--------|
| Backend `POST /auth/refresh` | ❌ Missing |
| Frontend 401 handler in `api.ts` | ❌ Missing — 401 causes silent broken UI |
| Frontend `api-401` event dispatch | ❌ Missing |
| App.tsx `api-401` listener → logout + redirect | ❌ Missing |
| Proactive sliding refresh on mount | ❌ Missing |

---

## File Map

- **Modify:** `backend/internal/auth/handler.go` — add `Refresh()` handler
- **Modify:** `backend/internal/router/routes.go:42` — register `POST /auth/refresh`
- **Modify:** `frontend/src/services/api.ts` — add `tryRefreshToken()` + 401 intercept in `request()`
- **Modify:** `frontend/src/App.tsx` — `api-401` listener + on-mount sliding refresh in `NavigationListener`

---

### Task 1: Backend — Add `POST /auth/refresh` endpoint

**Files:**
- Modify: `backend/internal/auth/handler.go`

- [ ] **Step 1: Add `Refresh` function at end of file**

Append after the `Login` function (line 129):

```go
func Refresh(c *fiber.Ctx) error {
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Missing authorization token",
		})
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid authorization header format",
		})
	}

	cfg := configs.LoadConfig()
	tokenString := parts[1]
	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(cfg.JWTSecret), nil
	})

	if err != nil || !token.Valid {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid or expired token",
		})
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid token claims",
		})
	}

	userID, ok := claims["user_id"].(float64)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid token payload",
		})
	}

	var user model.User
	if err := database.DB.First(&user, uint64(userID)).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "User not found",
		})
	}

	newToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": user.ID,
		"uuid":    user.UUID.String(),
		"role":    user.Role,
		"exp":     time.Now().Add(time.Hour * 72).Unix(),
	})

	tokenStr, err := newToken.SignedString([]byte(cfg.JWTSecret))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to generate token",
		})
	}

	return c.JSON(fiber.Map{
		"token": tokenStr,
		"user": fiber.Map{
			"id":    user.ID,
			"uuid":  user.UUID,
			"name":  user.Name,
			"email": user.Email,
			"role":  user.Role,
		},
	})
}
```

Add `"strings"` to imports at top of file (already imported in middleware.go but handler.go needs it too):

```go
import (
	"strings"
	"time"

	"whatapps/backend/configs"
	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)
```

- [ ] **Step 2: Build to confirm no compile errors**

```powershell
cd backend
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
go build ./...
```

Expected: no output (success)

- [ ] **Step 3: Commit**

```bash
git add backend/internal/auth/handler.go
git commit -m "feat(auth): add POST /auth/refresh endpoint"
```

---

### Task 2: Backend — Register the refresh route

**Files:**
- Modify: `backend/internal/router/routes.go`

- [ ] **Step 1: Add refresh route to public auth group**

In `routes.go`, find the `authGroup` block (around line 42):

```go
// Public Routes
authGroup := app.Group("/auth")
authGroup.Post("/register", auth.Register)
authGroup.Post("/login", auth.Login)
```

Change to:

```go
// Public Routes
authGroup := app.Group("/auth")
authGroup.Post("/register", auth.Register)
authGroup.Post("/login", auth.Login)
authGroup.Post("/refresh", auth.Refresh)
```

- [ ] **Step 2: Build and restart backend to verify route registered**

```powershell
cd backend
go build -o server.exe ./cmd/server
# Kill existing server.exe if running, then:
.\server.exe
```

- [ ] **Step 3: Test refresh endpoint manually**

First login to get a token:
```powershell
$login = Invoke-RestMethod http://localhost:8080/auth/login -Method POST -ContentType "application/json" -Body '{"email":"admin@whatapps.com","password":"adminpassword"}'
$token = $login.token
```

Then refresh:
```powershell
Invoke-RestMethod http://localhost:8080/auth/refresh -Method POST -Headers @{Authorization="Bearer $token"} | ConvertTo-Json
```

Expected:
```json
{
  "token": "<new-jwt-string>",
  "user": { "id": 1, "name": "Admin User", "email": "admin@whatapps.com", "role": "admin" }
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/internal/router/routes.go
git commit -m "feat(router): register POST /auth/refresh route"
```

---

### Task 3: Frontend — Add `tryRefreshToken()` and 401 intercept in `api.ts`

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Add `tryRefreshToken` and update `request()` function**

Replace the entire `api.ts` file contents with:

```typescript
import { useStore } from '../store/useStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';

// Singleton refresh promise — prevents parallel refresh races
let _refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const currentToken = useStore.getState().token;
  if (!currentToken) return false;

  if (!_refreshPromise) {
    _refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentToken}` },
    })
      .then(async (r) => {
        if (!r.ok) return false;
        const data = await r.json();
        if (!data?.token || !data?.user) return false;
        useStore.getState().setAuth(data.token, data.user);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        _refreshPromise = null;
      });
  }

  return _refreshPromise;
}

async function request<T>(path: string, options: RequestInit = {}, _isRetry = false): Promise<T> {
  const token = useStore.getState().token;
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && !_isRetry) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return request<T>(path, options, true);
      }
      window.dispatchEvent(new CustomEvent('api-401'));
      throw new Error('Session expired. Please log in again.');
    }

    if (response.status === 403) {
      window.dispatchEvent(new CustomEvent('api-403'));
    }

    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// Decode JWT exp claim without verifying signature (safe for client-side expiry check)
export function getTokenExpiryUnix(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

export const api = {
  // Auth
  register: (data: any) => request<any>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: any) => request<any>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  refreshToken: () => tryRefreshToken(),

  // Devices
  listDevices: () => request<any[]>('/api/devices'),
  createDevice: (name: string) => request<any>('/api/devices', { method: 'POST', body: JSON.stringify({ device_name: name }) }),
  deleteDevice: (uuid: string) => request<any>(`/api/devices/${uuid}`, { method: 'DELETE' }),
  getDevice: (uuid: string) => request<any>(`/api/devices/${uuid}`),

  // Messages
  sendMessage: (data: {
    device_id: number;
    phone: string;
    message: string;
    task_id?: number;
    message_type?: string;
    media_url?: string;
    file_name?: string;
  }) => request<any>('/api/messages/send', { method: 'POST', body: JSON.stringify(data) }),
  uploadFile: (formData: FormData) =>
    request<{ url: string; file_name: string; message_type: 'image' | 'document' }>('/api/messages/upload', {
      method: 'POST',
      body: formData,
    }),
  listMessages: (deviceId?: number) =>
    request<any[]>(`/api/messages${deviceId ? `?device_id=${deviceId}` : ''}`),

  // Contacts
  listContacts: (search?: string, group?: string, page: number = 1, limit: number = 20) => {
    const params = new URLSearchParams();
    if (search) params.append('q', search);
    if (group) params.append('group', group);
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    const query = params.toString();
    return request<any>(`/api/contacts?${query}`);
  },
  listContactGroups: () => request<string[]>('/api/contacts/groups'),
  createContact: (data: { name: string; phone: string; group?: string; device_id?: number | null }) =>
    request<any>('/api/contacts', { method: 'POST', body: JSON.stringify(data) }),
  updateContact: (uuid: string, data: { name: string; phone: string; group?: string; device_id?: number | null }) =>
    request<any>(`/api/contacts/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteContact: (uuid: string) =>
    request<any>(`/api/contacts/${uuid}`, { method: 'DELETE' }),
  importWhatsAppContacts: (data: { device_id: number; group?: string }) =>
    request<any>('/api/contacts/import', { method: 'POST', body: JSON.stringify(data) }),
  listUnsavedSenders: (page: number = 1, limit: number = 20) =>
    request<any>(`/api/contacts/unsaved?page=${page}&limit=${limit}`),

  // Auto Replies
  listAutoReplies: (deviceId?: number) =>
    request<any[]>(`/api/auto-replies${deviceId ? `?device_id=${deviceId}` : ''}`),
  createAutoReply: (data: { device_id: number; keyword: string; match_type: string; reply_message: string; is_active?: boolean; create_task?: boolean; task_category_uuid?: string }) =>
    request<any>('/api/auto-replies', { method: 'POST', body: JSON.stringify(data) }),
  updateAutoReply: (uuid: string, data: { keyword?: string; match_type?: string; reply_message?: string; is_active?: boolean; create_task?: boolean; task_category_uuid?: string }) =>
    request<any>(`/api/auto-replies/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAutoReply: (uuid: string) =>
    request<any>(`/api/auto-replies/${uuid}`, { method: 'DELETE' }),

  // Tasks
  listTasks: (
    status?: string,
    deviceId?: number,
    page: number = 1,
    limit: number = 20,
    categoryUuid?: string,
    updatedBy?: string,
    unassigned?: boolean,
    startDate?: string,
    endDate?: string,
    sort?: string,
    order?: string,
    q?: string
  ) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (deviceId) params.append('device_id', deviceId.toString());
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (categoryUuid) params.append('category_uuid', categoryUuid);
    if (updatedBy) params.append('updated_by', updatedBy);
    if (unassigned !== undefined) params.append('unassigned', unassigned.toString());
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (sort) params.append('sort', sort);
    if (order) params.append('order', order);
    if (q) params.append('q', q);
    return request<any>(`/api/tasks?${params.toString()}`);
  },
  getTask: (uuid: string) => request<any>(`/api/tasks/${uuid}`),
  updateTask: (uuid: string, data: { status?: string; category_uuid?: string | null; description?: string; pic_user_id?: string | null }) =>
    request<any>(`/api/tasks/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
  listAssignees: () => request<any[]>('/api/tasks/assignees'),

  // Task Categories
  listTaskCategories: () => request<any[]>('/api/task-categories'),
  createTaskCategory: (data: { name: string; description?: string; color?: string }) =>
    request<any>('/api/task-categories', { method: 'POST', body: JSON.stringify(data) }),
  updateTaskCategory: (uuid: string, data: { name?: string; description?: string; color?: string }) =>
    request<any>(`/api/task-categories/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTaskCategory: (uuid: string) =>
    request<any>(`/api/task-categories/${uuid}`, { method: 'DELETE' }),

  // Stats
  getQueueStats: () => request<any>('/api/stats/queue'),
  getTaskStats: (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    const query = params.toString();
    return request<any>(`/api/stats/tasks${query ? `?${query}` : ''}`);
  },

  // User Management
  listUsers: () => request<any[]>('/api/users'),
  getUser: (uuid: string) => request<any>(`/api/users/${uuid}`),
  createUser: (data: any) => request<any>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (uuid: string, data: any) => request<any>(`/api/users/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (uuid: string) => request<any>(`/api/users/${uuid}`, { method: 'DELETE' }),

  // Role Management
  listRoles: () => request<any[]>('/api/roles'),
  getRole: (uuid: string) => request<any>(`/api/roles/${uuid}`),
  createRole: (data: any) => request<any>('/api/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRole: (uuid: string, data: any) => request<any>(`/api/roles/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRole: (uuid: string) => request<any>(`/api/roles/${uuid}`, { method: 'DELETE' }),
  getRolePermissions: (roleUuid: string) => request<any[]>(`/api/roles/${roleUuid}/permissions`),
  updateRolePermissions: (roleUuid: string, permissions: any[]) =>
    request<any>(`/api/roles/${roleUuid}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) }),

  // Menu & Permissions
  listMenus: () => request<any[]>('/api/menus'),
  getCurrentUserPermissions: () => request<any[]>('/api/auth/me/permissions'),
};

// WebSocket connection helper
export function connectDeviceWS(
  deviceUuid: string,
  onEvent: (type: string, data: any) => void
): WebSocket {
  const token = useStore.getState().token || '';
  const ws = new WebSocket(`${WS_URL}/devices/${deviceUuid}/ws?token=${token}`);

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type && payload.data) {
        onEvent(payload.type, payload.data);
      } else {
        onEvent('message', payload);
      }
    } catch (err) {
      logError('Failed to parse WS payload', err);
    }
  };

  ws.onerror = (err) => {
    logError('WebSocket connection error:', err);
  };

  ws.onclose = () => {
    logInfo(`WebSocket closed for device ${deviceUuid}`);
  };

  return ws;
}

function logInfo(msg: string) {
  console.log(`[WS Info] ${msg}`);
}

function logError(msg: string, err: any) {
  console.error(`[WS Error] ${msg}`, err);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat(api): add 401 intercept with silent token refresh"
```

---

### Task 4: Frontend — Handle `api-401` and sliding refresh in `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update `NavigationListener` component**

Replace the `NavigationListener` function (lines 22–36) with:

```tsx
function NavigationListener() {
  const navigate = useNavigate();
  const logout = useStore((state) => state.logout);
  const token = useStore((state) => state.token);

  // Handle 403 Forbidden
  useEffect(() => {
    const handle403 = () => navigate('/403');
    window.addEventListener('api-403', handle403);
    return () => window.removeEventListener('api-403', handle403);
  }, [navigate]);

  // Handle 401 Unauthorized — session expired, can't refresh
  useEffect(() => {
    const handle401 = () => {
      logout();
      navigate('/login', { replace: true });
    };
    window.addEventListener('api-401', handle401);
    return () => window.removeEventListener('api-401', handle401);
  }, [navigate, logout]);

  // Sliding session: if token expires within 24h, proactively refresh
  useEffect(() => {
    if (!token) return;
    const { getTokenExpiryUnix } = require('./services/api');
    const exp = getTokenExpiryUnix(token);
    if (!exp) return;
    const nowUnix = Math.floor(Date.now() / 1000);
    const secondsLeft = exp - nowUnix;
    const twentyFourHours = 24 * 60 * 60;
    if (secondsLeft > 0 && secondsLeft < twentyFourHours) {
      import('./services/api').then(({ api }) => api.refreshToken());
    }
  }, [token]);

  return null;
}
```

Note: `require()` in an effect is messy. Use the import at the top of the file instead. Update the import statement at top of `App.tsx` to include `getTokenExpiryUnix`:

```tsx
import { api, getTokenExpiryUnix } from './services/api';
```

Then replace the sliding refresh effect with:

```tsx
  // Sliding session: if token expires within 24h, proactively refresh on mount
  useEffect(() => {
    if (!token) return;
    const exp = getTokenExpiryUnix(token);
    if (!exp) return;
    const nowUnix = Math.floor(Date.now() / 1000);
    const secondsLeft = exp - nowUnix;
    if (secondsLeft > 0 && secondsLeft < 24 * 60 * 60) {
      api.refreshToken();
    }
  }, [token]);
```

Full updated `NavigationListener`:

```tsx
import { api, getTokenExpiryUnix } from './services/api';

// ... (rest of existing imports unchanged)

function NavigationListener() {
  const navigate = useNavigate();
  const logout = useStore((state) => state.logout);
  const token = useStore((state) => state.token);

  useEffect(() => {
    const handle403 = () => navigate('/403');
    window.addEventListener('api-403', handle403);
    return () => window.removeEventListener('api-403', handle403);
  }, [navigate]);

  useEffect(() => {
    const handle401 = () => {
      logout();
      navigate('/login', { replace: true });
    };
    window.addEventListener('api-401', handle401);
    return () => window.removeEventListener('api-401', handle401);
  }, [navigate, logout]);

  useEffect(() => {
    if (!token) return;
    const exp = getTokenExpiryUnix(token);
    if (!exp) return;
    const nowUnix = Math.floor(Date.now() / 1000);
    if (exp - nowUnix < 24 * 60 * 60) {
      api.refreshToken();
    }
  }, [token]);

  return null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(app): handle api-401 with logout redirect and sliding token refresh"
```

---

## Self-Review

**Spec coverage:**
- ✅ Auto re-login behavior: 401 → try refresh → if fail → logout + redirect `/login`
- ✅ Refresh token (sliding): on mount, if token < 24h remaining → silently refresh
- ✅ Backend refresh endpoint exists and validates current JWT

**No placeholders:** All code blocks complete with real implementations.

**Type consistency:**
- `getTokenExpiryUnix` exported from `api.ts`, imported in `App.tsx` ✅
- `api.refreshToken()` calls `tryRefreshToken()` internally ✅
- `tryRefreshToken()` calls `useStore.getState().setAuth(data.token, data.user)` — `setAuth` signature in store is `(token: string, user: User) => void` ✅
- Backend `Refresh()` response shape `{ token, user: { id, uuid, name, email, role } }` matches frontend `data.token` / `data.user` ✅

**Edge cases handled:**
- Parallel 401 responses → single shared `_refreshPromise` prevents multiple simultaneous refresh calls
- Retry loop prevention → `_isRetry` flag passed to `request()` — only retries once
- Refresh endpoint itself gets 401 (token truly expired) → `tryRefreshToken()` returns `false` → `api-401` dispatched → logout

---

## How It Works End-to-End

```
User has 3-day JWT
├── Within last 24h → app mount → sliding refresh → new 72h token → session continues invisibly
├── Token still valid → normal API calls work
└── Token expires (rare — only if browser closed for 3 days)
    ├── Any API call → 401 response
    ├── frontend tries POST /auth/refresh → 401 (token expired, can't refresh)
    └── api-401 event → logout() + navigate('/login') → user sees login page
```
