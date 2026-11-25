// Planaday Application-Layer Authentication, Device Pairing & Authorization (PD-004 / PF-04)
// Uses Node built-in crypto (scryptSync + SHA-256 token hashing + timingSafeEqual) with SQLite persistence.

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export type AuthRole = 'owner' | 'member';

export interface AuthenticatedPrincipal {
  tokenId: string;
  deviceId: string;
  label: string;
  role: AuthRole;
  allowedWorkspaces: string[] | null; // null = all workspaces (owner)
}

export interface DeviceTokenSummary {
  tokenId: string;
  deviceId: string;
  label: string;
  role: AuthRole;
  allowedWorkspaces: string[] | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function hashPassphrase(passphrase: string, saltHex?: string): { hash: string; salt: string } {
  const salt = saltHex ?? crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passphrase, salt, 64).toString('hex');
  return { hash: derived, salt };
}

function verifyPassphrase(passphrase: string, salt: string, expectedHex: string): boolean {
  const actual = crypto.scryptSync(passphrase, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export class ServerAuthStore {
  private readonly requireAuthByConfig: boolean;

  constructor(private readonly db: DatabaseSync, requireAuth = false) {
    this.requireAuthByConfig = requireAuth || process.env.PLANADAY_AUTH_REQUIRED === 'true';
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_owner (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        owner_name TEXT NOT NULL,
        pass_salt TEXT NOT NULL,
        pass_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_device_tokens (
        token_id TEXT PRIMARY KEY,
        token_hash TEXT UNIQUE NOT NULL,
        device_id TEXT NOT NULL,
        label TEXT NOT NULL,
        role TEXT NOT NULL,
        allowed_workspaces TEXT,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      );
      CREATE TABLE IF NOT EXISTS auth_pairing_codes (
        code_hash TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        allowed_workspaces TEXT,
        label TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT
      );
      CREATE TABLE IF NOT EXISTS auth_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        event TEXT NOT NULL,
        actor TEXT NOT NULL,
        detail TEXT
      );
    `);

    // Optional deterministic bootstrap via env var PLANADAY_OWNER_TOKEN for headless Docker deployments
    const envToken = process.env.PLANADAY_OWNER_TOKEN?.trim();
    if (envToken && envToken.length >= 16) {
      const th = hashToken(envToken);
      const exists = this.db.prepare('SELECT 1 FROM auth_device_tokens WHERE token_hash = ?').get(th);
      if (!exists) {
        const now = new Date().toISOString();
        this.db
          .prepare(
            'INSERT OR IGNORE INTO auth_owner (id, owner_name, pass_salt, pass_hash, created_at) VALUES (1, ?, ?, ?, ?)'
          )
          .run('Owner', 'env-bootstrap', hashToken(`env:${envToken}`), now);
        this.db
          .prepare(
            'INSERT INTO auth_device_tokens (token_id, token_hash, device_id, label, role, allowed_workspaces, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          )
          .run(`tok_env_${th.slice(0, 8)}`, th, 'env-owner', 'Docker Env Owner Token', 'owner', null, now);
      }
    }
  }

  public isOwnerInitialized(): boolean {
    const row = this.db.prepare('SELECT 1 FROM auth_owner WHERE id = 1').get();
    return Boolean(row);
  }

  public isAuthEnforced(): boolean {
    return this.requireAuthByConfig || this.isOwnerInitialized();
  }

  public logAudit(event: string, actor: string, detail = ''): void {
    this.db
      .prepare('INSERT INTO auth_audit_log (at, event, actor, detail) VALUES (?, ?, ?, ?)')
      .run(new Date().toISOString(), event, actor, detail.slice(0, 300));
  }

  public setupOwner(
    ownerName: string,
    passphrase: string,
    deviceId: string,
    deviceLabel = 'Primary Owner Device'
  ): { token: string; tokenId: string; ownerName: string } {
    if (this.isOwnerInitialized()) {
      throw new Error('Owner account is already initialized. Use sign-in or device pairing.');
    }
    if (!passphrase || passphrase.length < 8) {
      throw new Error('Owner passphrase must be at least 8 characters.');
    }
    const cleanName = ownerName.trim() || 'Owner';
    const { hash, salt } = hashPassphrase(passphrase);
    const now = new Date().toISOString();
    this.db
      .prepare('INSERT INTO auth_owner (id, owner_name, pass_salt, pass_hash, created_at) VALUES (1, ?, ?, ?, ?)')
      .run(cleanName, salt, hash, now);
    const issued = this.issueDeviceToken(deviceId || 'owner-primary', deviceLabel, 'owner', null);
    this.logAudit('owner_setup', issued.tokenId, `Initialized owner "${cleanName}"`);
    return { token: issued.token, tokenId: issued.tokenId, ownerName: cleanName };
  }

  public signInOwner(
    passphrase: string,
    deviceId: string,
    deviceLabel = 'Paired Owner Device'
  ): { token: string; tokenId: string } {
    const row = this.db.prepare('SELECT pass_salt, pass_hash FROM auth_owner WHERE id = 1').get() as
      | { pass_salt: string; pass_hash: string }
      | undefined;
    if (!row || row.pass_salt === 'env-bootstrap') {
      throw new Error('Owner passphrase sign-in is not configured.');
    }
    if (!verifyPassphrase(passphrase, row.pass_salt, row.pass_hash)) {
      this.logAudit('signin_failed', deviceId || 'unknown', 'Invalid passphrase');
      throw new Error('Invalid owner passphrase.');
    }
    const issued = this.issueDeviceToken(deviceId || `dev_${Date.now().toString(36)}`, deviceLabel, 'owner', null);
    this.logAudit('signin_ok', issued.tokenId, deviceLabel);
    return issued;
  }

  public issueDeviceToken(
    deviceId: string,
    label: string,
    role: AuthRole,
    allowedWorkspaces: string[] | null
  ): { token: string; tokenId: string } {
    const rawToken = `pld_${crypto.randomBytes(24).toString('base64url')}`;
    const tokenId = `tok_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO auth_device_tokens (token_id, token_hash, device_id, label, role, allowed_workspaces, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        tokenId,
        hashToken(rawToken),
        deviceId || tokenId,
        label.trim() || 'Device',
        role,
        allowedWorkspaces ? JSON.stringify(allowedWorkspaces) : null,
        now
      );
    return { token: rawToken, tokenId };
  }

  public createPairingCode(
    label: string,
    role: AuthRole = 'owner',
    allowedWorkspaces: string[] | null = null,
    ttlMinutes = 10
  ): { code: string; expiresAt: string } {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8-char one-time code
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(1, Math.min(60, ttlMinutes)) * 60_000).toISOString();
    this.db
      .prepare(
        'INSERT INTO auth_pairing_codes (code_hash, role, allowed_workspaces, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        hashToken(code),
        role,
        allowedWorkspaces ? JSON.stringify(allowedWorkspaces) : null,
        label.trim() || 'Paired Device',
        now.toISOString(),
        expiresAt
      );
    this.logAudit('pair_code_created', 'owner', `role=${role}, label=${label}`);
    return { code, expiresAt };
  }

  public redeemPairingCode(code: string, deviceId: string, deviceLabel?: string): { token: string; tokenId: string; role: AuthRole } {
    const clean = code.trim().toUpperCase();
    const ch = hashToken(clean);
    const row = this.db
      .prepare('SELECT role, allowed_workspaces, label, expires_at, used_at FROM auth_pairing_codes WHERE code_hash = ?')
      .get(ch) as
      | { role: AuthRole; allowed_workspaces: string | null; label: string; expires_at: string; used_at: string | null }
      | undefined;

    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error('Pairing code is invalid, already used, or expired.');
    }
    this.db.prepare('UPDATE auth_pairing_codes SET used_at = ? WHERE code_hash = ?').run(new Date().toISOString(), ch);
    const workspaces = row.allowed_workspaces ? (JSON.parse(row.allowed_workspaces) as string[]) : null;
    const issued = this.issueDeviceToken(deviceId, deviceLabel || row.label, row.role, workspaces);
    this.logAudit('device_paired', issued.tokenId, `device=${deviceId}, role=${row.role}`);
    return { ...issued, role: row.role };
  }

  public verifyBearerToken(rawToken: string | null | undefined): AuthenticatedPrincipal | null {
    if (!rawToken || rawToken.length < 12) return null;
    const th = hashToken(rawToken.trim());
    const row = this.db
      .prepare(
        'SELECT token_id, device_id, label, role, allowed_workspaces, revoked_at FROM auth_device_tokens WHERE token_hash = ?'
      )
      .get(th) as
      | {
          token_id: string;
          device_id: string;
          label: string;
          role: AuthRole;
          allowed_workspaces: string | null;
          revoked_at: string | null;
        }
      | undefined;
    if (!row || row.revoked_at) return null;

    this.db.prepare('UPDATE auth_device_tokens SET last_used_at = ? WHERE token_id = ?').run(new Date().toISOString(), row.token_id);
    return {
      tokenId: row.token_id,
      deviceId: row.device_id,
      label: row.label,
      role: row.role,
      allowedWorkspaces: row.allowed_workspaces ? (JSON.parse(row.allowed_workspaces) as string[]) : null,
    };
  }

  public revokeToken(tokenId: string): boolean {
    const res = this.db
      .prepare('UPDATE auth_device_tokens SET revoked_at = ? WHERE token_id = ? AND revoked_at IS NULL')
      .run(new Date().toISOString(), tokenId);
    if (res.changes > 0) {
      this.logAudit('device_revoked', 'owner', tokenId);
      return true;
    }
    return false;
  }

  public listDevices(): DeviceTokenSummary[] {
    const rows = this.db
      .prepare(
        'SELECT token_id, device_id, label, role, allowed_workspaces, created_at, last_used_at, revoked_at FROM auth_device_tokens ORDER BY created_at DESC'
      )
      .all() as Array<{
      token_id: string;
      device_id: string;
      label: string;
      role: AuthRole;
      allowed_workspaces: string | null;
      created_at: string;
      last_used_at: string | null;
      revoked_at: string | null;
    }>;
    return rows.map((r) => ({
      tokenId: r.token_id,
      deviceId: r.device_id,
      label: r.label,
      role: r.role,
      allowedWorkspaces: r.allowed_workspaces ? (JSON.parse(r.allowed_workspaces) as string[]) : null,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
      revokedAt: r.revoked_at,
    }));
  }
}
