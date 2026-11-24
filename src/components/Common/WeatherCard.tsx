import React, { useEffect, useState } from 'react';
import { CloudSun, Droplets, LocateFixed, RefreshCw, Search, Wind } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import {
  describeWeatherCode,
  fetchLiveWeather,
  searchWeatherLocations,
  type GeocodedPlace,
} from '../../core/weather';

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

  const weather = settings.cachedWeather;
  const unit = settings.weatherUnit || 'F';

  const refreshWeather = async (
    lat = settings.weatherLat,
    lon = settings.weatherLon,
    name = settings.weatherLocationName || 'My Location',
    targetUnit: 'F' | 'C' = unit
  ) => {
    if (lat === null || lon === null) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setErrorMsg('Offline — showing last cached forecast.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const snap = await fetchLiveWeather(lat, lon, name, targetUnit);
      await patchSettings({
        weatherLat: lat,
        weatherLon: lon,
        weatherLocationName: name,
        weatherUnit: targetUnit,
        cachedWeather: snap,
      });
    } catch {
      setErrorMsg('Unable to reach weather service right now.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh stale weather (> 30 min) silently when online
  useEffect(() => {
    if (!settings.weatherEnabled || settings.weatherLat === null || settings.weatherLon === null) return;
    const stale =
      !weather ||
      weather.unit !== unit ||
      Date.now() - Date.parse(weather.fetchedAt) > 30 * 60_000;
    if (stale && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      void refreshWeather(settings.weatherLat, settings.weatherLon, settings.weatherLocationName || 'My Location', unit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.weatherEnabled, settings.weatherLat, settings.weatherLon, unit]);

  const handleLocateMe = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMsg('Geolocation unavailable — type your city name instead.');
      setEditingLoc(true);
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void refreshWeather(pos.coords.latitude, pos.coords.longitude, 'Current Location', unit);
        setEditingLoc(false);
      },
      () => {
        setLoading(false);
        setErrorMsg('Location permission denied — search by city name below.');
        setEditingLoc(true);
      },
      { timeout: 8000 }
    );
  };

  const handleCitySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityQuery.trim()) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const found = await searchWeatherLocations(cityQuery);
      setMatches(found);
      if (found.length === 0) setErrorMsg('No matching city found. Try a nearby city name.');
    } catch {
      setErrorMsg('City search requires an internet connection.');
    } finally {
      setLoading(false);
    }
  };

  if (!settings.weatherEnabled) return null;

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

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
              {isOffline ? ' · Cached' : ''}
            </div>
          </div>
        </div>
        <div className="dp-row" style={{ gap: 4 }}>
          {onInsertWeatherNote && (
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              onClick={() => {
                onInsertWeatherNote(summaryText);
                pushToast('Copied live weather into Today Diary!');
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
            onClick={() => void refreshWeather(settings.weatherLat, settings.weatherLon, settings.weatherLocationName || 'My Location', 'F')}
          >
            °F
          </button>
          <button
            type="button"
            className={`dp-btn dp-btn-sm ${unit === 'C' ? 'dp-btn-primary' : ''}`}
            onClick={() => void refreshWeather(settings.weatherLat, settings.weatherLon, settings.weatherLocationName || 'My Location', 'C')}
          >
            °C
          </button>
          {weather && (
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              disabled={loading}
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
          <div className="dp-row" style={{ gap: 6 }}>
            <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" disabled={loading} onClick={handleLocateMe}>
              <LocateFixed size={13} /> Use My Location
            </button>
            <form className="dp-row" style={{ flex: 1, gap: 6 }} onSubmit={handleCitySearch}>
              <input
                className="dp-input"
                style={{ flex: 1 }}
                placeholder="Or search city (e.g., Seattle, Austin, London)…"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
              />
              <button type="submit" className="dp-btn dp-btn-sm" disabled={loading}>
                <Search size={13} /> Find
              </button>
            </form>
          </div>
          {matches.length > 0 && (
            <div className="dp-row" style={{ gap: 5 }}>
              {matches.map((m, idx) => {
                const label = [m.name, m.admin1, m.country].filter(Boolean).join(', ');
                return (
                  <button
                    key={idx}
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => {
                      setMatches([]);
                      setEditingLoc(false);
                      void refreshWeather(m.latitude, m.longitude, m.name, unit);
                    }}
                  >
                    📍 {label}
                  </button>
                );
              })}
            </div>
          )}
          {errorMsg && <span style={{ fontSize: '0.8rem', color: 'var(--dp-warn)' }}>{errorMsg}</span>}
        </div>
      )}

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
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weather.daily.length}, minmax(0, 1fr))`, gap: 6 }}>
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
                    <div style={{ fontSize: '1.15rem', margin: '2px 0' }}>{d.emoji}</div>
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
