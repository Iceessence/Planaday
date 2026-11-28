// Unified Native OS (Capacitor LocalNotifications), Desktop (Electron/Web Notification),
// Audio Chimes (with custom volume & sound styles), and Background Docker ntfy Push Bridge.

import { audioEngine } from './audio';
import { getOrInitSettings } from './db';
import type { ChimeStyle, NotificationPreferences } from './types';

export interface NativeBridgeInfo {
  platform: 'capacitor-native' | 'electron-desktop' | 'web-pwa';
  canWakeWhenBrowserClosed: boolean;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: {
    LocalNotifications?: {
      requestPermissions: () => Promise<{ display: string }>;
      schedule: (opts: {
        notifications: Array<{
          id: number;
          title: string;
          body: string;
          schedule: { at: Date; allowWhileIdle?: boolean };
          sound?: string;
        }>;
      }) => Promise<void>;
      cancel: (opts: { notifications: Array<{ id: number }> }) => Promise<void>;
    };
  };
}

function getCapacitor(): CapacitorGlobal | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
}

export function detectRuntimePlatform(): NativeBridgeInfo {
  const cap = getCapacitor();
  if (cap?.isNativePlatform?.()) {
    return { platform: 'capacitor-native', canWakeWhenBrowserClosed: true };
  }
  if (typeof window !== 'undefined' && 'dayplanaDesktop' in window) {
    return { platform: 'electron-desktop', canWakeWhenBrowserClosed: true };
  }
  return { platform: 'web-pwa', canWakeWhenBrowserClosed: false };
}

function hashIdToInt(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h % 2000000000) + 1;
}

export async function requestAlarmNotificationPermission(): Promise<boolean> {
  const cap = getCapacitor();
  if (cap?.isNativePlatform?.() && cap.Plugins?.LocalNotifications) {
    try {
      const perm = await cap.Plugins.LocalNotifications.requestPermissions();
      return perm.display === 'granted';
    } catch {
      return false;
    }
  }
  if (typeof Notification !== 'undefined') {
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      try { const res = await Notification.requestPermission(); return res === 'granted'; } catch { return false; }
    }
  }
  return false;
}

/**
 * Schedules a real OS-level native alarm/timer/event notification on Android/iOS (Capacitor)
 * so alerts fire even when Chrome/the app is closed and the screen is locked.
 */
export async function scheduleNativeNotification(
  id: string,
  title: string,
  body: string,
  fireAtMs: number
): Promise<boolean> {
  if (!Number.isFinite(fireAtMs) || fireAtMs <= Date.now()) return false;
  const cap = getCapacitor();
  if (cap?.isNativePlatform?.() && cap.Plugins?.LocalNotifications) {
    try {
      await cap.Plugins.LocalNotifications.schedule({
        notifications: [
          {
            id: hashIdToInt(id),
            title,
            body,
            schedule: { at: new Date(fireAtMs), allowWhileIdle: true },
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function cancelNativeNotification(id: string): Promise<void> {
  const cap = getCapacitor();
  if (cap?.isNativePlatform?.() && cap.Plugins?.LocalNotifications) {
    try {
      await cap.Plugins.LocalNotifications.cancel({
        notifications: [{ id: hashIdToInt(id) }],
      });
    } catch {
      // non-fatal
    }
  }
}

export function fireLocalAlert(
  title: string,
  body: string,
  chime: ChimeStyle | 'complete' = 'bell',
  prefs?: Partial<NotificationPreferences>
) {
  if (prefs?.enabled === false) return;
  const vol01 = Math.max(0, Math.min(1, (prefs?.volume ?? 75) / 100));
  const style = prefs?.chimeStyle ?? chime;
  if (prefs?.soundEnabled !== false && vol01 > 0) {
    audioEngine.playChime(style, vol01);
  }
  if (prefs?.osPushEnabled !== false && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/icons/icon.svg' });
    } catch {
      // fallback to in-app chime/toast
    }
  }
}

export interface ServerPushConfigPayload {
  ntfyPushUrl: string;
  timeZone: string;
  notifyTimers?: boolean;
  notifyAlarms?: boolean;
  notifyEvents?: boolean;
  eventLeadMinutes?: number;
  notifyChores?: boolean;
  choreReminderTime?: string;
}

/**
 * Syncs background push relay URL & notification preferences to the Docker server
 * so timers, alarms, upcoming events, and chores notify your phone even when Chrome is closed.
 */
export async function syncPushConfigToServer(
  serverBase: string,
  ntfyPushUrl: string,
  timeZone: string,
  prefs?: Partial<NotificationPreferences>
): Promise<boolean> {
  try {
    const base = serverBase.trim().replace(/\/+$/, '');
    const body: ServerPushConfigPayload = {
      ntfyPushUrl: ntfyPushUrl.trim(),
      timeZone,
      notifyTimers: prefs?.notifyTimers ?? true,
      notifyAlarms: prefs?.notifyAlarms ?? true,
      notifyEvents: prefs?.notifyEvents ?? true,
      eventLeadMinutes: prefs?.eventLeadMinutes ?? 15,
      notifyChores: prefs?.notifyChores ?? true,
      choreReminderTime: prefs?.choreReminderTime ?? '09:00',
    };
    const settings = await getOrInitSettings();
    const configured = (settings.syncServerUrl || '').trim().replace(/\/+$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (base === configured && settings.syncAuthToken) headers.Authorization = `Bearer ${settings.syncAuthToken}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
    const res = await fetch(`${base}/api/push-config`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    return res.ok;
    } finally { clearTimeout(timeout); }
  } catch {
    return false;
  }
}
