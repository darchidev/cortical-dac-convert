# 🧠 Cortical DAC — H5 to JSON Converter

> Standalone Vercel serverless function that converts CL1 HDF5 recording files (`.h5`) to plain JSON.

Part of the [Cortical DAC](https://github.com/anomalyco/cortical-dac) ecosystem.

## How it works

1. Upload an `.h5` recording file via `POST`
2. h5wasm reads the `samples` dataset + HDF5 attributes
3. Returns JSON with metadata and sample data

## API

### `POST /api/convert`

**Request:** `multipart/form-data` with an `.h5` file

**Response (small files):**
```json
{
  "id": "conv_1712345678_abc123",
  "channels": 64,
  "frames": 5000,
  "attributes": { "startTimestamp": 12345, ... },
  "samples": [0, 1, -2, 3, ...]
}
```

**Response (large files >4MB):** Streamed JSON download (`Content-Disposition: attachment`)

## Deploy

```bash
npm install
npx vercel --prod
```

## Credit

Built using [h5wasm](https://github.com/usnistgov/h5wasm) — HDF5 pure JS/WASM implementation.
Original CL1 API reference: [Cortical Labs cl-docs](https://github.com/cortical-labs/cl-docs).
