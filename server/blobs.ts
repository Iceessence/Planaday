import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface BlobMeta {
  hash: string;
  mimeType: string;
  name: string;
  size: number;
  createdAt: string;
  verifiedSha256?: boolean;
}

export class ServerBlobStore {
  private blobsDir: string;

  constructor(dataDir: string) {
    this.blobsDir = path.join(dataDir, 'blobs');
    fs.mkdirSync(this.blobsDir, { recursive: true });
  }

  private safeHash(hash: string): string {
    if (!/^[a-f0-9]{12,128}$/i.test(hash)) {
      throw new Error('Invalid blob hash format');
    }
    return hash.toLowerCase();
  }

  /**
   * PD-015: Independently recomputes SHA-256 over uploaded bytes before publication
   * and atomically stages both binary data and metadata sidecar via temp-file rename.
   */
  public putBlob(hash: string, data: Buffer, mimeType: string, name: string): BlobMeta {
    const safe = this.safeHash(hash);
    const computedSha256 = crypto.createHash('sha256').update(data).digest('hex');
    if (safe.length === 64 && computedSha256 !== safe) {
      throw new Error(`Blob integrity mismatch: advertised ${safe.slice(0, 12)}… != computed ${computedSha256.slice(0, 12)}…`);
    }

    const dataPath = path.join(this.blobsDir, `${safe}.bin`);
    const metaPath = path.join(this.blobsDir, `${safe}.json`);
    const nonce = crypto.randomBytes(6).toString('hex');
    const tmpDataPath = path.join(this.blobsDir, `.${safe}.${nonce}.bin.tmp`);
    const tmpMetaPath = path.join(this.blobsDir, `.${safe}.${nonce}.json.tmp`);

    const meta: BlobMeta = {
      hash: safe,
      mimeType: (mimeType || 'application/octet-stream').split(';')[0].trim().toLowerCase(),
      name: (name || 'attachment').replace(/[\r\n]/g, '').slice(0, 200),
      size: data.byteLength,
      createdAt: new Date().toISOString(),
      verifiedSha256: safe.length === 64,
    };

    try {
      fs.writeFileSync(tmpDataPath, data);
      fs.writeFileSync(tmpMetaPath, JSON.stringify(meta));
      fs.renameSync(tmpDataPath, dataPath);
      fs.renameSync(tmpMetaPath, metaPath);
    } catch (err) {
      try { if (fs.existsSync(tmpDataPath)) fs.unlinkSync(tmpDataPath); } catch { /* ignore */ }
      try { if (fs.existsSync(tmpMetaPath)) fs.unlinkSync(tmpMetaPath); } catch { /* ignore */ }
      throw err;
    }
    return meta;
  }

  public getBlob(hash: string): { data: Buffer; meta: BlobMeta } | null {
    const safe = this.safeHash(hash);
    const dataPath = path.join(this.blobsDir, `${safe}.bin`);
    const metaPath = path.join(this.blobsDir, `${safe}.json`);
    if (!fs.existsSync(dataPath)) return null;
    const data = fs.readFileSync(dataPath);
    // Verify stored bytes match SHA-256 on read for 64-char SHA-256 blobs
    if (safe.length === 64) {
      const actual = crypto.createHash('sha256').update(data).digest('hex');
      if (actual !== safe) {
        throw new Error(`Stored blob integrity failure for ${safe.slice(0, 12)}…`);
      }
    }
    const meta: BlobMeta = fs.existsSync(metaPath)
      ? (JSON.parse(fs.readFileSync(metaPath, 'utf8')) as BlobMeta)
      : {
          hash: safe,
          mimeType: 'application/octet-stream',
          name: safe,
          size: data.byteLength,
          createdAt: new Date().toISOString(),
        };
    return { data, meta };
  }

  public listBlobChecksums(): Array<{ hash: string; size: number; mimeType: string; name: string }> {
    const out: Array<{ hash: string; size: number; mimeType: string; name: string }> = [];
    if (!fs.existsSync(this.blobsDir)) return out;
    for (const f of fs.readdirSync(this.blobsDir)) {
      if (!f.endsWith('.bin') || f.startsWith('.')) continue;
      const hash = f.slice(0, -4);
      const dataPath = path.join(this.blobsDir, f);
      const metaPath = path.join(this.blobsDir, `${hash}.json`);
      try {
        const st = fs.statSync(dataPath);
        const meta = fs.existsSync(metaPath) ? (JSON.parse(fs.readFileSync(metaPath, 'utf8')) as BlobMeta) : null;
        out.push({
          hash,
          size: st.size,
          mimeType: meta?.mimeType || 'application/octet-stream',
          name: meta?.name || hash,
        });
      } catch {
        // skip unreadable entry
      }
    }
    return out;
  }
}
