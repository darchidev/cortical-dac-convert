self.importScripts('https://cdn.jsdelivr.net/npm/h5wasm@0.10.3/dist/iife/h5wasm.min.js');

const CHUNK_FRAMES = 100000;

let ctx = null;

self.onmessage = function (e) {
  const msg = e.data;
  if (msg.type === 'open') {
    openFile(msg.file, msg.options || {});
  } else if (msg.type === 'nextChunk') {
    sendNextChunk();
  } else if (msg.type === 'cancel') {
    cleanup();
  }
};

async function openFile(file, options) {
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
        try {
          let v = f.get_attribute(key, true);
          attrs[key] = decodePickle(v);
        } catch { /* skip */ }
      }
    }

    let spikesData = null;
    try {
      const sp = f.get('spikes');
      if (sp && sp.shape[0] > 0) {
        spikesData = readCompoundDataset(sp);
      }
    } catch { /* no spikes */ }

    let stimsData = null;
    try {
      const st = f.get('stims');
      if (st && st.shape[0] > 0) {
        stimsData = readCompoundDataset(st);
      }
    } catch { /* no stims */ }

    ctx = { f, ds, totalFrames, channels, attrs, options, nextStart: 0, spikes: spikesData, stims: stimsData };

    self.postMessage({
      type: 'metadata',
      payload: { channels, frames: totalFrames, attributes: attrs, hasSpikes: !!spikesData, spikeCount: spikesData ? spikesData.length : 0, hasStims: !!stimsData, stimCount: stimsData ? stimsData.length : 0 },
    });

    sendNextChunk();
  } catch (err) {
    self.postMessage({ type: 'error', payload: err.message });
  }
}

function sendNextChunk() {
  if (!ctx || ctx.nextStart >= ctx.totalFrames) {
    if (ctx) {
      if (ctx.spikes) self.postMessage({ type: 'extras', payload: { spikes: ctx.spikes } });
      if (ctx.stims) self.postMessage({ type: 'extras', payload: { stims: ctx.stims } });
    }
    cleanup();
    self.postMessage({ type: 'done' });
    return;
  }

  const end = Math.min(ctx.nextStart + CHUNK_FRAMES, ctx.totalFrames);
  const slice = ctx.ds.slice([[ctx.nextStart, end], []]);

  let json;
  if (ctx.options.uvConversion && ctx.attrs.uV_per_sample_unit) {
    json = typedArrayToUvJson(slice, ctx.attrs.uV_per_sample_unit);
  } else {
    json = typedArrayToJson(slice);
  }

  self.postMessage({
    type: 'chunk',
    payload: { json, start: ctx.nextStart, end },
  });

  ctx.nextStart = end;
}

function typedArrayToJson(arr) {
  const len = arr.length;
  if (len === 0) return '';
  return Array.from(arr).toString();
}

function typedArrayToUvJson(arr, factor) {
  const len = arr.length;
  if (len === 0) return '';
  const parts = new Array(len);
  for (let i = 0; i < len; i++) {
    parts[i] = (arr[i] * factor).toFixed(2);
  }
  return parts.join(',');
}

function readCompoundDataset(ds) {
  const n = ds.shape[0];
  if (n === 0) return [];
  const slice = ds.slice([[0, n]]);
  return Array.from(slice, function (row) {
    return Array.from(row, function (val) {
      if (typeof val === 'bigint') return Number(val);
      if (val && typeof val === 'object' && val.buffer instanceof ArrayBuffer) return Array.from(val);
      return val;
    });
  });
}

function decodePickle(v) {
  if (typeof v !== 'string' || !v.startsWith('(')) return v;
  try { return pickleParse(v); } catch { return v; }
}

function pickleParse(s) {
  var pos = 0, len = s.length;

  function skipWs() { while (pos < len && (s[pos] === '\n' || s[pos] === ' ')) pos++; }

  function readLine() {
    var start = pos;
    while (pos < len && s[pos] !== '\n') pos++;
    var line = s.slice(start, pos);
    if (pos < len) pos++;
    return line;
  }

  function skipMemo() {
    skipWs();
    while (pos < len && s[pos] === 'p') { readLine(); skipWs(); }
  }

  function parseValue() {
    skipWs();
    if (pos >= len) return undefined;
    var c = s[pos];

    if (c === '(') {
      pos++; skipWs();
      var c2 = s[pos];
      if (c2 === 'd') {
        pos++; skipMemo();
        var obj = {};
        while (pos < len) {
          skipWs();
          if (s[pos] === '.' || s[pos] === ')') break;
          var key = parseValue();
          if (key === undefined) break;
          skipWs();
          var val = parseValue();
          obj[key] = val;
          skipWs();
          if (s[pos] === 's') { pos++; skipMemo(); }
        }
        return obj;
      }
      if (c2 === 'l' || c2 === 't') {
        pos++; skipMemo();
        var arr = [];
        while (pos < len) {
          skipWs();
          if (s[pos] === '.' || s[pos] === ')') break;
          if (s[pos] === 'a') { pos++; continue; }
          if (s[pos] === 's') break;
          var val = parseValue();
          if (val !== undefined) arr.push(val);
        }
        return arr;
      }
      return undefined;
    }

    if (c === 'V' || c === 'S') { pos++; var str = readLine(); skipMemo(); return str; }
    if (c === 'I') { pos++; var line = readLine(); skipMemo(); return line === '00' ? false : line === '01' ? true : parseInt(line, 10); }
    if (c === 'F') { pos++; var line = readLine(); skipMemo(); return parseFloat(line); }
    if (c === 'N') { pos++; readLine(); return null; }

    pos++;
    return undefined;
  }

  return parseValue();
}

function cleanup() {
  if (ctx) {
    try { ctx.f.close(); } catch { /* ignore */ }
    ctx = null;
  }
}
