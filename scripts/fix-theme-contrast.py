"""
Nudges theme text colours until they meet the contrast floor.

Hand-tuning twenty near-misses across seven palettes is exactly the work a
machine should do: hue and saturation are the design decision and stay
untouched, lightness is the part that has to satisfy a number. Run
check-themes.py afterwards to confirm.

Usage:  python scripts/fix-theme-contrast.py
"""
import colorsys
import io
import re
import sys

sys.path.insert(0, 'scripts')
from importlib import import_module

check = import_module('check-themes'.replace('-', '_')) if False else None

HEX = re.compile(r'^#(?:[0-9a-fA-F]{6})$')
DECL = re.compile(r'--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;')
BLOCK = re.compile(r"(\[data-theme=[^{]*)\{([^}]*)\}", re.S)

PAIRS = [
    ('ink', ['card', 'card-2', 'bg', 'page'], 4.5),
    ('ink-strong', ['card', 'card-2', 'bg'], 4.5),
    ('muted', ['card', 'card-2'], 4.5),
    ('ink-soft', ['card'], 4.5),
    ('accent-deep', ['card'], 4.5),
    ('accent', ['card'], 3.0),
    # A 22px numeral is large text and the play glyph is a graphical object;
    # WCAG puts both at 3:1. Holding them to body-text contrast forces pure
    # black into palettes that have no need of it.
    ('tile-active-ink', ['tile-active-a', 'tile-active-b'], 3.0),
    ('on-accent', ['accent'], 4.5),
    ('on-play', ['play-a', 'play-b'], 3.0),
]


def to_rgb(v):
    v = v.lstrip('#')
    if len(v) == 3:
        v = ''.join(c * 2 for c in v)
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))


def to_hex(rgb):
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(c))) for c in rgb)


def lum(rgb):
    def ch(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def nudge(fg, backgrounds, floor):
    """Move lightness away from the backgrounds until every pair passes."""
    worst = min(backgrounds, key=lambda b: ratio(fg, b))
    darker = lum(fg) < lum(worst)
    h, l, s = colorsys.rgb_to_hls(*[c / 255 for c in fg])
    best = fg
    for _ in range(220):
        if all(ratio(best, b) >= floor for b in backgrounds):
            return best
        l = max(0.0, min(1.0, l + (-0.004 if darker else 0.004)))
        best = tuple(c * 255 for c in colorsys.hls_to_rgb(h, l, s))
    return best


def main():
    path = 'src/ui/themes.css'
    css = io.open(path, encoding='utf-8').read()
    base = io.open('src/ui/theme.css', encoding='utf-8').read()
    default = {n: to_rgb(v) for n, v in DECL.findall(base[base.index(':root {'):base.index('* {')])}

    changes = 0
    out = css
    for selector, body in BLOCK.findall(css):
        palette = dict(default)
        palette.update({n: to_rgb(v) for n, v in DECL.findall(body)})
        new_body = body
        for fg, bgs, floor in PAIRS:
            if fg not in palette:
                continue
            grounds = [palette[b] for b in bgs if b in palette]
            if not grounds or all(ratio(palette[fg], g) >= floor for g in grounds):
                continue
            fixed = nudge(palette[fg], grounds, floor)
            old_decl = f'--{fg}: {to_hex(palette[fg])};'
            if old_decl not in new_body:
                # Inherited from the default palette: state it explicitly here.
                new_body = new_body.rstrip() + f'\n  --{fg}: {to_hex(fixed)};\n'
            else:
                new_body = new_body.replace(old_decl, f'--{fg}: {to_hex(fixed)};', 1)
            palette[fg] = fixed
            changes += 1
        if new_body != body:
            out = out.replace(selector + '{' + body + '}', selector + '{' + new_body + '}', 1)

    io.open(path, 'w', encoding='utf-8', newline='\n').write(out)
    print(f'adjusted {changes} colour(s)')


main()
