"""
Mock OSRM Server — for demo/development use only.
Simulates OSRM /route/v1/ and /table/v1/ responses without real map data.
"""

import math
import random
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI(title="Mock OSRM Server")


def _haversine_meters(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _mock_route_distance(lon1, lat1, lon2, lat2):
    straight = _haversine_meters(lon1, lat1, lon2, lat2)
    road_factor = 1.35 + random.uniform(0, 0.15)
    distance = straight * road_factor
    avg_speed_mps = 40 * 1000 / 3600
    duration = distance / avg_speed_mps
    return round(distance, 1), round(duration, 1)


@app.get("/route/v1/driving/{coordinates}")
async def mock_route(coordinates: str, request: Request):
    try:
        parts = coordinates.split(";")
        lon1, lat1 = map(float, parts[0].split(","))
        lon2, lat2 = map(float, parts[1].split(","))
        distance, duration = _mock_route_distance(lon1, lat1, lon2, lat2)
        return {
            "code": "Ok",
            "routes": [
                {
                    "distance": distance,
                    "duration": duration,
                    "legs": [{"distance": distance, "duration": duration, "steps": []}],
                }
            ],
            "waypoints": [
                {"hint": "mock", "distance": 0, "name": "Origin", "location": [lon1, lat1]},
                {"hint": "mock", "distance": 0, "name": "Destination", "location": [lon2, lat2]},
            ],
        }
    except Exception as e:
        return JSONResponse(status_code=400, content={"code": "InvalidInput", "message": str(e)})


@app.get("/table/v1/driving/{coordinates}")
async def mock_table(coordinates: str, request: Request):
    try:
        params = dict(request.query_params)
        all_coords = [tuple(map(float, c.split(","))) for c in coordinates.split(";")]

        sources_idx = [int(i) for i in params.get("sources", "").split(";") if i]
        dests_idx = [int(i) for i in params.get("destinations", "").split(";") if i]

        if not sources_idx:
            sources_idx = list(range(len(all_coords)))
        if not dests_idx:
            dests_idx = list(range(len(all_coords)))

        durations = []
        distances = []
        for si in sources_idx:
            dur_row, dist_row = [], []
            lon1, lat1 = all_coords[si]
            for di in dests_idx:
                lon2, lat2 = all_coords[di]
                dist, dur = _mock_route_distance(lon1, lat1, lon2, lat2)
                dist_row.append(dist)
                dur_row.append(dur)
            durations.append(dur_row)
            distances.append(dist_row)

        return {
            "code": "Ok",
            "durations": durations,
            "distances": distances,
            "sources": [{"hint": "mock", "location": list(all_coords[i])} for i in sources_idx],
            "destinations": [{"hint": "mock", "location": list(all_coords[i])} for i in dests_idx],
        }
    except Exception as e:
        return JSONResponse(status_code=400, content={"code": "InvalidInput", "message": str(e)})


@app.get("/health")
async def health():
    return {"status": "ok", "mode": "mock"}
