import os
import shutil
import zipfile

src = r'C:\Users\WINNNEER\Downloads\unified-finance-hub (12).zip'
dst = r'C:\Users\WINNNEER\Documents\coinbase100\paydirect\imported-unified-finance-hub'

if not os.path.exists(src):
    raise SystemExit(f'ARCHIVE_NOT_FOUND: {src}')

os.makedirs(dst, exist_ok=True)

with zipfile.ZipFile(src, 'r') as z:
    names = [n for n in z.namelist() if not n.endswith('/') and not n.startswith('__MACOSX/')]
    if not names:
        raise SystemExit('ZIP_EMPTY')

    root = None
    for name in names:
        if '/' in name:
            root = name.split('/')[0]
            break

    copied = 0
    skipped = 0
    for name in names:
        rel = name
        if root and rel.startswith(root + '/'):
            rel = rel[len(root) + 1:]
        if not rel:
            continue
        target_path = os.path.join(dst, rel)
        if os.path.exists(target_path):
            skipped += 1
            continue
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with z.open(name) as srcf, open(target_path, 'wb') as dstf:
            shutil.copyfileobj(srcf, dstf)
        copied += 1

print(f'COPIED={copied}')
print(f'SKIPPED={skipped}')
