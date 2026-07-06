import type { VercelRequest, VercelResponse } from '@vercel/node';
import h5wasm, { FS as H5FS } from 'h5wasm';

export const config = {
  api: {
    bodyParser: false,
  },
};

function readBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match?.[1] ?? match?.[2] ?? null;
}

function extractFile(raw: Buffer, boundary: string): Buffer | null {
  const marker = Buffer.from(`--${boundary}`);
  const end = Buffer.from(`--${boundary}--`);
  const startIdx = raw.indexOf(marker);
  if (startIdx === -1) return null;
  const headerEnd = raw.indexOf(Buffer.from('\r\n\r\n'), startIdx);
  if (headerEnd === -1) return null;
  const dataStart = headerEnd + 4;
  const endIdx = raw.indexOf(marker, dataStart);
  const finalEnd = endIdx !== -1 ? endIdx - 2 : raw.indexOf(end) !== -1 ? raw.indexOf(end) - 2 : raw.length;
  if (finalEnd <= dataStart) return null;
  return raw.subarray(dataStart, finalEnd);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Send a POST request with an H5 file.' });
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return res.status(400).json({ error: 'Content-Type must be multipart/form-data' });
  }

  try {
    const raw = await readBody(req);
    const boundary = parseBoundary(contentType);
    if (!boundary) {
      return res.status(400).json({ error: 'Could not parse multipart boundary' });
    }

    const fileData = extractFile(raw, boundary);
    if (!fileData || fileData.length === 0) {
      return res.status(400).json({ error: 'No file found in upload' });
    }

    // h5wasm reads from its virtual MEMFS filesystem
    await h5wasm.ready;
    const memPath = '/tmp/upload.h5';
    H5FS!.writeFile(memPath, new Uint8Array(fileData));
    const file = new h5wasm.File(memPath, 'r');

    const ds = file.get('samples') as any;
    const samples: Int16Array = ds?.value ?? new Int16Array(0);
    const totalFrames = ds ? ds.shape[0] : 0;
    const channels = ds ? ds.shape[1] : 0;

    const attrs: Record<string, unknown> = {};
    if (file.attrs) {
      for (const key of Object.keys(file.attrs)) {
        try { attrs[key] = file.get_attribute(key, true); } catch { /* ignore */ }
      }
    }
    file.close();
    try { H5FS!.unlink(memPath); } catch { /* ignore */ }

    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Estimate size to decide inline vs streaming
    const estimatedJsonBytes = totalFrames * channels * 7; // worst case "-32768," = 7 bytes per sample as JSON string
    const MAX_INLINE = 4 * 1024 * 1024; // 4 MB — safe for Vercel free tier

    if (estimatedJsonBytes <= MAX_INLINE) {
      // Return as JSON inline
      const samplesArr: number[] = [];
      for (let i = 0; i < totalFrames * channels; i++) {
        samplesArr.push(samples[i]);
      }
      return res.status(200).json({
        id,
        channels,
        frames: totalFrames,
        attributes: attrs,
        samples: samplesArr,
      });
    }

    // Stream as downloadable JSON
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${id}.json"`);
    res.write(`{"id":${JSON.stringify(id)},"attributes":${JSON.stringify(attrs)},"channels":${channels},"frames":${totalFrames},"samples":[`);

    const total = totalFrames * channels;
    for (let i = 0; i < total; i++) {
      if (i > 0) res.write(',');
      res.write(String(samples[i]));
    }
    res.write(']}');
    res.end();
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Conversion failed' });
  }
}
