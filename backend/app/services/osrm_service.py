import math
import random
import httpx
import polyline as polyline_codec
from typing import Dict, Any, List
from app.config import OSRM_BASE_URL, REQUEST_TIMEOUT, USE_MOCK_OSRM


# ---------------------------------------------------------------------------
# Mock OSRM helpers (haversine-based, no real map data)
# ---------------------------------------------------------------------------

def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _mock_dist_dur(lat1: float, lng1: float, lat2: float, lng2: float):
    straight = _haversine_meters(lat1, lng1, lat2, lng2)
    road_factor = 1.35 + random.uniform(0, 0.15)
    distance = straight * road_factor
    avg_speed_mps = 40 * 1000 / 3600
    duration = distance / avg_speed_mps
    return round(distance, 1), round(duration, 1)


def _interpolate_geometry(lat1: float, lng1: float, lat2: float, lng2: float, n: int = 8) -> List[List[float]]:
    """Return n linearly interpolated [lat, lng] points between two coordinates."""
    return [
        [lat1 + (lat2 - lat1) * i / (n - 1), lng1 + (lng2 - lng1) * i / (n - 1)]
        for i in range(n)
    ]


async def _mock_get_route(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    waypoints: List[List[float]] = None,
) -> Dict[str, Any]:
    all_points = [[origin_lat, origin_lng]] + (waypoints or []) + [[dest_lat, dest_lng]]
    total_dist = 0.0
    total_dur = 0.0
    geometry: List[List[float]] = []
    steps: List[Dict] = []

    for i in range(len(all_points) - 1):
        a_lat, a_lng = all_points[i]
        b_lat, b_lng = all_points[i + 1]
        dist, dur = _mock_dist_dur(a_lat, a_lng, b_lat, b_lng)
        total_dist += dist
        total_dur += dur
        seg = _interpolate_geometry(a_lat, a_lng, b_lat, b_lng)
        if geometry:
            seg = seg[1:]
        geometry.extend(seg)
        steps.append({
            "instruction": "Head toward destination" if i == 0 else "Continue",
            "type": "depart" if i == 0 else "continue",
            "modifier": "",
            "distanceMeters": dist,
            "durationSeconds": dur,
            "location": [a_lng, a_lat],
        })

    return {
        "distanceMeters": round(total_dist, 1),
        "durationSeconds": round(total_dur, 1),
        "geometry": geometry,
        "steps": steps,
    }


def _nearest_neighbor_tsp(waypoints: List[List[float]]) -> List[int]:
    """Nearest-neighbor heuristic starting from index 0."""
    n = len(waypoints)
    unvisited = set(range(1, n))
    order = [0]
    current = 0
    while unvisited:
        nearest = min(
            unvisited,
            key=lambda j, c=current: _haversine_meters(
                waypoints[c][0], waypoints[c][1],
                waypoints[j][0], waypoints[j][1],
            ),
        )
        order.append(nearest)
        unvisited.remove(nearest)
        current = nearest
    return order


async def _mock_get_trip(
    waypoints: List[List[float]],
    roundtrip: bool = False,
) -> Dict[str, Any]:
    order = _nearest_neighbor_tsp(waypoints)
    stops = [waypoints[i] for i in order]
    if roundtrip:
        stops = stops + [stops[0]]

    total_dist = 0.0
    total_dur = 0.0
    geometry: List[List[float]] = []
    legs: List[Dict] = []

    for i in range(len(stops) - 1):
        a_lat, a_lng = stops[i]
        b_lat, b_lng = stops[i + 1]
        dist, dur = _mock_dist_dur(a_lat, a_lng, b_lat, b_lng)
        total_dist += dist
        total_dur += dur
        seg = _interpolate_geometry(a_lat, a_lng, b_lat, b_lng)
        if geometry:
            seg = seg[1:]
        geometry.extend(seg)
        legs.append({
            "distanceMeters": dist,
            "durationSeconds": dur,
            "steps": [{
                "instruction": "Head toward next stop",
                "type": "depart" if i == 0 else "continue",
                "modifier": "",
                "distanceMeters": dist,
                "durationSeconds": dur,
                "location": [a_lng, a_lat],
            }],
        })

    return {
        "distanceMeters": round(total_dist, 1),
        "durationSeconds": round(total_dur, 1),
        "waypointOrder": order,
        "geometry": geometry,
        "legs": legs,
    }


async def _mock_get_matrix(
    origins: List[List[float]],
    destinations: List[List[float]],
) -> Dict[str, Any]:
    durations = []
    distances = []
    for o_lat, o_lng in origins:
        dur_row, dist_row = [], []
        for d_lat, d_lng in destinations:
            dist, dur = _mock_dist_dur(o_lat, o_lng, d_lat, d_lng)
            dist_row.append(dist)
            dur_row.append(dur)
        durations.append(dur_row)
        distances.append(dist_row)
    return {"durations": durations, "distances": distances}


# ---------------------------------------------------------------------------
# Real OSRM helpers
# ---------------------------------------------------------------------------

def _decode_geometry(route: Dict) -> List[List[float]]:
    """Decode polyline geometry from OSRM route to [[lat,lng], ...] list."""
    geom = route.get("geometry")
    if not geom:
        return []
    if isinstance(geom, dict):
        coords = geom.get("coordinates", [])
        return [[c[1], c[0]] for c in coords]
    return [[lat, lng] for lat, lng in polyline_codec.decode(geom)]


def _parse_steps(legs: List[Dict]) -> List[Dict]:
    """Extract turn-by-turn steps from OSRM route legs."""
    steps = []
    for leg in legs:
        for step in leg.get("steps", []):
            maneuver = step.get("maneuver", {})
            steps.append({
                "instruction": step.get("name", ""),
                "type": maneuver.get("type", ""),
                "modifier": maneuver.get("modifier", ""),
                "distanceMeters": step.get("distance", 0),
                "durationSeconds": step.get("duration", 0),
                "location": maneuver.get("location", []),
            })
    return steps


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_route(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    waypoints: List[List[float]] = None,
) -> Dict[str, Any]:
    """
    Call OSRM route API. Supports optional intermediate waypoints.
    Returns distanceMeters, durationSeconds, geometry (decoded coords), and steps.
    """
    if USE_MOCK_OSRM:
        return await _mock_get_route(origin_lat, origin_lng, dest_lat, dest_lng, waypoints)

    coords = [[origin_lng, origin_lat]]
    for wp in (waypoints or []):
        coords.append([wp[1], wp[0]])
    coords.append([dest_lng, dest_lat])
    coords_str = ";".join(f"{lng},{lat}" for lng, lat in coords)

    url = (
        f"{OSRM_BASE_URL}/route/v1/driving/{coords_str}"
        f"?overview=full&geometries=polyline&steps=true"
    )
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()

    if data.get("code") != "Ok" or not data.get("routes"):
        raise ValueError("No route found")

    route = data["routes"][0]
    return {
        "distanceMeters": route["distance"],
        "durationSeconds": route["duration"],
        "geometry": _decode_geometry(route),
        "steps": _parse_steps(route.get("legs", [])),
    }


async def get_trip(
    waypoints: List[List[float]],
    roundtrip: bool = False,
) -> Dict[str, Any]:
    """
    Call OSRM trip API (TSP) to find the optimal visiting order for multiple stops.
    waypoints: list of [lat, lng]. First point is the depot/start.
    Returns optimized order, total distance/duration, geometry, and steps per leg.
    """
    if USE_MOCK_OSRM:
        return await _mock_get_trip(waypoints, roundtrip)

    coords_str = ";".join(f"{lng},{lat}" for lat, lng in waypoints)
    rt = "true" if roundtrip else "false"
    url = (
        f"{OSRM_BASE_URL}/trip/v1/driving/{coords_str}"
        f"?roundtrip={rt}&source=first&destination=last"
        f"&overview=full&geometries=polyline&steps=true"
    )
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()

    if data.get("code") != "Ok" or not data.get("trips"):
        raise ValueError("Trip optimization failed")

    trip = data["trips"][0]
    waypoint_order = [wp["waypoint_index"] for wp in sorted(
        data.get("waypoints", []), key=lambda w: w.get("trips_index", 0)
    )]

    legs = []
    for i, leg in enumerate(trip.get("legs", [])):
        legs.append({
            "distanceMeters": leg["distance"],
            "durationSeconds": leg["duration"],
            "steps": _parse_steps([leg]),
        })

    return {
        "distanceMeters": trip["distance"],
        "durationSeconds": trip["duration"],
        "waypointOrder": waypoint_order,
        "geometry": _decode_geometry(trip),
        "legs": legs,
    }


async def get_matrix(
    origins: List[List[float]],
    destinations: List[List[float]],
) -> Dict[str, Any]:
    """
    Call OSRM table API for a many-to-many distance/duration matrix.
    origins and destinations are lists of [lat, lng].
    Returns dict with durations and distances matrices.
    """
    if USE_MOCK_OSRM:
        return await _mock_get_matrix(origins, destinations)

    all_coords = origins + destinations
    coords_str = ";".join(f"{lng},{lat}" for lat, lng in all_coords)

    sources_idx = ";".join(str(i) for i in range(len(origins)))
    destinations_idx = ";".join(str(i) for i in range(len(origins), len(all_coords)))

    url = (
        f"{OSRM_BASE_URL}/table/v1/driving/{coords_str}"
        f"?sources={sources_idx}&destinations={destinations_idx}&annotations=duration,distance"
    )

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()

    if data.get("code") != "Ok":
        raise ValueError("Matrix computation failed")

    return {
        "durations": data.get("durations", []),
        "distances": data.get("distances", []),
    }
