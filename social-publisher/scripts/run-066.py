from pathlib import Path

root = Path(__file__).resolve().parents[1]
upgrade = root / 'scripts' / 'upgrade-066.py'
source = upgrade.read_text()
old = "    2,\n    'Facebook Reel validation'\n)"
new = "    1,\n    'Facebook Reel validation'\n)"
if old not in source:
    raise RuntimeError('Could not adjust Facebook Reel POST validation patch count')
source = source.replace(old, new, 1)
exec(compile(source, str(upgrade), 'exec'), {'__name__':'__main__', '__file__':str(upgrade)})

# PATCH requests use mediaKey/mediaType variables instead of body.mediaKey/body.mediaType,
# so add the equivalent Facebook Reel media validation after the generated upgrade.
worker = root / 'src' / 'index.js'
text = worker.read_text()
needle = "if (body.platforms.includes('instagram_reel') && mediaKey && !mt.startsWith('video/')) return json({ error:'Instagram Reel requires a video.' }, { status:400 });"
replacement = needle + "\n      if (body.platforms.includes('facebook_reel') && mediaKey && !mt.startsWith('video/')) return json({ error:'Facebook Reel requires a video.' }, { status:400 });"
if text.count(needle) != 1:
    raise RuntimeError(f'PATCH Facebook Reel validation target count: {text.count(needle)}')
worker.write_text(text.replace(needle, replacement, 1))
print('v0.6.6 wrapper patch complete')
