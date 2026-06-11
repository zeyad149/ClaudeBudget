#!/usr/bin/env python3
"""Generate PWA / iOS app icons with no external dependencies.

Draws a simple, recognizable "budget bar-chart" icon on an indigo->teal
gradient and writes PNGs at the sizes a PWA + iOS home screen need.
"""
import struct
import zlib
import os

# Brand colors (R, G, B)
TOP = (79, 70, 229)      # indigo-600
BOTTOM = (13, 148, 136)  # teal-600
BAR = (255, 255, 255)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_icon(size):
    # RGBA framebuffer
    px = bytearray(size * size * 4)

    def put(x, y, r, g, b, a=255):
        if 0 <= x < size and 0 <= y < size:
            i = (y * size + x) * 4
            # simple alpha-over onto existing pixel
            ba = px[i + 3]
            if ba == 0 or a == 255:
                px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a
            else:
                af = a / 255.0
                px[i] = round(r * af + px[i] * (1 - af))
                px[i + 1] = round(g * af + px[i + 1] * (1 - af))
                px[i + 2] = round(b * af + px[i + 2] * (1 - af))
                px[i + 3] = 255

    # Background gradient (full bleed; iOS masks the corners itself)
    for y in range(size):
        t = y / (size - 1)
        r, g, b = lerp(TOP, BOTTOM, t)
        for x in range(size):
            i = (y * size + x) * 4
            px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255

    # Bar chart: 4 ascending bars centered in a safe zone
    margin = size * 0.20
    inner = size - 2 * margin
    n = 4
    gap = inner * 0.07
    bw = (inner - gap * (n - 1)) / n
    heights = [0.30, 0.50, 0.72, 0.95]
    base_y = size - margin
    for k in range(n):
        bx = margin + k * (bw + gap)
        bh = inner * heights[k]
        top_y = base_y - bh
        for y in range(int(top_y), int(base_y)):
            for x in range(int(bx), int(bx + bw)):
                put(x, y, *BAR, a=235)

    return bytes(px)


def write_png(path, size):
    raw = make_icon(size)
    # add filter byte (0) at start of each scanline
    stride = size * 4
    out = bytearray()
    for y in range(size):
        out.append(0)
        out += raw[y * stride:(y + 1) * stride]
    compressed = zlib.compress(bytes(out), 9)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        crc = zlib.crc32(tag + data) & 0xffffffff
        return c + struct.pack(">I", crc)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path, size)


if __name__ == "__main__":
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons = os.path.join(here, "icons")
    os.makedirs(icons, exist_ok=True)
    write_png(os.path.join(icons, "icon-192.png"), 192)
    write_png(os.path.join(icons, "icon-512.png"), 512)
    write_png(os.path.join(icons, "apple-touch-icon.png"), 180)
