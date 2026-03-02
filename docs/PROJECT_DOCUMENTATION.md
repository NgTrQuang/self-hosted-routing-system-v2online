# PROJECT DOCUMENTATION
# Self-Hosted Routing System (Vietnam)

---

## Document Control

| Field         | Value                                      |
|---------------|--------------------------------------------|
| Project Name  | Self-Hosted Routing System                 |
| Version       | 1.1.2                                      |
| Status        | Active                                     |
| Last Updated  | 2026-03-02                                 |
| Author        | QUANG                                      |
| Repository    | https://github.com/NgTrQuang/self-hosted-routing-system |
| Language      | Python 3.11+ / React 18                    |

---

## Changelog

| Version | Date       | Author | Description                              |
|---------|------------|--------|------------------------------------------|
| 1.0.0   | 2026-03-02 | QUANG  | Initial project scaffold and full spec   |
| 1.0.1   | 2026-03-02 | QUANG  | Cleanup: removed unused directories Controllers/, Models/, Services/ from backend/ |
| 1.0.2   | 2026-03-02 | QUANG  | Added demo mode: mock-osrm stub, docker-compose.demo.yml, .gitignore, .env.example |
| 1.0.3   | 2026-03-02 | QUANG  | Added React frontend: map view, route form, matrix table, Leaflet + TailwindCSS     |
| 1.0.4   | 2026-03-02 | QUANG  | Added location search: Nominatim geocoding, SearchBox component, map flyTo on select |
| 1.0.5   | 2026-03-02 | QUANG  | Improved search accuracy: dual-query strategy, Vietnam viewbox, addressdetails, type tags |
| 1.1.0   | 2026-03-02 | QUANG  | Real OSRM data: geometry polyline, turn-by-turn steps, /api/trip TSP delivery optimization |
| 1.1.1   | 2026-03-02 | QUANG  | Fixed OSRM healthcheck (image has no curl/nc), removed blocking depends_on condition |
| 1.1.2   | 2026-03-02 | QUANG  | Added i18n: Vietnamese / English language toggle with localStorage persistence |

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Folder Structure](#4-folder-structure)
5. [Environment Variables](#5-environment-variables)
6. [Quick Start — Production Mode](#6-quick-start--production-mode)
7. [Quick Start — Demo Mode](#7-quick-start--demo-mode)
8. [OSRM Data Preprocessing](#8-osrm-data-preprocessing)
9. [API Reference](#9-api-reference)
10. [Frontend](#10-frontend)
11. [Caching Strategy](#11-caching-strategy)
12. [Performance Requirements](#12-performance-requirements)
13. [Security Rules](#13-security-rules)
14. [Monitoring & Health](#14-monitoring--health)
15. [Scaling Strategy](#15-scaling-strategy)
16. [Known Issues & Limitations](#16-known-issues--limitations)
17. [Maintenance Guide](#17-maintenance-guide)
18. [AI/ML Extension Roadmap](#18-aiml-extension-roadmap)

---

## 1. Project Overview

### Purpose

Self-hosted routing system thay thế hoàn toàn các API định tuyến thương mại (Google Maps, Here, Mapbox) bằng giải pháp miễn phí, tự chủ dữ liệu, sử dụng dữ liệu OpenStreetMap cho Việt Nam.

| Thay thế                        | Bằng                          |
|---------------------------------|-------------------------------|
| Google Distance Matrix API      | OSRM `/table/v1/` — ma trận khoảng cách/thời gian |
| Google Routes API               | OSRM `/route/v1/` — tuyến đường tối ưu            |
| Google Directions API           | OSRM steps — chỉ đường từng bước                  |
| Route optimization (TSP)        | OSRM `/trip/v1/` — tối ưu thứ tự giao hàng        |

### Tính năng chính (v1.1.2)

- **Tuyến đường thực** — vẽ đường theo đường bộ thực tế từ OSM, không phải đường thẳng
- **Chỉ đường turn-by-turn** — hướng dẫn từng bước rẽ trái/phải/thẳng
- **Tối ưu giao hàng nhiều điểm (TSP)** — tự động sắp xếp thứ tự dừng ngắn nhất
- **Ma trận khoảng cách** — tính đồng thời N×M cặp điểm
- **Tìm kiếm địa điểm** — Nominatim geocoding với debounce, dual-query, viewbox Việt Nam
- **Giao diện song ngữ** — Tiếng Việt / Tiếng Anh, lưu localStorage
- **Redis cache** — cache kết quả, giảm tải OSRM cho các truy vấn lặp lại
- **Demo mode** — chạy ngay không cần dữ liệu bản đồ (mock OSRM Haversine)

### Goals

- Zero chi phí API bên ngoài
- Toàn quyền kiểm soát dữ liệu (data sovereignty)
- Production-ready: stateless, containerized, horizontally scalable
- Mở rộng được: thiết kế cho AI/ML tích hợp sau (ETA, surge pricing)

---

## 2. Architecture

### System Diagram

```
┌────────────────────────────────────────────────────┐
│  Browser / Client                                  │
│  React 18 + Leaflet + TailwindCSS   :3000          │
└────────────────────┬───────────────────────────────┘
                     │ HTTP /api/*
                     ▼
┌────────────────────────────────────────────────────┐
│  FastAPI Backend (Python 3.11)      :8080          │
│  - Input validation (Pydantic)                     │
│  - Redis cache layer                               │
│  - OSRM HTTP client (httpx async)                  │
│  Endpoints:                                        │
│    GET  /health                                    │
│    GET  /api/route   ← tuyến + geometry + steps    │
│    POST /api/matrix  ← ma trận N×M                 │
│    POST /api/trip    ← tối ưu TSP giao hàng        │
└────────────────────┬───────────────────────────────┘
          │ HTTP                   │ async
          ▼                       ▼
┌─────────────────┐     ┌─────────────────────────┐
│  OSRM Backend   │     │  Redis 7 Cache          │
│  :5000          │     │  :6379                  │
│  MLD algorithm  │     │  TTL: 300s              │
│  vietnam.osrm   │     └─────────────────────────┘
└─────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  osrm-data/ (volume)        │
│  vietnam-260301.osrm + files│
└─────────────────────────────┘
```

### Design Principles

- **OSRM là container riêng biệt** — Backend không chứa routing logic
- **Backend stateless** — Giao tiếp hoàn toàn qua HTTP, không có local state
- **Cache-first** — Redis giảm tải OSRM cho các query lặp lại
- **Fail-graceful** — Redis down không làm hỏng routing request
- **Frontend độc lập** — Nginx serve static build, proxy `/api/*` về backend

---

## 3. Tech Stack

### Frontend


| Component      | Technology                  | Ghi chú                        |
|----------------|-----------------------------|--------------------------------|
| Framework      | React 18                    | Vite build tool                |
| Map            | Leaflet.js + react-leaflet  | Interactive map, polyline      |
| Styling        | TailwindCSS                 | Utility-first CSS              |
| Icons          | lucide-react                |                                |
| Geocoding      | Nominatim (OSM)             | Tìm kiếm địa điểm, free       |
| i18n           | Custom Context + Hook       | VI / EN, localStorage persist  |
| Web Server     | Nginx Alpine                | Serve static + proxy /api      |

### Routing Engine

| Component | Technology          | Ghi chú                   |
|-----------|---------------------|---------------------------|
| Engine    | osrm/osrm-backend   | v5.26, MLD algorithm      |
| Data      | OpenStreetMap       | Vietnam `.osm.pbf`        |
| Profile   | Car (`car.lua`)     | Switchable to bike/foot   |
| Endpoints | /route /table /trip | Tất cả đều được sử dụng  |

### Infrastructure

| Component     | Technology          | Ghi chú               |
|---------------|---------------------|-----------------------|
| Container     | Docker              | Engine 20.10+         |
| Orchestration | Docker Compose v2   |                       |
| Cache         | Redis 7 Alpine      |                       |
| Proxy         | Nginx Alpine        | Frontend container    |

---

## 4. Folder Structure

```
self-hosted-routing-system/
│
├── backend/
│   ├── app/
│   │   ├── main.py             ← FastAPI entry point, CORS, health check
│   │   ├── config.py           ← Env config: OSRM_BASE_URL, REDIS_URL, CACHE_TTL, REQUEST_TIMEOUT
│   │   ├── routers/
│   │   │   └── route.py        ← GET /api/route  POST /api/matrix  POST /api/trip
│   │   ├── services/
│   │   │   └── osrm_service.py ← get_route(), get_matrix(), get_trip() — async OSRM client
│   │   └── schemas/
│   │       └── route_schema.py ← Pydantic: RouteResponse, MatrixRequest/Response,
│   │                                        TripRequest/Response, RouteStep, TripLeg
│   ├── requirements.txt        ← fastapi uvicorn httpx pydantic redis polyline
│   └── Dockerfile              ← python:3.11-slim, uvicorn :8080
│
├── mock-osrm/                  ← Demo mode: mock OSRM stub (Haversine, không cần map data)
│   ├── main.py                 ← FastAPI /route/v1 và /table/v1 giả lập
│   ├── requirements.txt
│   └── Dockerfile
│
├── osrm-data/                  ← [KHÔNG COMMIT] Dữ liệu bản đồ preprocessed
│   ├── vietnam-260301.osm.pbf  ← File OSM gốc (download từ Geofabrik)
│   ├── vietnam-260301.osrm     ← File OSRM chính (sau preprocess)
│   └── vietnam-260301.osrm.*  ← ~20 file phụ trợ (cells, geometry, names...)
│
├── scripts/
│   └── preprocess.sh           ← Script preprocess OSM data (extract→partition→customize)
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx            ← React entry point, bọc I18nProvider
│   │   ├── App.jsx             ← UI chính: map, 3 tabs (Route/Delivery/Matrix), language toggle
│   │   ├── SearchBox.jsx       ← Nominatim search: debounce, dual-query, dropdown
│   │   ├── api.js              ← fetchRoute(), fetchMatrix(), fetchTrip(), checkHealth()
│   │   ├── index.css           ← Tailwind directives + Leaflet styles
│   │   └── i18n/
│   │       ├── index.jsx       ← I18nProvider context + useI18n() hook
│   │       ├── vi.js           ← Bản dịch Tiếng Việt (60+ keys)
│   │       └── en.js           ← English translations (60+ keys)
│   ├── index.html
│   ├── vite.config.js          ← Vite + React plugin, proxy /api → backend
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── nginx.conf              ← Nginx: serve /dist, proxy /api + /health → backend:8080
│   ├── Dockerfile              ← Multi-stage: node:20-alpine build → nginx:alpine serve
│   └── package.json
│
├── docker-compose.yml          ← Production: OSRM (real data) + backend + frontend + redis
├── docker-compose.demo.yml     ← Demo: mock-osrm + backend + frontend + redis
├── .env.example                ← Template biến môi trường
├── .gitignore                  ← Loại trừ osrm-data/, .env, __pycache__, node_modules
├── docs/
│   └── PROJECT_DOCUMENTATION.md ← Tài liệu này
└── implementation.md           ← Đặc tả kỹ thuật gốc
```

---

## 5. Environment Variables

Đặt qua Docker Compose `environment:` hoặc file `.env` (copy từ `.env.example`).

| Variable          | Default                    | Mô tả                                          |
|-------------------|----------------------------|------------------------------------------------|
| `OSRM_BASE_URL`   | `http://osrm:5000`         | URL nội bộ của OSRM container                  |
| `REDIS_URL`       | `redis://redis:6379`       | URL kết nối Redis                              |
| `CACHE_TTL`       | `300`                      | TTL cache Redis (giây)                         |
| `REQUEST_TIMEOUT` | `10.0`                     | Timeout HTTP gọi OSRM (giây)                   |
| `VITE_API_URL`    | `http://localhost:8080`    | URL backend cho frontend (build-time arg)      |

> **Lưu ý:** Trong Docker Compose, `OSRM_BASE_URL=http://osrm:5000` dùng tên service làm hostname nội bộ. Không cần file `.env` nếu dùng docker-compose mặc định.

---

## 6. Quick Start — Production Mode

> Sử dụng dữ liệu OSM thực, tuyến đường chính xác theo đường bộ.

### Yêu cầu

- Docker Engine 20.10+
- Docker Compose v2+
- RAM: tối thiểu **8 GB** (OSRM load ~3.5 GB data vào RAM)
- Dữ liệu OSRM đã preprocess trong `osrm-data/` (xem [Section 8](#8-osrm-data-preprocessing))

### Bước 1 — Clone repo

```bash
git clone https://github.com/NgTrQuang/self-hosted-routing-system.git
cd self-hosted-routing-system
```

### Bước 2 — Preprocess dữ liệu OSRM (chỉ làm 1 lần)

Xem chi tiết tại [Section 8](#8-osrm-data-preprocessing).

### Bước 3 — Start tất cả services

```bash
docker-compose up -d
```

Docker sẽ start 4 containers:

| Container | Image                              | Port  | Mô tả                        |
|-----------|------------------------------------|-------|------------------------------|
| osrm      | osrm/osrm-backend                  | 5000  | Routing engine (real data)   |
| backend   | build ./backend                    | 8080  | FastAPI API server           |
| frontend  | build ./frontend                   | 3000  | React web UI                 |
| redis     | redis:7-alpine                     | 6379  | Cache                        |

> **Lưu ý:** OSRM cần **2–5 phút** để load dữ liệu vào RAM sau khi container start. Backend trả `502` trong thời gian này — bình thường.

### Bước 4 — Kiểm tra

```bash
# OSRM ready chưa?
docker logs self-hosted-routing-system-osrm-1 --tail 5
# Phải thấy: [info] running and waiting for requests

# Backend health
curl http://localhost:8080/health
# {"status": "ok"}

# Test route
curl "http://localhost:8080/api/route?originLat=21.0285&originLng=105.8542&destLat=10.8231&destLng=106.6297"
```

### Bước 5 — Mở giao diện web

```
http://localhost:3000
```

### Dừng system

```bash
docker-compose down
```

### Rebuild sau khi thay đổi code

```bash
# Rebuild backend
docker-compose up --build -d backend

# Rebuild frontend
docker-compose up --build -d frontend

# Xem logs
docker-compose logs -f backend
docker-compose logs -f osrm
```

---

## 7. Quick Start — Demo Mode

> Chạy ngay **không cần dữ liệu bản đồ**. Mock OSRM tính khoảng cách bằng Haversine × road factor — không chính xác nhưng đủ để test API và UI.

### Bước 1 — Start demo stack

```bash
docker-compose -f docker-compose.demo.yml up --build -d
```

Docker start 4 containers:

| Container  | Mô tả                                          |
|------------|------------------------------------------------|
| mock-osrm  | FastAPI giả lập OSRM /route và /table          |
| backend    | FastAPI API server (giống production)          |
| frontend   | React web UI                                   |
| redis      | Cache                                          |

### Bước 2 — Mở giao diện

```
http://localhost:3000
```

Hoặc test API trực tiếp:

```bash
# Route (Hà Nội → TP.HCM)
curl "http://localhost:8080/api/route?originLat=21.0285&originLng=105.8542&destLat=10.8231&destLng=106.6297"

# Swagger UI
http://localhost:8080/docs
```

### Dừng demo

```bash
docker-compose -f docker-compose.demo.yml down
```

### So sánh Production vs Demo

| Tính năng              | Production              | Demo                    |
|------------------------|-------------------------|-------------------------|
| Dữ liệu bản đồ        | OSM Vietnam thực        | Không cần               |
| Tuyến đường            | Theo đường bộ thực      | Haversine × 1.3 (xấp xỉ)|
| Geometry polyline      | Có (đường thực)         | Không có                |
| Turn-by-turn steps     | Có                      | Không có                |
| Trip optimization      | Có (TSP thực)           | Không có                |
| RAM cần thiết          | ~4 GB (OSRM)            | ~200 MB                 |
| Thời gian khởi động    | 3–7 phút                | < 1 phút                |

---

## 8. OSRM Data Preprocessing

> Chỉ cần làm **1 lần**. Sau khi có file `.osrm`, các lần restart tiếp theo OSRM sẽ load trực tiếp từ `osrm-data/`.

### Yêu cầu

- RAM: tối thiểu **8 GB** trong quá trình preprocess
- Disk: ~3 GB trống trong `osrm-data/`
- Thời gian: ~15–30 phút tùy cấu hình máy

### Bước 1 — Tải file OSM Việt Nam

```bash
# Tạo thư mục nếu chưa có
mkdir -p osrm-data

# Tải từ Geofabrik (~320 MB)
wget -O osrm-data/vietnam-latest.osm.pbf \
  https://download.geofabrik.de/asia/vietnam-latest.osm.pbf
```

> Hoặc tải thủ công từ: https://download.geofabrik.de/asia/vietnam-latest.osm.pbf

### Bước 2 — Extract (parse OSM → graph)

```bash
# Windows PowerShell
docker run -t --rm -v "$PWD/osrm-data:/data" osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/vietnam-latest.osm.pbf

# Linux / macOS
docker run -t --rm -v "$(pwd)/osrm-data:/data" osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/vietnam-latest.osm.pbf
```

> Thời gian: ~5–10 phút. RAM peak: ~7 GB.

### Bước 3 — Partition (phân vùng MLD)

```bash
# Windows
docker run -t --rm -v "$PWD/osrm-data:/data" osrm/osrm-backend \
  osrm-partition /data/vietnam-latest.osrm

# Linux / macOS
docker run -t --rm -v "$(pwd)/osrm-data:/data" osrm/osrm-backend \
  osrm-partition /data/vietnam-latest.osrm
```

> Thời gian: ~3–5 phút. RAM peak: ~4 GB.

### Bước 4 — Customize (tính trọng số)

```bash
# Windows
docker run -t --rm -v "$PWD/osrm-data:/data" osrm/osrm-backend \
  osrm-customize /data/vietnam-latest.osrm

# Linux / macOS
docker run -t --rm -v "$(pwd)/osrm-data:/data" osrm/osrm-backend \
  osrm-customize /data/vietnam-latest.osrm
```

> Thời gian: ~2–5 phút. RAM peak: ~3 GB.

### Bước 5 — Cập nhật docker-compose.yml

Mở `docker-compose.yml`, sửa `command` theo tên file thực tế:

```yaml
services:
  osrm:
    command: osrm-routed --algorithm mld /data/vietnam-latest.osrm
```

### Xác nhận kết quả

Sau preprocess, `osrm-data/` phải có các file:

```
vietnam-latest.osrm
vietnam-latest.osrm.cells
vietnam-latest.osrm.cnbg
vietnam-latest.osrm.ebg
vietnam-latest.osrm.geometry
vietnam-latest.osrm.mldgr
vietnam-latest.osrm.names
vietnam-latest.osrm.partition
vietnam-latest.osrm.restrictions
... (tổng ~20 file)
```

### Script tự động (Linux/macOS)

```bash
bash scripts/preprocess.sh
```

---

## 9. API Reference

### Base URL

```
http://localhost:8080
```

Swagger UI (interactive): `http://localhost:8080/docs`  
ReDoc: `http://localhost:8080/redoc`

---

### GET /health

```
GET /health
```

**Response 200:**
```json
{"status": "ok"}
```

---

### GET /api/route

Tính tuyến đường lái xe giữa hai điểm, trả về khoảng cách, thời gian, geometry và chỉ đường.

**Query Parameters:**

| Parameter   | Type   | Required | Mô tả                                        |
|-------------|--------|----------|----------------------------------------------|
| `originLat` | float  | ✓        | Vĩ độ điểm xuất phát                         |
| `originLng` | float  | ✓        | Kinh độ điểm xuất phát                       |
| `destLat`   | float  | ✓        | Vĩ độ điểm đến                               |
| `destLng`   | float  | ✓        | Kinh độ điểm đến                             |
| `waypoints` | string | ✗        | Điểm giữa: `lat,lng\|lat,lng` (pipe-separated) |

**Ví dụ:**
```
GET /api/route?originLat=21.0285&originLng=105.8542&destLat=10.8231&destLng=106.6297
```

**Có waypoint:**
```
GET /api/route?originLat=21.0285&originLng=105.8542&destLat=10.8231&destLng=106.6297
  &waypoints=16.0544,108.2022|12.2388,109.1967
```

**Response 200:**
```json
{
  "distanceMeters": 1637135.8,
  "durationSeconds": 77580.5,
  "geometry": [[21.0285, 105.8538], [21.0285, 105.8537], ...],
  "steps": [
    {
      "instruction": "Lê Duẩn",
      "type": "depart",
      "modifier": "straight",
      "distanceMeters": 13.8,
      "durationSeconds": 3.3,
      "location": [105.8542, 21.0285]
    },
    ...
  ]
}
```

**Errors:**

| Code | Mô tả                        |
|------|------------------------------|
| 404  | Không tìm thấy tuyến đường   |
| 422  | Waypoints format không hợp lệ|
| 502  | OSRM service không khả dụng  |

---

### POST /api/trip

Tối ưu thứ tự dừng cho giao hàng nhiều điểm (Travelling Salesman Problem — TSP).

**Request Body:**
```json
{
  "waypoints": [
    [21.0285, 105.8542],
    [16.0544, 108.2022],
    [10.8231, 106.6297]
  ],
  "roundtrip": false
}
```

| Field        | Type             | Required | Mô tả                                  |
|--------------|------------------|----------|----------------------------------------|
| `waypoints`  | `[[lat,lng],...]`| ✓        | 2–20 điểm. Điểm đầu = kho/xuất phát   |
| `roundtrip`  | boolean          | ✗        | `true` = quay về điểm xuất phát (default: false) |

**Response 200:**
```json
{
  "distanceMeters": 1649156.4,
  "durationSeconds": 78425.9,
  "waypointOrder": [0, 1, 2],
  "geometry": [[21.0285, 105.8538], ...],
  "legs": [
    {
      "distanceMeters": 772835.9,
      "durationSeconds": 36899.1,
      "steps": [...]
    },
    {
      "distanceMeters": 876320.5,
      "durationSeconds": 41526.8,
      "steps": [...]
    }
  ]
}
```

- `waypointOrder`: chỉ số trong mảng input, đã được sắp xếp theo thứ tự tối ưu
- `legs`: thông tin từng chặng theo thứ tự tối ưu

**Errors:**

| Code | Mô tả                          |
|------|--------------------------------|
| 422  | Cần 2–20 waypoints             |
| 502  | OSRM service không khả dụng   |

---

### POST /api/matrix

Tính ma trận khoảng cách và thời gian N×M.

**Request Body:**
```json
{
  "origins": [
    [21.0285, 105.8542],
    [16.0544, 108.2022]
  ],
  "destinations": [
    [10.8231, 106.6297],
    [12.2388, 109.1967]
  ]
}
```

**Response 200:**
```json
{
  "durations": [
    [77580.5, 48920.0],
    [38100.0, 29300.0]
  ],
  "distances": [
    [1637135.8, 1231400.0],
    [984200.0, 721300.0]
  ]
}
```

- `durations[i][j]`: thời gian lái xe từ origin[i] → destination[j] (giây)
- `distances[i][j]`: khoảng cách từ origin[i] → destination[j] (mét)

---

## 10. Frontend

### URL

```
http://localhost:3000
```

### Các tab chức năng

#### Tab Tuyến đường / Route

- **Tìm kiếm địa điểm** — SearchBox với Nominatim: gõ tên → dropdown kết quả với tên, loại địa điểm, tỉnh/thành
- **Click bản đồ** — Nhấn chế độ Origin/Destination rồi click thẳng lên bản đồ
- **Preset routes** — Hà Nội↔TP.HCM, Hà Nội↔Đà Nẵng, v.v.
- **Kết quả**: khoảng cách, thời gian, tốc độ TB, vẽ **đường thực** theo đường bộ
- **Chỉ đường** — accordion danh sách từng bước rẽ

#### Tab Giao hàng / Delivery

- Nhập danh sách điểm dừng (lat,lng mỗi dòng, điểm đầu = kho)
- Tùy chọn quay về điểm xuất phát
- Kết quả: thứ tự tối ưu có đánh số, tổng quãng đường/thời gian, breakdown từng chặng
- Vẽ toàn bộ tuyến tối ưu lên bản đồ với marker số thứ tự

#### Tab Ma trận / Matrix

- Nhập nhiều điểm xuất phát và điểm đến (lat,lng mỗi dòng)
- Kết quả: bảng ma trận khoảng cách (km) và thời gian (phút)

### Chuyển ngôn ngữ

Nút **VI / EN** ở góc phải header — chuyển đổi giữa Tiếng Việt và Tiếng Anh, lưu vào `localStorage`.

---

## 11. Caching Strategy

### Cache Keys

| Endpoint      | Key Pattern                                              |
|---------------|----------------------------------------------------------|
| `/api/route`  | `route:{lat1}:{lng1}:{lat2}:{lng2}:{waypoints}`          |
| `/api/trip`   | `trip:{waypoints_list}:{roundtrip}`                      |
| `/api/matrix` | Không cache (key space quá lớn)                          |

**TTL:** 300 giây (cấu hình qua `CACHE_TTL`)

### Cache Flow

```
Request → Check Redis
    ├── HIT  → Trả về ngay (< 5ms)
    └── MISS → Gọi OSRM → Lưu Redis → Trả về (~100-200ms)
```

### Redis Failure Behavior

Redis **không bắt buộc**. Nếu Redis không khả dụng:
- Log `WARNING` (không phải ERROR)
- Request tiếp tục gọi thẳng OSRM
- Client không nhận lỗi

### Flush cache thủ công

```bash
docker exec self-hosted-routing-system-redis-1 redis-cli FLUSHALL
```

---

## 12. Performance Requirements

### Cấu hình máy chủ

| Resource  | Tối thiểu              | Khuyến nghị            |
|-----------|------------------------|------------------------|
| RAM       | 8 GB                   | 16 GB                  |
| CPU       | 4 cores                | 8 cores                |
| Storage   | SSD, 10 GB trống       | NVMe SSD               |
| OS        | Linux (Ubuntu 22.04+) hoặc Windows với Docker Desktop |

### Latency mục tiêu

| Stage                    | Mục tiêu     |
|--------------------------|--------------|
| Backend xử lý input      | < 50 ms      |
| OSRM tính tuyến đường    | 50–150 ms    |
| Redis cache HIT          | < 5 ms       |
| Tổng API (cache miss)    | ~100–200 ms  |
| Tổng API (cache hit)     | ~10–20 ms    |
| OSRM load lúc start      | 2–5 phút     |

---

## 13. Security Rules

| Rule                                           | Trạng thái   |
|------------------------------------------------|--------------|
| Validate tất cả input qua Pydantic             | Đã thực hiện |
| OSRM không expose trực tiếp ra ngoài           | By design    |
| Redis không expose trực tiếp ra ngoài          | By design    |
| Rate limiting (Nginx layer)                    | Khuyến nghị  |
| TLS termination (Nginx/reverse proxy)          | Khuyến nghị  |
| Ẩn URL nội bộ khỏi response                   | By design    |

> **Production:** Dùng Nginx/Cloudflare làm reverse proxy trước backend. Block port 5000 (OSRM) và 6379 (Redis) ở firewall — chỉ expose port 3000 (frontend) và 8080 (backend) hoặc 443.

---

## 14. Monitoring & Health

### Health Check

```bash
curl http://localhost:8080/health
# {"status": "ok"}
```

Dùng endpoint này cho:
- Docker `HEALTHCHECK` directive
- Load balancer health probe
- Uptime monitoring (UptimeRobot, Pingdom...)

### OSRM Ready Check

```bash
docker logs self-hosted-routing-system-osrm-1 --tail 3
# Phải thấy: [info] running and waiting for requests
```

### Logging

- Dùng Python `logging` module
- Redis failures: `WARNING` (non-fatal, request tiếp tục)
- OSRM errors: `ERROR`
- Xem log: `docker-compose logs -f backend`

### Prometheus (Kế hoạch)

```python
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)
```

---

## 15. Scaling Strategy

### Horizontal Scaling — Backend

Backend **stateless**, có thể scale dễ dàng:

```yaml
backend:
  deploy:
    replicas: 3
```

### Multi-OSRM Setup

Cho production traffic cao:
- Chạy 2–3 OSRM containers sau load balancer
- Mỗi instance đọc cùng volume preprocessed data (read-only)

### Architecture với Load Balancer

```
Internet → Nginx/Cloudflare
    │
    ├── Frontend :3000
    │
    ├── Backend :8080 (replica 1)
    ├── Backend :8081 (replica 2)
    └── Backend :8082 (replica 3)
             │
        Redis Cache
             │
    ├── OSRM :5000 (read-only data)
    └── OSRM :5001 (read-only data)
```

---

## 16. Known Issues & Limitations

| Vấn đề                                        | Mức độ | Ghi chú                                          |
|-----------------------------------------------|--------|--------------------------------------------------|
| OSM data lỗi thời theo thời gian              | Medium | Tải lại + preprocess mỗi 3–6 tháng              |
| Không có dữ liệu traffic thời gian thực       | Medium | OSRM dùng trọng số đường tĩnh                   |
| Matrix endpoint không có Redis cache          | Low    | Key space quá lớn, không thực tế để cache       |
| OSRM `unhealthy` status trong docker ps       | Info   | Image không có curl/nc, healthcheck bị tắt — OSRM vẫn hoạt động bình thường |
| OSRM cần 2–5 phút load data lúc start        | Info   | Backend trả 502 trong thời gian này — bình thường|
| Preprocess cần 8 GB RAM                       | Info   | Chỉ xảy ra lúc preprocess, không ảnh hưởng khi chạy |
| `/api/trip` giới hạn 20 waypoints             | Info   | Giới hạn hợp lý cho TSP realtime                |

---

## 17. Maintenance Guide

### Các tác vụ định kỳ

| Tác vụ                              | Tần suất        | Lệnh / Hành động                                    |
|-------------------------------------|-----------------|-----------------------------------------------------|
| Cập nhật dữ liệu OSM                | Mỗi 3–6 tháng  | Tải lại PBF + chạy lại preprocess                  |
| Xóa Redis cache                     | Khi cần         | `redis-cli FLUSHALL`                                |
| Cập nhật Docker images              | Hàng tháng      | `docker-compose pull && docker-compose up -d`       |
| Xem log lỗi backend                 | Hàng tuần       | `docker-compose logs -f backend`                    |
| Cập nhật Python dependencies        | Hàng tháng      | Sửa `requirements.txt`, rebuild image              |

### Cập nhật dữ liệu OSM

```bash
# 1. Tải PBF mới
wget -O osrm-data/vietnam-latest.osm.pbf \
  https://download.geofabrik.de/asia/vietnam-latest.osm.pbf

# 2. Dừng OSRM
docker-compose stop osrm

# 3. Xóa file osrm cũ
rm osrm-data/vietnam-latest.osrm*

# 4. Preprocess lại (xem Section 8)
docker run -t --rm -v "$(pwd)/osrm-data:/data" osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/vietnam-latest.osm.pbf
docker run -t --rm -v "$(pwd)/osrm-data:/data" osrm/osrm-backend \
  osrm-partition /data/vietnam-latest.osrm
docker run -t --rm -v "$(pwd)/osrm-data:/data" osrm/osrm-backend \
  osrm-customize /data/vietnam-latest.osrm

# 5. Khởi động lại OSRM
docker-compose up -d osrm
```

### Thêm API endpoint mới

1. Thêm Pydantic schema vào `backend/app/schemas/route_schema.py`
2. Thêm logic vào `backend/app/services/osrm_service.py`
3. Thêm route vào `backend/app/routers/route.py`
4. Cập nhật Section 9 trong tài liệu này
5. Bump version trong Document Control
6. Rebuild: `docker-compose up --build -d backend`

### Thêm ngôn ngữ mới vào frontend

1. Tạo file `frontend/src/i18n/[lang].js` theo mẫu `vi.js`
2. Import vào `frontend/src/i18n/index.jsx`, thêm vào object `translations`
3. Cập nhật nút toggle ngôn ngữ trong `App.jsx`
4. Rebuild: `docker-compose up --build -d frontend`

### Quy trình bump version

1. Cập nhật `Version` trong bảng **Document Control**
2. Thêm dòng vào bảng **Changelog**
3. Cập nhật các section liên quan
4. Commit: `git commit -m "docs: update PROJECT_DOCUMENTATION.md vX.Y.Z"`

---

## 18. AI/ML Extension Roadmap

Hệ thống được thiết kế microservices để hỗ trợ tích hợp AI/ML sau:

| Tính năng                  | Hướng triển khai                                  | Trạng thái |
|----------------------------|---------------------------------------------------|------------|
| ETA Prediction             | Microservice riêng, gọi /api/route + ML model     | Kế hoạch   |
| Surge Pricing Engine       | Microservice, hook vào route response             | Kế hoạch   |
| Driver Demand Clustering   | Background worker, ghi vào shared DB             | Kế hoạch   |
| Traffic Prediction         | Time-series model trên historical route data      | Kế hoạch   |
| Multi-modal routing        | Kết hợp xe máy/ô tô/xe đạp với profile switching | Kế hoạch   |

### Integration Pattern

```
Client Request
    │
    ▼
GET /api/route  (base routing — hiện có)
    │
    ▼
POST /api/eta   (AI enrichment — tương lai)
    │  gọi /api/route nội bộ + ML inference
    ▼
Response: distance + duration + ETA + surge_factor
```

---

*End of Documentation — Self-Hosted Routing System v1.1.2*
