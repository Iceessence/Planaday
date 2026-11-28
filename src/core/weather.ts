// Free, zero-API-key Weather Engine powered by Open-Meteo (with graceful offline cache fallback)

export interface WeatherForecastDay {
  date: string;
  code: number;
  maxTemp: number;
  minTemp: number;
  precipProb: number;
}

export interface WeatherSnapshot {
  locationName: string;
  latitude: number;
  longitude: number;
  unit: 'F' | 'C';
  temp: number;
  feelsLike: number;
  windSpeed: number;
  humidity: number;
  weatherCode: number;
  conditionLabel: string;
  emoji: string;
  highTemp: number;
  lowTemp: number;
  precipProb: number;
  fetchedAt: string;
  daily: WeatherForecastDay[];
}

export interface GeocodedPlace {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export function describeWeatherCode(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: 'Clear Sky', emoji: '☀️' };
  if (code === 1) return { label: 'Mainly Clear', emoji: '🌤️' };
  if (code === 2) return { label: 'Partly Cloudy', emoji: '⛅' };
  if (code === 3) return { label: 'Overcast', emoji: '☁️' };
  if (code === 45 || code === 48) return { label: 'Foggy', emoji: '🌫️' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', emoji: '🌦️' };
  if (code >= 61 && code <= 67) return { label: 'Rain', emoji: '🌧️' };
  if (code >= 71 && code <= 77) return { label: 'Snow', emoji: '❄️' };
  if (code >= 80 && code <= 82) return { label: 'Rain Showers', emoji: '🌦️' };
  if (code >= 85 && code <= 86) return { label: 'Snow Showers', emoji: '🌨️' };
  if (code >= 95) return { label: 'Thunderstorm', emoji: '⛈️' };
  return { label: 'Mild', emoji: '🌤️' };
}

async function fetchJsonWithTimeout<T>(url: string, ms = 8000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const fetchWithSignalFallback = async (): Promise<Response> => {
      try {
        return await fetch(url, { signal: controller.signal });
      } catch (err) {
        if (!controller.signal.aborted && err instanceof TypeError && /AbortSignal|signal/i.test(err.message)) {
          return await fetch(url);
        }
        throw err;
      }
    };
    const response = await Promise.race([
      fetchWithSignalFallback(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Weather request timed out'));
        }, ms);
      }),
    ]);
    if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
    return await response.json() as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Weather request timed out');
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const geocodeCache = new Map<string, { expires: number; places: GeocodedPlace[] }>();
const geocodeInFlight = new Map<string, Promise<GeocodedPlace[]>>();
const forecastInFlight = new Map<string, Promise<WeatherSnapshot>>();

export async function searchWeatherLocations(query: string): Promise<GeocodedPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const key = q.toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.places.map(p => ({ ...p }));
  let pending = geocodeInFlight.get(key);
  if (!pending) {
    pending = (async () => {
      const data = await fetchJsonWithTimeout<{ results?: GeocodedPlace[] }>(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`, 7000);
      const places = (data.results ?? []).filter(r => typeof r.name === 'string' && validCoords(r.latitude, r.longitude));
      if (geocodeCache.size >= 64) geocodeCache.delete(geocodeCache.keys().next().value!);
      geocodeCache.set(key, { expires: Date.now() + 15 * 60_000, places });
      return places;
    })().finally(() => geocodeInFlight.delete(key));
    geocodeInFlight.set(key, pending);
  }
  return (await pending).map(p => ({ ...p }));
}

function validCoords(lat: number, lon: number) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export async function fetchLiveWeather(
  latitude: number,
  longitude: number,
  locationName: string,
  unit: 'F' | 'C' = 'F'
): Promise<WeatherSnapshot> {
  if (!validCoords(latitude, longitude)) throw new Error('Invalid weather coordinates');
  const key = `${latitude}:${longitude}:${unit}`;
  let pending = forecastInFlight.get(key);
  if (!pending) {
    pending = loadForecast(latitude, longitude, locationName, unit).finally(() => forecastInFlight.delete(key));
    forecastInFlight.set(key, pending);
  }
  const result = await pending;
  return { ...result, locationName, daily: result.daily.map(day => ({ ...day })) };
}

async function loadForecast(latitude: number, longitude: number, locationName: string, unit: 'F' | 'C'): Promise<WeatherSnapshot> {
  const tempUnit = unit === 'C' ? 'celsius' : 'fahrenheit';
  const windUnit = unit === 'C' ? 'kmh' : 'mph';
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&timezone=auto&forecast_days=5`;

  const data = await fetchJsonWithTimeout<{
    current?: {
      temperature_2m?: number;
      relative_humidity_2m?: number;
      apparent_temperature?: number;
      weather_code?: number;
      wind_speed_10m?: number;
    };
    daily?: {
      time?: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: number[];
    };
  }>(url);

  const cur = data.current ?? {};
  const required = [cur.temperature_2m, cur.relative_humidity_2m, cur.apparent_temperature, cur.weather_code, cur.wind_speed_10m];
  if (!required.every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error('Weather service returned incomplete current conditions');
  const code = cur.weather_code ?? 0;
  const desc = describeWeatherCode(code);

  const times = data.daily?.time ?? [];
  const daily: WeatherForecastDay[] = times.flatMap((date, idx) => {
    const values = [data.daily?.weather_code?.[idx], data.daily?.temperature_2m_max?.[idx], data.daily?.temperature_2m_min?.[idx], data.daily?.precipitation_probability_max?.[idx]];
    if (!values.every(v => typeof v === 'number' && Number.isFinite(v))) return [];
    return [{
    date,
    code: data.daily?.weather_code?.[idx] ?? 0,
    maxTemp: Math.round(data.daily?.temperature_2m_max?.[idx] ?? cur.temperature_2m ?? 70),
    minTemp: Math.round(data.daily?.temperature_2m_min?.[idx] ?? cur.temperature_2m ?? 55),
    precipProb: Math.round(data.daily?.precipitation_probability_max?.[idx] ?? 0),
    }];
  });
  if (!daily.length || daily[0].date !== times[0]) throw new Error('Weather service returned incomplete forecast');

  return {
    locationName,
    latitude,
    longitude,
    unit,
    temp: Math.round(cur.temperature_2m ?? 70),
    feelsLike: Math.round(cur.apparent_temperature ?? cur.temperature_2m ?? 70),
    windSpeed: Math.round(cur.wind_speed_10m ?? 0),
    humidity: Math.round(cur.relative_humidity_2m ?? 50),
    weatherCode: code,
    conditionLabel: desc.label,
    emoji: desc.emoji,
    highTemp: daily[0]?.maxTemp ?? Math.round(cur.temperature_2m ?? 72),
    lowTemp: daily[0]?.minTemp ?? Math.round(cur.temperature_2m ?? 56),
    precipProb: daily[0]?.precipProb ?? 0,
    fetchedAt: new Date().toISOString(),
    daily,
  };
}
