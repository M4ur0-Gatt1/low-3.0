"""Genera low.ico y low_256.png con el logo de LOW: rayo Bowie partido
(naranja a la izquierda, cyan a la derecha) sobre cuadrado casi negro
redondeado. El rayo usa la MISMA geometría que el header/splash del app.
Uso: python make_icon.py
"""
from PIL import Image, ImageDraw

BG = (11, 11, 12, 255)        # #0B0B0C (fondo del app)
ORANGE = (240, 69, 14, 255)   # naranja del rayo
CYAN = (51, 181, 232, 255)    # cyan del rayo

# rayo en caja 24x24 (idéntico al del SVG del header), apuntando hacia abajo
BOLT_24 = [(13, 2), (4, 14), (10, 14), (8, 22), (20, 9), (13, 9)]
BOLT_MINX, BOLT_MAXX = 4, 20
BOLT_MINY, BOLT_MAXY = 2, 22
BOLT_CX = (BOLT_MINX + BOLT_MAXX) / 2   # línea de división de color


def draw_icon(size):
    ss = 4                                  # supersampling para bordes suaves
    n = size * ss
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # cuadrado redondeado de fondo
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=BG)

    # ubicar el rayo centrado, ocupando ~64% de alto
    scale = (n * 0.64) / (BOLT_MAXY - BOLT_MINY)
    bw = (BOLT_MAXX - BOLT_MINX) * scale
    bh = (BOLT_MAXY - BOLT_MINY) * scale
    ox = (n - bw) / 2 - BOLT_MINX * scale
    oy = (n - bh) / 2 - BOLT_MINY * scale
    pts = [(ox + x * scale, oy + y * scale) for (x, y) in BOLT_24]

    # máscara del rayo, y dos mitades de color (izq naranja / der cyan)
    mask = Image.new("L", (n, n), 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    color = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    split_x = int(ox + BOLT_CX * scale)
    ImageDraw.Draw(color).rectangle([0, 0, split_x, n], fill=ORANGE)
    ImageDraw.Draw(color).rectangle([split_x, 0, n, n], fill=CYAN)
    img.paste(color, (0, 0), mask)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    sizes = [16, 24, 32, 48, 64, 128, 256]
    base = draw_icon(256)
    base.save("low.ico", sizes=[(s, s) for s in sizes],
              append_images=[draw_icon(s) for s in sizes[:-1]])
    base.save("low_256.png")
    print("OK: low.ico y low_256.png generados")
