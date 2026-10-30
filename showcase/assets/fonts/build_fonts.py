# -*- coding: utf-8 -*-
"""Rebuild self-hosted fonts; requires fontTools and Node's built-in Brotli.

This is an optional build tool. The website itself needs no Python or Node.
Sources: Google Fonts official distribution and google/fonts repository.
"""
import argparse, hashlib, json, pathlib, re, subprocess, sys, tempfile, urllib.request
from datetime import datetime, timezone

ap = argparse.ArgumentParser()
ap.add_argument('--node', required=True)
ap.add_argument('--fonttools-path')
ap.add_argument('--cache')
args = ap.parse_args()
if args.fonttools_path:
    sys.path.insert(0, args.fonttools_path)
from fontTools import subset, __version__ as fonttools_version
from fontTools.ttLib import TTFont
from fontTools.ttLib import woff2
from fontTools.varLib.instancer import instantiateVariableFont

HERE = pathlib.Path(__file__).resolve().parent
SITE = HERE.parent.parent
CACHE = pathlib.Path(args.cache or (pathlib.Path(tempfile.gettempdir()) / 'guangyin-font-source'))
CACHE.mkdir(parents=True, exist_ok=True)
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
previous = json.loads((HERE / 'provenance.json').read_text(encoding='utf-8')) if (HERE / 'provenance.json').exists() else {}
verified_cache = {f['source']: f for f in previous.get('fonts', []) + previous.get('licenses', []) if not f.get('modified', False)}
def get(url):
    old = verified_cache.get(url)
    if old and (HERE / old['file']).exists():
        data = (HERE / old['file']).read_bytes()
        if hashlib.sha256(data).hexdigest() == old['sha256']:
            return data
    if url.startswith('https://fonts.googleapis.com/css2?family=Roboto:') and (CACHE / 'roboto-official.css').exists():
        return (CACHE / 'roboto-official.css').read_bytes()
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()
def sha(data):
    return hashlib.sha256(data).hexdigest()

class NodeBrotli:
    MODE_FONT = 2
    MODE_TEXT = 1
    @staticmethod
    def compress(data, mode=2):
        code = "const z=require('zlib'),f=require('fs');process.stdout.write(z.brotliCompressSync(f.readFileSync(0),{params:{[z.constants.BROTLI_PARAM_MODE]:Number(process.argv[1]),[z.constants.BROTLI_PARAM_QUALITY]:11}}));"
        return subprocess.run([args.node, '-e', code, str(mode)], input=data, capture_output=True, check=True).stdout
    @staticmethod
    def decompress(data):
        return subprocess.run([args.node, '-e', "process.stdout.write(require('zlib').brotliDecompressSync(require('fs').readFileSync(0)));"], input=data, capture_output=True, check=True).stdout
woff2.brotli = NodeBrotli
woff2.haveBrotli = True

record = {'generated_at': datetime.now(timezone.utc).isoformat(), 'official_guidance': [
    'https://m1.material.io/style/typography.html',
    'https://github.com/material-components/material-web/blob/main/docs/theming/typography.md'],
    'fonttools_version': fonttools_version, 'fonts': [], 'licenses': []}
face_css = []

# Keep Google's Latin/Greek font binaries unmodified, with exact unicode ranges.
css_url = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400..700&display=swap'
roboto_css = get(css_url).decode('utf-8')
(CACHE / 'roboto-official.css').write_text(roboto_css, encoding='utf-8')
for match in re.finditer(r'/\*\s*([^*]+?)\s*\*/\s*(@font-face\s*\{.*?\})', roboto_css, re.S):
    label, rule = match.groups()
    if label not in ['latin', 'latin-ext', 'greek', 'greek-ext']:
        continue
    url = re.search(r'url\(([^)]+)\)', rule).group(1)
    data = get(url)
    assert data[:4] == b'wOF2'
    name = 'roboto-' + label + '-400-700.woff2'
    (HERE / name).write_bytes(data)
    rule = rule.replace(url, './' + name)
    face_css.append('/* Roboto: ' + label + ' */\n' + rule)
    record['fonts'].append({'file': name, 'source': url, 'css_source': css_url, 'sha256': sha(data), 'bytes': len(data), 'modified': False})

# Include all GB2312 characters and the current website's non-Latin text.
# Rare/unrepresented characters use the system sans-serif fallback.
characters = set()
for a in range(0xA1, 0xF8):
    for b in range(0xA1, 0xFF):
        try:
            characters.update(bytes([a, b]).decode('gb2312'))
        except UnicodeDecodeError:
            pass
for p in [SITE / 'index.html', *sorted((SITE / 'assets').glob('*.js'))]:
    characters.update(ch for ch in p.read_text(encoding='utf-8') if ord(ch) >= 0x100)
characters.update(chr(n) for n in range(0x3000, 0x3040))
font_url = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf'
expected_git_blob = 'fb0637bafbcd804fe32152370a1225990745b4bc'
source_path = CACHE / 'NotoSansSC-source.ttf'
if not source_path.exists():
    source_path.write_bytes(get(font_url))
raw = source_path.read_bytes()
git_blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
assert git_blob == expected_git_blob, 'Upstream font changed; re-review source before rebuilding.'
font = TTFont(source_path)
source_cmap = font.getBestCmap()
wanted = {ord(ch) for ch in characters}
actual = sorted(wanted & set(source_cmap))
options = subset.Options()
options.name_IDs = ['*']
options.name_languages = ['*']
options.recalc_timestamp = False
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=actual)
subsetter.subset(font)
instantiateVariableFont(font, {'wght': (400, 700)}, inplace=True)
# Rename this derived subset; do not distribute a modified font under a reserved name.
for n in font['name'].names:
    replacements = {1: 'Guangyin Sans SC', 16: 'Guangyin Sans SC', 4: 'Guangyin Sans SC Regular', 6: 'GuangyinSansSC-Regular', 3: 'GuangyinSC-subset-20261030', 25: 'GuangyinSansSC'}
    if n.nameID in replacements:
        n.string = replacements[n.nameID].encode(n.getEncoding(), errors='replace')
instance_ps_ids = {i.postscriptNameID for i in font['fvar'].instances if i.postscriptNameID != 0xFFFF}
for n in font['name'].names:
    if n.nameID in instance_ps_ids:
        n.string = n.toUnicode().replace('NotoSansSC', 'GuangyinSansSC').encode(n.getEncoding(), errors='replace')
font.recalcTimestamp = False
font.flavor = 'woff2'
target = HERE / 'guangyin-sans-sc-common-400-700.woff2'
font.save(target)
check = TTFont(target)
assert set(actual).issubset(check.getBestCmap())
assert check['fvar'].axes[0].minValue == 400
assert check['fvar'].axes[0].maxValue == 700
data = target.read_bytes()
record['fonts'].append({'file': target.name, 'source': font_url, 'source_git_blob': git_blob, 'source_sha256': sha(raw), 'sha256': sha(data), 'bytes': len(data), 'modified': True, 'derived_family': 'Guangyin Sans SC', 'upstream_family': 'Noto Sans SC', 'glyph_unicode_count': len(actual), 'weight_axis': [400, 700], 'subset_policy': 'GB2312 + current website text + CJK punctuation; unrepresented input uses system sans-serif fallback', 'missing_requested_unicode': [hex(c) for c in sorted(wanted-set(actual))]})
face_css.append("@font-face {\n  font-family: 'Guangyin Sans SC';\n  font-style: normal;\n  font-weight: 400 700;\n  font-display: swap;\n  src: url('./" + target.name + "') format('woff2');\n}")

for family in ['roboto', 'notosanssc']:
    url = 'https://raw.githubusercontent.com/google/fonts/main/ofl/' + family + '/OFL.txt'
    data = get(url)
    target = HERE / (family + '-OFL.txt')
    target.write_bytes(data)
    record['licenses'].append({'file': target.name, 'source': url, 'sha256': sha(data)})
(HERE / 'provenance.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
(HERE / 'font-faces.css').write_text('\n\n'.join(face_css) + '\n', encoding='utf-8')
print(json.dumps({'files': len(record['fonts']), 'bytes': sum(f['bytes'] for f in record['fonts']), 'cjk_unicode_count': len(actual), 'status': 'PASS'}, ensure_ascii=False))
