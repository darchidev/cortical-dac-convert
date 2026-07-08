self.importScripts('https://cdn.jsdelivr.net/npm/h5wasm@0.10.3/dist/iife/h5wasm.min.js');

const CHUNK_FRAMES = 100000;

let ctx = null;

self.onmessage = function (e) {
  const msg = e.data;
  if (msg.type === 'open') {
    openFile(msg.file);
  } else if (msg.type === 'nextChunk') {
    sendNextChunk();
  } else if (msg.type === 'cancel') {
    cleanup();
  }
};

async function openFile(file) {
  try {
    const { FS } = await self.h5wasm.ready;

    FS.mkdir('/work');
    FS.mount(FS.filesystems.WORKERFS, { files: [file] }, '/work');

    const f = new h5wasm.File('/work/' + file.name, 'r');
    const ds = f.get('samples');

    const totalFrames = ds.shape[0];
    const channels = ds.shape[1];

    const attrs = {};
    if (f.attrs) {
      for (const key of Object.keys(f.attrs)) {
        try { attrs[key] = f.get_attribute(key, true); } catch { /* skip */ }
      }
    }

    ctx = { f, ds, totalFrames, channels, attrs, nextStart: 0 };

    self.postMessage({
      type: 'metadata',
      payload: { channels, frames: totalFrames, attributes: attrs },
    });

    sendNextChunk();
  } catch (err) {
    self.postMessage({ type: 'error', payload: err.message });
  }
}

function sendNextChunk() {
  if (!ctx || ctx.nextStart >= ctx.totalFrames) {
    cleanup();
    self.postMessage({ type: 'done' });
    return;
  }

  const end = Math.min(ctx.nextStart + CHUNK_FRAMES, ctx.totalFrames);
  const slice = ctx.ds.slice([[ctx.nextStart, end], []]);

  self.postMessage({
    type: 'chunk',
    payload: {
      json: typedArrayToJson(slice),
      start: ctx.nextStart,
      end,
    },
  });

  ctx.nextStart = end;
}

function typedArrayToJson(arr) {
  const len = arr.length;
  if (len === 0) return '';
  return Array.from(arr).toString();
}

function cleanup() {
  if (ctx) {
    try { ctx.f.close(); } catch { /* ignore */ }
    ctx = null;
  }
}
