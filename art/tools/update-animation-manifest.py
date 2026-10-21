"""refresh runtime dimensions and provenance hashes after sheet exports."""
from pathlib import Path
import hashlib
import json
import struct

root = Path(__file__).resolve().parents[2]
catalog = {}
manifest_path = root / 'art/manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
entries = {entry['runtime']: entry for entry in manifest['assets']}
for sheet in sorted((root / 'assets/avatar/animations').glob('*.png')):
    width, height = struct.unpack('>II', sheet.read_bytes()[16:24])
    assert width % 8 == 0 and height % 12 == 0, sheet
    catalog[sheet.name] = {'width': width // 8, 'height': height // 12}
    source = root / 'art/source/avatar/animated' / (sheet.stem + '.aseprite')
    runtime = sheet.relative_to(root).as_posix()
    entries[runtime] = {
        'original': 'assets/avatar/' + sheet.name,
        'runtime': runtime,
        'source': source.relative_to(root).as_posix(),
        'sha256': hashlib.sha256(sheet.read_bytes()).hexdigest(),
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    }
manifest['assets'] = list(entries.values())
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
(root / 'assets/avatar/animations/manifest.json').write_text(json.dumps(catalog, indent=2) + '\n', encoding='utf-8')
print(f'Updated dimensions and SHA-256 provenance for {len(catalog)} animated parts.')
