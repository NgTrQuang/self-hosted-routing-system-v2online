import { useState, useEffect, useRef } from 'react'
import { Search, Loader2, MapPin, X } from 'lucide-react'
import { useI18n } from './i18n'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

// Vietnam bounding box: SW(8.18, 102.14) → NE(23.39, 109.46)
const VN_VIEWBOX = '102.14,8.18,109.46,23.39'

const TYPE_LABEL = {
  bridge: 'Cầu', road: 'Đường', street: 'Đường', residential: 'Khu dân cư',
  city: 'Thành phố', town: 'Thị xã', village: 'Xã/Làng', hamlet: 'Thôn',
  district: 'Quận/Huyện', county: 'Huyện', state: 'Tỉnh',
  aeroway: 'Sân bay', airport: 'Sân bay', station: 'Ga/Trạm',
  hospital: 'Bệnh viện', school: 'Trường', university: 'Đại học',
  hotel: 'Khách sạn', restaurant: 'Nhà hàng', park: 'Công viên',
  river: 'Sông', lake: 'Hồ', beach: 'Bãi biển', island: 'Đảo',
}

function getTypeLabel(item) {
  const t = item.type || item.class || ''
  return TYPE_LABEL[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : null)
}

async function nominatimSearch(q) {
  const params = new URLSearchParams({
    q,
    format: 'json',
    limit: 10,
    addressdetails: 1,
    viewbox: VN_VIEWBOX,
    bounded: 0,
    'accept-language': 'vi,en',
  })
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'Accept-Language': 'vi,en' },
  })
  return res.json()
}

function deduplicateByPlaceId(arrays) {
  const seen = new Set()
  const result = []
  for (const arr of arrays) {
    for (const item of arr) {
      if (!seen.has(item.place_id)) {
        seen.add(item.place_id)
        result.push(item)
      }
    }
  }
  return result
}

function formatSubtitle(item) {
  const parts = item.display_name.split(',')
  // show province/city level (last 2-3 meaningful parts)
  const addr = item.address || {}
  const province = addr.state || addr.province || ''
  const district = addr.county || addr.city_district || addr.district || ''
  const city = addr.city || addr.town || addr.village || ''
  const parts2 = [city, district, province].filter(Boolean)
  if (parts2.length > 0) return parts2.join(', ')
  return parts.slice(1, 4).join(',')
}

export default function SearchBox({ label, color, onSelect }) {
  const { t, lang } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef(null)
  const wrapperRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const alreadyHasVN = /vi[eê]t\s*nam/i.test(trimmed)
        const queries = alreadyHasVN
          ? [nominatimSearch(trimmed)]
          : [nominatimSearch(trimmed), nominatimSearch(trimmed + ', Việt Nam')]

        const results = await Promise.all(queries)
        const merged = deduplicateByPlaceId(results).slice(0, 10)
        setResults(merged)
        setOpen(merged.length > 0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 400)
  }, [query])

  function handleSelect(item) {
    setQuery(item.display_name.split(',')[0])
    setOpen(false)
    setResults([])
    onSelect(parseFloat(item.lat), parseFloat(item.lon), item.display_name)
  }

  function handleClear() {
    setQuery('')
    setResults([])
    setOpen(false)
  }

  const borderColor = color === 'green' ? 'focus-within:ring-emerald-500' : 'focus-within:ring-red-500'
  const iconColor = color === 'green' ? 'text-emerald-400' : 'text-red-400'
  const tagColor = color === 'green' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'

  return (
    <div ref={wrapperRef} className="relative w-full">
      <p className={`text-xs font-medium mb-1.5 flex items-center gap-1 ${iconColor}`}>
        <MapPin size={12} />
        {label}
      </p>
      <div className={`flex items-center bg-gray-700 rounded-lg ring-1 ring-gray-600 ${borderColor} focus-within:ring-2 transition-all`}>
        <Search size={14} className="ml-2.5 text-gray-400 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value) }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={`${t('searchPlaceholder').replace('...', '')} ${label.toLowerCase()}...`}
          className="flex-1 bg-transparent text-sm text-white px-2 py-2 outline-none placeholder-gray-500"
        />
        {loading && <Loader2 size={13} className="mr-2 text-gray-400 animate-spin shrink-0" />}
        {query && !loading && (
          <button onClick={handleClear} className="mr-2 text-gray-500 hover:text-gray-300">
            <X size={13} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-[2000] mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
          {results.map((item) => {
            const typeLabel = getTypeLabel(item)
            const subtitle = formatSubtitle(item)
            return (
              <li key={item.place_id}>
                <button
                  onMouseDown={() => handleSelect(item)}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-700 transition-colors flex items-start gap-2 border-b border-gray-700/50 last:border-0"
                >
                  <MapPin size={13} className={`mt-0.5 shrink-0 ${iconColor}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm text-white leading-tight">
                        {item.display_name.split(',')[0]}
                      </p>
                      {typeLabel && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${tagColor}`}>
                          {typeLabel}
                        </span>
                      )}
                    </div>
                    {subtitle && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{subtitle}</p>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {!open && query.length >= 2 && !loading && results.length === 0 && (
        <div className="absolute z-[2000] mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-xs text-gray-400">
          {t('noResults')} {lang === 'vi' ? '— thử thêm tên tỉnh, ví dụ: "Cầu Trà Ôn, Vĩnh Long"' : '— try adding province/city name'}
        </div>
      )}
    </div>
  )
}
