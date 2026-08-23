"""
Checks every theme parses and stays readable.

A palette is easy to get wrong in ways the eye forgives on the one theme you
happened to be looking at: a typo in a hex value silently drops the
declaration and the token falls back to whatever the previous theme set, and
a muted grey that reads fine on cream can fall under the contrast floor on
parchment. Both are caught here rather than in a screenshot of one theme.

Usage:  python scripts/check-themes.py
"""

import io
import re
import sys

HEX = re.compile(r'^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$')
DECL = re.compile(r'--([a-z0-9-]+)\s*:\s*([^;]+);')
BLOCK = re.compile(r'(\[data-theme=[^{]+|:root)\{([^}]*)\}', re.S)

# text token -> the surfaces it is placed on. WCAG AA wants 4.5:1 for body
# text; 3:1 is allowed for large text, which is what the display tokens are.
PAIRS = [
    ('ink', ['card', 'card-2', 'bg'], 4.5),
    ('ink-strong', ['card', 'card-2', 'bg'], 4.5),
    ('muted', ['card', 'card-2'], 4.5),
    ('ink-soft', ['card'], 4.5),
    ('accent-deep', ['card'], 4.5),
    ('accent', ['card'], 3.0),
    # Both ends of a gradient: the ink has to survive the worse of the two,
    # and which end that is flips between a light and a dark theme.
    # A 22px numeral is large text and the play glyph is a graphical object;
    # WCAG puts both at 3:1. Holding them to body-text contrast forces pure
    # black into palettes that have no need of it.
    ('tile-active-ink', ['tile-active-a', 'tile-active-b'], 3.0),
    ('on-accent', ['accent'], 4.5),
    ('on-play', ['play-a', 'play-b'], 3.0),
    ('ink', ['page'], 4.5),
]


def parse_hex(v):
    v = v.strip()
    if not HEX.match(v):
        return None
    v = v[1:]
    if len(v) == 3:
        v = ''.join(c * 2 for c in v)
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))


def luminance(rgb):
    def chan(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (chan(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def main():
    css = io.open('src/ui/themes.css', encoding='utf-8').read()
    base = io.open('src/ui/theme.css', encoding='utf-8').read()

    # The default palette lives in theme.css; every other theme is a patch
    # over it, so a theme is only complete once merged with the default.
    default = {}
    for name, value in DECL.findall(base[base.index(':root {'):base.index('* {')]):
        c = parse_hex(value)
        if c:
            default[name] = c

    problems = []
    themes = {}
    for selector, body in BLOCK.findall(css):
        if 'data-theme' not in selector:
            continue
        key = selector.strip().rstrip('{').strip()
        palette = dict(default)
        for name, value in DECL.findall(body):
            v = value.strip()
            if v.startswith('#'):
                c = parse_hex(v)
                if c is None:
                    problems.append(f'{key}: --{name} is not a colour: {v!r}')
                else:
                    palette[name] = c
        themes[key] = palette

    if not themes:
        problems.append('no themes found')

    for key, palette in sorted(themes.items()):
        for fg, backgrounds, floor in PAIRS:
            if fg not in palette:
                problems.append(f'{key}: missing --{fg}')
                continue
            for bg in backgrounds:
                if bg not in palette:
                    continue
                ratio = contrast(palette[fg], palette[bg])
                if ratio < floor:
                    problems.append(
                        f'{key}: --{fg} on --{bg} is {ratio:.2f}:1, needs {floor}:1'
                    )

    print(f'{len(themes)} theme blocks checked')
    if problems:
        for p in problems:
            print('  ' + p)
        print(f'{len(problems)} problem(s)')
        return 1
    print('all pass')
    return 0


if __name__ == '__main__':
    sys.exit(main())
