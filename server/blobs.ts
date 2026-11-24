import fs from 'node:fs';
import path from 'node:path';

export interface BlobMeta {
  hash: string;
  mimeType: string;
  name: string;
  size: number;
  createdAt: string;
}

export class ServerBlobStore {
  private blobsDir: string;

  constructor(dataDir: string) {
    this.blobsDir = path.join(dataDir, 'blobs');
    fs.mkdirSync(this.blobsDir, { recursive: true });
  }

  private safeHash(hash: string): string {
    if (!/^[a-f0-9]{12,128}$/i.test(hash)) {
      throw new Error('Invalid blob hash');
    }
    return hash.toLowerCase();
  }

  public putBlob(hash: string, data: Buffer, mimeType: string, name: string): BlobMeta {
    const safe = this.safeHash(hash);
    const dataPath = path.join(this.blobsDir, `${safe}.bin`);
    const metaPath = path.join(this.blobsDir, `${safe}.json`);
    const meta: BlobMeta = {
      hash: safe,
      mimeType: mimeType || 'application/octet-stream',
      name: name || 'attachment',
      size: data.byteLength,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(dataPath, data);
    fs.writeFileSync(metaPath, JSON.stringify(meta));
    return meta;
  }

  public getBlob(hash: string): { data: Buffer; meta: BlobMeta } | null {
    const safe = this.safeHash(hash);
    const dataPath = path.join(this.blobsDir, `${safe}.bin`);
    const metaPath = path.join(this.blobsDir, `${safe}.json`);
    if (!fs.existsSync(dataPath)) return null;
    const data = fs.readFileSync(dataPath);
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
}
