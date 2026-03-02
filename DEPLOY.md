# Deploy Guide — 100% Miễn Phí

Hướng dẫn deploy lên Render + Vercel hoàn toàn miễn phí, dùng **OSRM Public Server** để vẽ đường bộ thật.

> **OSRM Public Server** (`router.project-osrm.org`) cho kết quả routing theo đường bộ thật.  
> Phù hợp cho: portfolio, demo, showcase.  
> Fallback: set `USE_MOCK_OSRM=true` để dùng Haversine offline khi không cần routing thật.

---

## Kiến trúc

```
Vercel (Frontend React)           — miễn phí mãi mãi
    │ gọi API trực tiếp
    ▼
Render Web Service (Backend)      — miễn phí (sleep sau 15 phút không dùng)
    │ gọi OSRM Public Server (router.project-osrm.org)
    ▼
Upstash Redis (optional)          — miễn phí (10,000 req/ngày)
```

---

## Bước 1 — Upstash Redis (1 phút)

1. Truy cập https://upstash.com → **Create Database**
2. Chọn **Redis** → Region: **Singapore** (gần nhất với Vietnam)
3. Sau khi tạo xong, copy **REDIS_URL** dạng:
   ```
   rediss://default:<password>@<host>.upstash.io:6379
   ```
4. Lưu lại URL này để dùng ở Bước 2.

---

## Bước 2 — Render: Deploy Backend

### 2.1 Tạo tài khoản Render

Truy cập https://render.com → Đăng ký bằng GitHub.

### 2.2 Deploy từ GitHub (Blueprint — khuyến nghị)

1. Nhấn **New** → **Blueprint** (sử dụng `render.yaml`)
2. Chọn repo → Render tự detect `render.yaml` và tạo **1 service**:
   - `routing-backend` — FastAPI backend (dùng OSRM Public Server)

### 2.3 Deploy thủ công (nếu Blueprint không hoạt động)

1. **New** → **Web Service** → Connect GitHub repo
2. Cấu hình:
   - **Name:** `routing-backend`
   - **Runtime:** Docker
   - **Dockerfile Path:** `./backend/Dockerfile`
   - **Root Directory:** (để trống)
   - **Plan:** Free
3. Thêm **Environment Variables**:

   | Key | Value |
   |-----|-------|
   | `OSRM_BASE_URL` | `https://router.project-osrm.org` |
   | `REDIS_URL` | `rediss://default:...@....upstash.io:6379` |
   | `CACHE_TTL` | `300` |
   | `REQUEST_TIMEOUT` | `15.0` |

4. Deploy → Chờ build xong (~3 phút)
5. Copy **Service URL** (dạng `https://routing-backend.onrender.com`)

### 2.4 Kiểm tra backend

```bash
curl https://routing-backend.onrender.com/health
# {"status": "ok"}

curl "https://routing-backend.onrender.com/api/route?originLat=21.0285&originLng=105.8542&destLat=10.8231&destLng=106.6297"
# {"distanceMeters": ..., "durationSeconds": ...}
```

> **Lưu ý:** Render free tier **sleep sau 15 phút** không có request.  
> Request đầu tiên sau khi sleep sẽ cần ~30 giây để wake up — bình thường.

---

## Bước 3 — Vercel: Deploy Frontend

### 3.1 Tạo tài khoản Vercel

Truy cập https://vercel.com → Đăng ký bằng GitHub.

### 3.2 Import project

1. **Add New Project** → Import `self-hosted-routing-system`
2. Vercel tự detect Vite framework
3. Cấu hình **Root Directory**: `frontend`
4. Thêm **Environment Variable**:

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://routing-backend.onrender.com` |

5. Nhấn **Deploy** → Chờ ~2 phút

### 3.3 Kiểm tra

Truy cập URL Vercel cấp (dạng `https://self-hosted-routing-system.vercel.app`):
- Giao diện map hiện ra ✓
- Nhập địa điểm, tính tuyến đường → geometry đường bộ thật hiển thị trên map ✓
- Nút VI/EN hoạt động ✓

---

## Tóm tắt URLs sau khi deploy

| Service | URL |
|---------|-----|
| Frontend | `https://<project>.vercel.app` |
| Backend API | `https://routing-backend.onrender.com` |
| Swagger UI | `https://routing-backend.onrender.com/docs` |

---

## Lưu ý quan trọng

### Render Free Tier Limitations

| Giới hạn | Chi tiết |
|----------|----------|
| Sleep sau 15 phút | Request đầu sau sleep mất ~30s |
| 750 giờ/tháng | Đủ cho 1 service chạy suốt tháng |
| Không có persistent disk | Không lưu file |
| RAM 512 MB | Đủ cho backend (gọi OSRM Public Server qua HTTP) |

### Upstash Free Tier Limitations

| Giới hạn | Chi tiết |
|----------|----------|
| 10,000 commands/ngày | Đủ cho demo |
| 256 MB storage | Đủ cho cache routes |
| 1 database | Chỉ 1 Redis instance |

### Xử lý CORS

Backend FastAPI đã cấu hình `allow_origins=["*"]` cho development.  
Cho production, cập nhật `backend/app/main.py` để chỉ cho phép Vercel domain:

```python
allow_origins=[
    "https://<your-project>.vercel.app",
    "http://localhost:3000",
]
```

Sau đó redeploy backend trên Render.

---

## Cập nhật sau khi thay đổi code

### Render tự động redeploy
Render tự động rebuild khi push lên GitHub branch main.

### Vercel tự động redeploy
Vercel tự động rebuild khi push lên GitHub branch main.

### Đổi tên Render service
Nếu đổi tên service `routing-backend`, cập nhật `VITE_API_URL` trong Vercel:
```
https://<new-service-name>.onrender.com
```

---

## Deploy Production (OSRM self-hosted) — Tùy chọn nâng cấp

Khi cần routing không phụ thuộc OSRM Public Server (SLA cao hơn, không rate limit), tự host OSRM:

| Option | Chi phí | RAM | Phù hợp |
|--------|---------|-----|---------|
| Render Starter | $7/tháng | 2 GB | OSRM Vietnam (cần ~3.5GB → không đủ) |
| Oracle Cloud Free | Miễn phí | 24 GB | OSRM Vietnam chạy tốt |
| VPS Hetzner CX22 | €4/tháng | 4 GB | OSRM Vietnam (vừa đủ) |

Xem hướng dẫn chi tiết tại `docs/PROJECT_DOCUMENTATION.md`.
