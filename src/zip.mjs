// Minimal zero-dependency ZIP reader (stored + deflate), enough for the AWS icon package.
import zlib from "node:zlib";

export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip file (no end-of-central-directory)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt central directory");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    entries.push({ name, method, csize, off });
    p += 46 + nlen + elen + clen;
  }
  return entries.map((e) => ({
    name: e.name,
    isDir: e.name.endsWith("/"),
    data() {
      const nlen = buf.readUInt16LE(e.off + 26);
      const elen = buf.readUInt16LE(e.off + 28);
      const start = e.off + 30 + nlen + elen;
      const raw = buf.subarray(start, start + e.csize);
      if (e.method === 0) return raw;
      if (e.method === 8) return zlib.inflateRawSync(raw);
      throw new Error(`unsupported zip method ${e.method} for ${e.name}`);
    },
  }));
}
