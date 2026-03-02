const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export async function fetchRoute(originLat, originLng, destLat, destLng, waypoints = null) {
  let url = `${BASE_URL}/api/route?originLat=${originLat}&originLng=${originLng}&destLat=${destLat}&destLng=${destLng}`
  if (waypoints && waypoints.length > 0) {
    url += `&waypoints=${waypoints.map(w => w.join(',')).join('|')}`
  }
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err?.detail?.error || 'Route request failed')
  }
  return res.json()
}

export async function fetchTrip(waypoints, roundtrip = false) {
  const res = await fetch(`${BASE_URL}/api/trip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ waypoints, roundtrip }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err?.detail?.error || 'Trip request failed')
  }
  return res.json()
}

export async function fetchMatrix(origins, destinations) {
  const res = await fetch(`${BASE_URL}/api/matrix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origins, destinations }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err?.detail?.error || 'Matrix request failed')
  }
  return res.json()
}

export async function checkHealth() {
  const res = await fetch(`${BASE_URL}/health`)
  return res.json()
}
