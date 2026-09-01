from pathlib import Path
import base64
import gzip
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: build-rc19.py <dst>')

root = Path(__file__).resolve().parents[1]
parts_dir = root / 'payloads' / 'rc19'
parts = sorted(parts_dir.glob('public-rc19.user.js.gz.b64.part*'))
expected = [f'public-rc19.user.js.gz.b64.part{i:02d}' for i in range(5)]
if [p.name for p in parts] != expected:
    raise SystemExit('RC19 payload parts missing or unexpected')

encoded = ''.join(p.read_text(encoding='utf-8').strip() for p in parts)
try:
    compressed = base64.b64decode(encoded, validate=True)
    data = gzip.decompress(compressed)
except Exception as exc:
    raise SystemExit(f'RC19 payload decode failed: {exc}')

out = Path(sys.argv[1])
out.write_bytes(data)
print(f'RC19 rebuilt: {len(data)} bytes -> {out}')
