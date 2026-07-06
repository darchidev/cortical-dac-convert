# Cortical-DAC Convert

> Convert CL1 HDF5 recording files (`.h5`) to JSON — entirely in your browser.

Part of the [Cortical DAC](https://github.com/darchidev/cortical-dac) ecosystem.

## Usage

### Browser (no upload, no size limits)

1. Go to **[cl1.dariochiapperini.dev](https://cl1.dariochiapperini.dev)**
2. Select your `.h5` file
3. Click **Convert**
4. Preview or download the JSON result

The file is processed locally via WebAssembly — it never leaves your machine.

### API (for CLI / automation)

```bash
curl -X POST https://cl1.dariochiapperini.dev/api/convert \
  -F "file=@recording.h5"
```

**Response:**

```json
{
  "id": "conv_1712345678_abc123",
  "channels": 64,
  "frames": 5000,
  "attributes": {
    "sample_rate": 25000,
    "device_id": "CL1-12345"
  },
  "samples": [0, 1, -2, 3, ...]
}
```

Files larger than ~4 MB are streamed. For best results on large files, use the [browser tool](https://cl1.dariochiapperini.dev) instead.

## Tech stack

- **[h5wasm](https://github.com/usnistgov/h5wasm)** — HDF5 pure JS/WASM implementation
- **[Vercel](https://vercel.com)** — serverless API deployment
- **TypeScript** — API handler
- **Vanilla HTML/JS** — browser UI

## Local development

```bash
npm install
npm run dev     # uses vercel dev
```

## Deploy

```bash
npm run deploy   # vercel --prod
```

## License

MIT — see [LICENSE](LICENSE).

## Credits

- [h5wasm](https://github.com/usnistgov/h5wasm) by NIST
- [Cortical Labs cl-docs](https://github.com/cortical-labs/cl-docs) — CL1 API reference
