"""
Builds the artwork the lock screen, CarPlay and AirPlay show.

    python scripts/make-nowplaying-art.py

WHY THIS IS NOT THE APP ICON

The home-screen icon is small, cropped by the OS, and never leaves the phone.
Now Playing artwork is none of those things: AirPlay sends it to a television,
where a 512px image is being asked to fill a panel several times that size and
is visibly soft. It also has to be declared at the size it really is -- the
Media Session API picks an entry by its stated `sizes`, so listing one 512px
file six times as 96, 128, 192, 256, 384 and 512 tells the system it has
nothing larger, and it upscales.

The master is 1254px square, so 1024 is the largest honest size; anything
above it would be invention. Two sizes are written, both real, so a phone
does not have to decode a megapixel for a thumbnail.

The palette is quantised because the mark is white on black: a handful of
greys covers every antialiased edge, and it keeps the pair small enough to
sit in the offline precache, where they must be -- artwork that only appears
when the network is up is worse than none.
"""

from PIL import Image
from pathlib import Path

SOURCE = Path.home() / 'Downloads' / 'Al Mauiza Logo.png'
OUT = Path('public')
SIZES = (1024, 512)

src = Image.open(SOURCE).convert('RGB')
if src.width != src.height:
    raise SystemExit(f'expected a square master, got {src.size}')
print(f'master {src.width}x{src.height}')

for size in SIZES:
    if size > src.width:
        raise SystemExit(f'{size} is larger than the master; that would be upscaling')
    art = src.resize((size, size), Image.LANCZOS)
    # Adaptive rather than web-safe: the ramp from white to black is the only
    # thing here, and it is the only thing worth spending colours on.
    art = art.quantize(colors=64, method=Image.MEDIANCUT, dither=Image.NONE)
    path = OUT / f'nowplaying-{size}.png'
    art.save(path, optimize=True)
    print(f'{path} {path.stat().st_size // 1024} KB')
