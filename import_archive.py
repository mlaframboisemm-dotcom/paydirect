import os
import shutil
import zipfile

src = r'C:\Users\WINNNEER\Downloads\Rebuild My App from GitHub Repository (2).zip'
dst = r'C:\Users\WINNNEER\Documents\coinbase100\paydirect'

if not os.path.exists(src):
    raise SystemExit('ARCHIVE_NOT_FOUND')

with zipfile.ZipFile(src, 'r') as z:
    entries = [n for n in z.namelist() if not n.endswith('/') and not n.startswith('__MACOSX/')]
    copied = 0
    skipped = 0
    for name in entries:
        rel = name
        if '/' in rel:
            parts = rel.split('/', 1)
            rel = parts[1] if len(parts) > 1 else ''
        if not rel:
            continue
        target = os.path.join(dst, rel)
        if os.path.exists(target):
            skipped += 1
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with z.open(name) as srcf, open(target, 'wb') as dstf:
            shutil.copyfileobj(srcf, dstf)
        copied += 1

print(f'COPIED={copied}')
print(f'SKIPPED={skipped}')
