from pydantic import BaseModel, Field
from typing import List, Optional, Any


class RouteStep(BaseModel):
    instruction: str
    type: str
    modifier: str
    distanceMeters: float
    durationSeconds: float
    location: List[float]


class RouteResponse(BaseModel):
    distanceMeters: float = Field(..., description="Total route distance in meters")
    durationSeconds: float = Field(..., description="Estimated travel duration in seconds")
    geometry: Optional[List[List[float]]] = Field(None, description="Route polyline as [[lat,lng],...]")
    steps: Optional[List[RouteStep]] = Field(None, description="Turn-by-turn directions")


class MatrixRequest(BaseModel):
    origins: List[List[float]] = Field(..., description="List of [lat, lng] origin coordinates")
    destinations: List[List[float]] = Field(..., description="List of [lat, lng] destination coordinates")


class MatrixResponse(BaseModel):
    durations: List[List[float]] = Field(..., description="Duration matrix in seconds")
    distances: List[List[float]] = Field(..., description="Distance matrix in meters")


class TripLeg(BaseModel):
    distanceMeters: float
    durationSeconds: float
    steps: List[RouteStep]


class TripRequest(BaseModel):
    waypoints: List[List[float]] = Field(..., description="List of [lat, lng] stops. First = depot/start.")
    roundtrip: bool = Field(False, description="Return to starting point after last stop")


class TripResponse(BaseModel):
    distanceMeters: float
    durationSeconds: float
    waypointOrder: List[int] = Field(..., description="Optimized visiting order (indices into input waypoints)")
    geometry: List[List[float]] = Field(..., description="Full route polyline as [[lat,lng],...]")
    legs: List[TripLeg] = Field(..., description="Per-leg breakdown")


class ErrorResponse(BaseModel):
    error: str
