# IMPLEMENTATION.md

## Project: Production-Ready Self-Hosted Routing System (Python)

---

# 1. Objective

Build a production-ready, self-hosted routing system for Vietnam that replaces:

* Google Distance Matrix API
* Google Routes API

Using:

* OSRM (routing engine)
* OpenStreetMap data
* Python FastAPI backend
* Dockerized microservice architecture

System Requirements:

* Scalable
* Stateless backend
* Containerized
* Horizontally scalable
* Ready for AI/ML extension (ETA prediction, surge pricing)

---

# 2. High-Level Architecture

Client (Mobile/Web)
↓
FastAPI Backend (Python)
↓
OSRM Routing Service (Container)
↓
OpenStreetMap Data

Rules:

* OSRM MUST run as a separate container
* Backend MUST communicate via HTTP
* No routing logic inside backend
* All services must be dockerized

---

# 3. Tech Stack

Backend:

* Python 3.11+
* FastAPI
* Uvicorn (ASGI server)
* httpx (async HTTP client)
* Pydantic (validation)

Routing Engine:

* OSRM Backend (osrm/osrm-backend)

Optional Production Components:

* Redis (caching)
* Nginx (reverse proxy)
* Docker Compose
* Prometheus (monitoring ready)

---

# 4. Folder Structure

project-root/
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── routers/
│   │   │   └── route.py
│   │   ├── services/
│   │   │   └── osrm_service.py
│   │   └── schemas/
│   │       └── route_schema.py
│   │
│   ├── requirements.txt
│   └── Dockerfile
│
├── osrm-data/
│   └── vietnam.osm.pbf
│
├── docker-compose.yml
└── IMPLEMENTATION.md

---

# 5. OSRM Setup

## Step 1: Download OSM Vietnam extract

Place file in:

osrm-data/vietnam.osm.pbf

## Step 2: Preprocess Map Data

Run:

1. Extract

docker run -t -v ${PWD}/osrm-data:/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/vietnam.osm.pbf

2. Partition

docker run -t -v ${PWD}/osrm-data:/data osrm/osrm-backend osrm-partition /data/vietnam.osrm

3. Customize

docker run -t -v ${PWD}/osrm-data:/data osrm/osrm-backend osrm-customize /data/vietnam.osrm

---

# 6. docker-compose.yml

version: "3.9"

services:

osrm:
image: osrm/osrm-backend
volumes:
- ./osrm-data:/data
command: osrm-routed /data/vietnam.osrm
ports:
- "5000:5000"
restart: always

backend:
build: ./backend
ports:
- "8080:8080"
depends_on:
- osrm
restart: always

---

# 7. Backend Implementation (FastAPI Production Pattern)

## requirements.txt

fastapi
uvicorn[standard]
httpx
pydantic
redis

---

# 8. Core Implementation

## config.py

* Store OSRM base URL
* Environment-based configuration

Example:

OSRM_BASE_URL = "[http://osrm:5000](http://osrm:5000)"

---

## osrm_service.py

Responsibilities:

* Call OSRM asynchronously
* Handle timeout
* Handle errors
* Return normalized data

Use httpx.AsyncClient

---

## route.py (Router Layer)

Endpoint:

GET /api/route

Query Params:

* originLat
* originLng
* destLat
* destLng

Flow:

1. Validate input
2. Call osrm_service
3. Return simplified response

---

# 9. Response Contract

Success Response:

{
"distanceMeters": 12345.0,
"durationSeconds": 900.0
}

Error Response:

{
"error": "No route found"
}

---

# 10. Distance Matrix Extension

Future endpoint:

POST /api/matrix

Body:

{
"origins": [[lat, lng]],
"destinations": [[lat, lng]]
}

Backend maps request to:

/table/v1/driving/

---

# 11. Production Enhancements

## 1. Async Everywhere

* Use async def endpoints
* Use httpx.AsyncClient

## 2. Redis Cache (Recommended)

Cache key:

route:{originLat}:{originLng}:{destLat}:{destLng}

TTL: 300 seconds

Benefits:

* Reduce OSRM load
* Faster response time

## 3. Reverse Proxy (Nginx)

* TLS termination
* Rate limiting
* Gzip compression

## 4. Horizontal Scaling

* Multiple backend containers
* Multiple OSRM containers
* Load balancer

---

# 12. Performance Requirements

Recommended Minimum:

* 8GB RAM for Vietnam OSRM
* SSD storage
* Linux server

Expected Performance:

* < 50ms backend processing
* 50–150ms OSRM response
* Total API latency: ~100–200ms

---

# 13. Security Rules

* Validate all inputs
* Add rate limiting
* Hide internal service URLs
* Never expose OSRM directly to public

---

# 14. Monitoring Strategy

Optional but recommended:

* Prometheus metrics endpoint
* Request logging
* Error logging
* Health check endpoint: /health

---

# 15. AI Extension Ready

System is designed to later support:

* ETA prediction model
* Surge pricing engine
* Driver demand clustering
* Traffic prediction layer

These can be implemented as separate microservices.

---

# 16. Non-Negotiable Architecture Rules

* OSRM must remain a separate container
* Backend must remain stateless
* All services must communicate via HTTP
* Docker Compose required for local development

---

# END OF PRODUCTION IMPLEMENTATION SPEC
