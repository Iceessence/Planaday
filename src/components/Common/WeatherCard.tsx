import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CloudSun, Droplets, LocateFixed, RefreshCw, Search, Wind } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import {
  describeWeatherCode,
  fetchLiveWeather,
  searchWeatherLocations,
  type GeocodedPlace,
  type WeatherSnapshot,
} from '../../core/weather';

const STALE_MS = 30 * 60_000;
// All mounted weather cards share concurrent requests for the same location/unit.
const inFlight = new Map<string, Promise<WeatherSnapshot>>();
function fetchShared(lat: number, lon: number, name: string, unit: 'F' | 'C') {
  const key = JSON.stringify([lat, lon, name, unit]);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const request = fetchLiveWeather(lat, lon, name, unit).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}
function convertWeather(weather: WeatherSnapshot, unit: 'F' | 'C'): WeatherSnapshot {
  if (weather.unit === unit) return weather;
  const temp = (n: number) => Math.round(unit === 'C' ? (n - 32) * 5 / 9 : n * 9 / 5 + 32);
  return { ...weather, unit, temp: temp(weather.temp), feelsLike: temp(weather.feelsLike),
    highTemp: temp(weather.highTemp), lowTemp: temp(weather.lowTemp),
    windSpeed: Math.round(unit === 'C' ? weather.windSpeed * 1.609344 : weather.windSpeed / 1.609344),
    daily: weather.daily.map((day) => ({ ...day, maxTemp: temp(day.maxTemp), minTemp: temp(day.minTemp) })) };
}

export const WeatherCard: React.FC<{
  compact?: boolean;
  onInsertWeatherNote?: (summary: string) => void;
}> = ({ compact = false, onInsertWeatherNote }) => {
  const { settings, patchSettings, pushToast } = useApp();
  const [editingLoc, setEditingLoc] = useState(false);
  const [cityQuery, setCityQuery] = useState(settings.weatherLocationName || '');
  const [matches, setMatches] = useState<GeocodedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [isOffline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [now, setNow] = useState(Date.now);
  const operation = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(false);
  const latest = useRef(settings);
  latest.current = settings;
  const patchRef = useRef(patchSettings);
  patchRef.current = patchSettings;
  const unit = settings.weatherUnit || 'F';
  const cached = settings.cachedWeather;
  const weather = useMemo(() => cached ? convertWeather(cached, unit) : null, [cached, unit]);
  const fetched = cached ? Date.parse(cached.fetchedAt) : NaN;
  const stale = !Number.isFinite(fetched) || now - fetched >= STALE_MS;
  useEffect(() => {
    if (!settings.weatherEnabled) return;
    mounted.current = true; setLoading(false);
    const update = () => { setOffline(!navigator.onLine); setNow(Date.now()); };
    window.addEventListener('online', update); window.addEventListener('offline', update);
    document.addEventListener('visibilitychange', update);
    const timer = window.setInterval(() => { if (!document.hidden) update(); }, 60_000);
    return () => {
      mounted.current = false; operation.current++; busy.current = false;
      window.removeEventListener('online', update); window.removeEventListener('offline', update);
      document.removeEventListener('visibilitychange', update); window.clearInterval(timer);
    };
  }, [settings.weatherEnabled]);
  const refreshWeather = useCallback(async (
    lat = latest.current.weatherLat,
    lon = latest.current.weatherLon,
    name = latest.current.weatherLocationName || 'My Location',
    targetUnit: 'F' | 'C' = latest.current.weatherUnit || 'F',
    chosenLocation = false
  ) => {
    if (busy.current) return;
    const token = ++operation.current;
    busy.current = true; setLoading(true); setErrorMsg('');
    const start = latest.current;
    const valid = () => mounted.current && operation.current === token && latest.current.weatherEnabled;
    try {
      if (lat == null || lon == null || !navigator.onLine) {
        if (targetUnit !== start.weatherUnit) await patchRef.current({ weatherUnit: targetUnit });
        if (valid()) setErrorMsg(lat == null || lon == null ? 'Set a city to get a forecast.' : 'Offline — showing last cached forecast.');
        return;
      }
      const snap = await fetchShared(lat, lon, name, targetUnit);
      if (!valid()) return;
      // Do not overwrite a location or unit changed elsewhere during the request.
      const current = latest.current;
      if (current.weatherLat !== start.weatherLat || current.weatherLon !== start.weatherLon ||
          current.weatherUnit !== start.weatherUnit || current.weatherLocationName !== start.weatherLocationName) return;
      await patchRef.current({ weatherLat: lat, weatherLon: lon, weatherLocationName: name, weatherUnit: targetUnit, cachedWeather: snap });
      if (valid()) { setNow(Date.now()); if (chosenLocation) { setEditingLoc(false); setMatches([]); } }
    } catch {
      if (valid()) setErrorMsg('Unable to reach weather service. Last cached forecast is retained.');
    } finally {
      if (mounted.current && operation.current === token) { busy.current = false; setLoading(false); }
    }
  }, []);

  // Refresh when stale, on reconnect, and when returning to a visible tab.
  useEffect(() => {
    if (!settings.weatherEnabled || settings.weatherLat == null || settings.weatherLon == null || isOffline || editingLoc || document.hidden) return;
    if (stale || cached?.unit !== unit || cached?.latitude !== settings.weatherLat || cached?.longitude !== settings.weatherLon) {
      void refreshWeather();
    }
  }, [settings.weatherEnabled, settings.weatherLat, settings.weatherLon, unit, cached?.fetchedAt, stale, isOffline, editingLoc, now, refreshWeather]);

  const handleLocateMe = () => {
    if (busy.current) return;
    if (!navigator.geolocation) { setErrorMsg('Geolocation unavailable — type your city name instead.'); setEditingLoc(true); return; }
    if (isOffline) { setErrorMsg('Go online to get weather for your location.'); return; }
    const token = ++operation.current;
    busy.current = true; setLoading(true); setErrorMsg('');
    const finish = () => {
      if (!mounted.current || operation.current !== token) return false;
      busy.current = false; setLoading(false);
      return latest.current.weatherEnabled;
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => { if (finish()) void refreshWeather(pos.coords.latitude, pos.coords.longitude, 'Current Location', unit, true); },
      () => { if (finish()) { setErrorMsg('Location unavailable — search by city name below.'); setEditingLoc(true); } },
      { timeout: 8000, maximumAge: 300_000 }
    );
  };
  const handleCitySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = cityQuery.trim();
    if (query.length < 2 || busy.current) return;
    const token = ++operation.current;
    busy.current = true; setLoading(true); setErrorMsg(''); setMatches([]);
    try {
      const found = await searchWeatherLocations(query);
      if (!mounted.current || operation.current !== token) return;
      setMatches(found);
      if (!found.length) setErrorMsg('No matching city found. Try a nearby city name.');
    } catch { if (mounted.current && operation.current === token) setErrorMsg('City search requires an internet connection.'); }
    finally { if (mounted.current && operation.current === token) { busy.current = false; setLoading(false); } }
  };
  if (!settings.weatherEnabled) return null;
  const locationChanged = !!cached && (cached.latitude !== settings.weatherLat || cached.longitude !== settings.weatherLon);
  const cacheLabel = isOffline ? 'Offline · Cached' : stale || locationChanged ? 'Stale · Cached' : '';
  const status = errorMsg || (loading ? 'Updating weather…' : cacheLabel);

  if (compact && weather && !editingLoc) {
    const summaryText = `${weather.emoji} ${weather.temp}°${weather.unit} ${weather.conditionLabel} (H:${weather.highTemp}° L:${weather.lowTemp}°, ${weather.precipProb}% rain)`;
    return (
      <div className="dp-card dp-between" style={{ padding: '8px 12px', gap: 8, background: 'var(--dp-surface-2)' }}>
        <div className="dp-row" style={{ gap: 8, fontSize: '0.86rem' }}>
          <span style={{ fontSize: '1.25rem' }}>{weather.emoji}</span>
          <div>
            <strong>
              {weather.temp}°{weather.unit} · {weather.conditionLabel}
            </strong>
            <div className="dp-muted" style={{ fontSize: '0.75rem' }}>
              {weather.locationName} · H:{weather.highTemp}° L:{weather.lowTemp}° · 💧 {weather.precipProb}% rain
              {cacheLabel ? ` · ${cacheLabel}` : ''}
              {(errorMsg || loading) && <div role="status">{status}</div>}
            </div>
          </div>
        </div>
        <div className="dp-row" style={{ gap: 4, flexWrap: 'wrap' }}>
          {onInsertWeatherNote && (
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              onClick={() => {
                onInsertWeatherNote(summaryText);
                pushToast('Weather added to Today Diary!');
              }}
            >
              Log to Diary
            </button>
          )}
          <button
            type="button"
            className="dp-icon-btn"
            style={{ width: 28, height: 28 }}
            title="Refresh weather"
            aria-label="Refresh weather"
            disabled={loading || isOffline}
            onClick={() => void refreshWeather()}
          >
            <RefreshCw size={13} />
          </button>
          <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" onClick={() => setEditingLoc(true)}>
            City
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="dp-card dp-stack" style={{ padding: 14, gap: 10 }}>
      <div className="dp-between">
        <strong className="dp-row" style={{ fontSize: '0.94rem' }}>
          <CloudSun size={16} /> Live Weather {weather ? `· ${weather.locationName}` : ''}
        </strong>
        <div className="dp-row" style={{ gap: 4 }}>
          <button
            type="button"
            className={`dp-btn dp-btn-sm ${unit === 'F' ? 'dp-btn-primary' : ''}`}
            aria-pressed={unit === 'F'} disabled={loading || unit === 'F'}
            onClick={() => void refreshWeather(settings.weatherLat, settings.weatherLon, settings.weatherLocationName || 'My Location', 'F')}
          >
            °F
          </button>
          <button
            type="button"
            className={`dp-btn dp-btn-sm ${unit === 'C' ? 'dp-btn-primary' : ''}`}
            aria-pressed={unit === 'C'} disabled={loading || unit === 'C'}
            onClick={() => void refreshWeather(settings.weatherLat, settings.weatherLon, settings.weatherLocationName || 'My Location', 'C')}
          >
            °C
          </button>
          {weather && (
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              disabled={loading || isOffline}
              aria-label="Refresh live weather"
              onClick={() => void refreshWeather()}
              title="Refresh live weather"
            >
              <RefreshCw size={13} />
            </button>
          )}
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setEditingLoc((v) => !v)}>
            {editingLoc ? 'Done' : weather ? 'Change City' : 'Set City'}
          </button>
        </div>
      </div>

      {(!weather || editingLoc) && (
        <div className="dp-stack" style={{ gap: 8, padding: 10, background: 'var(--dp-surface-2)', borderRadius: 8 }}>
          <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" disabled={loading} onClick={handleLocateMe}>
              <LocateFixed size={13} /> Use My Location
            </button>
            <form className="dp-row" style={{ flex: 1, gap: 6 }} onSubmit={handleCitySearch}>
              <input
                className="dp-input"
                style={{ flex: 1 }}
                aria-label="Search weather locations"
                disabled={loading}
                placeholder="Or search city (e.g., Seattle, Austin, London)…"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
              />
              <button type="submit" className="dp-btn dp-btn-sm" disabled={loading || isOffline || cityQuery.trim().length < 2}>
                <Search size={13} /> Find
              </button>
            </form>
          </div>
          {matches.length > 0 && (
            <div className="dp-row" style={{ gap: 5 }}>
              {matches.map((m) => {
                const label = [m.name, m.admin1, m.country].filter(Boolean).join(', ');
                return (
                  <button
                    key={`${m.latitude}:${m.longitude}:${label}`}
                    type="button"
                    className="dp-btn dp-btn-sm"
                    disabled={loading || isOffline}
                    onClick={() => {
                      void refreshWeather(m.latitude, m.longitude, label, unit, true);
                    }}
                  >
                    📍 {label}
                  </button>
                );
              })}
            </div>
          )}

        </div>
      )}

      {status && <span role="status" style={{ fontSize: '0.8rem', color: errorMsg ? 'var(--dp-warn)' : 'var(--dp-ink)' }}>{status}</span>}
      {weather && (
        <>
          <div className="dp-between">
            <div className="dp-row" style={{ gap: 12 }}>
              <span style={{ fontSize: '2.3rem', lineHeight: 1 }}>{weather.emoji}</span>
              <div>
                <div style={{ fontSize: '1.7rem', fontWeight: 700, lineHeight: 1.1 }}>
                  {weather.temp}°{weather.unit}{' '}
                  <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>{weather.conditionLabel}</span>
                </div>
                <div className="dp-muted" style={{ fontSize: '0.8rem' }}>
                  Feels like {weather.feelsLike}°{weather.unit} · High {weather.highTemp}° / Low {weather.lowTemp}°
                </div>
              </div>
            </div>
            <div className="dp-row" style={{ gap: 8, fontSize: '0.8rem' }}>
              <span className="dp-pill">
                <Droplets size={12} /> {weather.precipProb}% rain · {weather.humidity}% hum
              </span>
              <span className="dp-pill">
                <Wind size={12} /> {weather.windSpeed} {weather.unit === 'C' ? 'km/h' : 'mph'}
              </span>
            </div>
          </div>

          {!compact && weather.daily.length > 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: 6 }}>
              {weather.daily.map((day, idx) => {
                const d = describeWeatherCode(day.code);
                return (
                  <div
                    key={day.date}
                    style={{
                      padding: '6px 4px',
                      borderRadius: 8,
                      background: 'var(--dp-surface-2)',
                      textAlign: 'center',
                      fontSize: '0.76rem',
                    }}
                  >
                    <div className="dp-muted" style={{ fontWeight: 600 }}>
                      {idx === 0 ? 'Today' : day.date.slice(5)}
                    </div>
                    <div title={d.label} aria-label={d.label} style={{ fontSize: '1.15rem', margin: '2px 0' }}>{d.emoji}</div>
                    <strong>
                      {day.maxTemp}° / {day.minTemp}°
                    </strong>
                    {day.precipProb > 0 && <div className="dp-muted">{day.precipProb}% 💧</div>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
};
