/* ══════════════════════════════════════════════════════════════════════════
   PALETA — del registro del color a que el color mande

   `scene-model.js` ya tiene el registro canónico: `Palette` y `Style`, con su
   color, su opacidad y su número. Lo que falta para que eso sirva mientras se
   dibuja es el otro lado del vínculo: **que el trazo referencie al estilo**.

   Sin esa referencia, el color sigue siendo un valor literal pegado adentro de
   cada trazo (`stroke="#F0450E"`), y aclarar la línea de un personaje son
   cuatrocientos trazos repartidos en ciento veinte dibujos, uno por uno.

   Con la referencia, el color vive en un solo lugar: cambiar el estilo 3
   recolorea, de una, todo lo que lo usa — en todos los dibujos, expuestos o
   no. Es la misma separación que sostiene el resto del módulo: `Level`/`Cell`
   separa el dibujo del tiempo, la paleta separa el dibujo del color.

   Dos papeles, como el ink & paint de siempre:

     data-stk="3"   el estilo 3 gobierna la LÍNEA de este elemento
     data-fil="3"   el estilo 3 gobierna el RELLENO de este elemento

   Un elemento puede llevar los dos (contorno con un estilo, relleno con otro).
   El lápiz y la pluma son línea; el pincel de LOW es una cinta rellena.

   Se referencia el NÚMERO del estilo, no su `id`: un uid repetido en cada
   elemento del SVG no se lee ni se escribe a mano, y el número es justamente
   lo que en una paleta se nombra — igual que el número de dibujo en la celda.

   Cómo se aplica el color, y por qué así: el estilo se resuelve con una hoja
   CSS que se inyecta en el SVG (`css()`), no reescribiendo los atributos de
   cada trazo. Dos razones concretas:

     · en CSS, una regla le gana al atributo de presentación del elemento, así
       que el color literal que quedó en el archivo sigue ahí como respaldo —
       el dibujo se abre en cualquier visor aunque no haya paleta;
     · recolorear es cambiar UNA línea de texto, no recorrer el DOM de todos
       los dibujos. Arrastrar el selector de color se ve al instante.

   Este archivo NO toca el DOM: opera sobre los strings de contenido de los
   dibujos. Por eso se puede probar de verdad.

   @module animation/palette
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  /** Atributos que llevan la referencia al estilo. Los nombres son cortos a
   *  propósito: van repetidos en cada trazo de cada dibujo del archivo. */
  const ATTR = { ink: "data-stk", paint: "data-fil" };

  /** Los cinco colores con los que se empieza: línea, rough, relleno, sombra y
   *  luz. No es decoración — aparecen en cualquier plano, y tenerlos numerados
   *  desde el principio es lo que hace que el trabajo entre a la paleta sin que
   *  haya que armarla antes de dibujar. */
  const SEMILLA = [
    ["Línea", "#1a1a1a"], ["Rough", "#f0450e"], ["Relleno", "#ffffff"],
    ["Sombra", "#7a86c4"], ["Luz", "#ffe9a8"],
  ];
  function seed(palette) {
    if (!palette || palette.styles.length) return palette;
    for (const [n, c] of SEMILLA) palette.addStyle(n, c);
    return palette;
  }

  const normColor = (c) => (animation.Style ? animation.Style.normalizeColor(c) : c);
  function hexToRgb(color) {
    const h = normColor(color);
    const m = /^#([0-9a-f]{6})$/i.exec(h);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    const byte = (n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
    return "#" + [byte(r), byte(g), byte(b)].map((n) => n.toString(16).padStart(2, "0")).join("");
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * (((b - r) / d) + 2);
      else h = 60 * (((r - g) / d) + 4);
    }
    if (h < 0) h += 360;
    return { h, s: max ? d / max * 100 : 0, v: max * 100 };
  }
  function hexToHsv(color) {
    const rgb = hexToRgb(color);
    return rgb ? rgbToHsv(rgb.r, rgb.g, rgb.b) : null;
  }
  function hsvToHex(h, s, v) {
    h = ((Number(h) || 0) % 360 + 360) % 360;
    s = Math.max(0, Math.min(100, Number(s) || 0)) / 100;
    v = Math.max(0, Math.min(100, Number(v) || 0)) / 100;
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    let q = [0, 0, 0];
    if (h < 60) q = [c, x, 0]; else if (h < 120) q = [x, c, 0];
    else if (h < 180) q = [0, c, x]; else if (h < 240) q = [0, x, c];
    else if (h < 300) q = [x, 0, c]; else q = [c, 0, x];
    return rgbToHex((q[0] + m) * 255, (q[1] + m) * 255, (q[2] + m) * 255);
  }
  function harmonies(color) {
    const hsv = hexToHsv(color);
    if (!hsv) return [];
    const tone = (name, offset, s = hsv.s, v = hsv.v) =>
      ({ name, color: hsvToHex(hsv.h + offset, s, v) });
    return [tone("Base", 0), tone("Análogo -", -30), tone("Análogo +", 30),
      tone("Complementario", 180), tone("Tríada A", 120), tone("Tríada B", 240)];
  }

  /* ── intercambio de paletas (Adobe / GIMP / Krita) ─────────────────── */
  const _utf16be = (view, offset, chars) => {
    let out = "";
    for (let i = 0; i < chars; i++) { const code = view.getUint16(offset + i * 2, false); if (code) out += String.fromCharCode(code); }
    return out;
  };
  function _exchangeColor(model, values) {
    if (model === "RGB ") return rgbToHex(values[0] * 255, values[1] * 255, values[2] * 255);
    if (model === "Gray") return rgbToHex(values[0] * 255, values[0] * 255, values[0] * 255);
    if (model === "CMYK") {
      const [c,m,y,k] = values; return rgbToHex(255*(1-c)*(1-k),255*(1-m)*(1-k),255*(1-y)*(1-k));
    }
    return null;
  }
  function parseASE(buffer) {
    const view = new DataView(buffer), bytes = new Uint8Array(buffer);
    if (buffer.byteLength < 12 || String.fromCharCode(...bytes.slice(0,4)) !== "ASEF") return [];
    let offset = 12; const count = view.getUint32(8, false), out = [];
    for (let block = 0; block < count && offset + 6 <= view.byteLength; block++) {
      const type = view.getUint16(offset, false), length = view.getUint32(offset + 2, false), end = offset + 6 + length;
      offset += 6; if (end > view.byteLength) break;
      if (type === 1 && offset + 2 <= end) {
        const nameLen = view.getUint16(offset, false); offset += 2;
        const name = _utf16be(view, offset, Math.max(0, nameLen - 1)); offset += nameLen * 2;
        const model = String.fromCharCode(...bytes.slice(offset, offset + 4)); offset += 4;
        const n = model === "CMYK" ? 4 : (model === "Gray" ? 1 : 3), values = [];
        for (let i = 0; i < n && offset + 4 <= end; i++, offset += 4) values.push(view.getFloat32(offset, false));
        const color = _exchangeColor(model, values); if (color) out.push({ name: name || `Adobe ${out.length + 1}`, color });
      }
      offset = end;
    }
    return out;
  }
  function parseACO(buffer) {
    const view = new DataView(buffer), out = []; let offset = 0, block = 0;
    while (offset + 4 <= view.byteLength && block++ < 2) {
      const version = view.getUint16(offset, false), count = view.getUint16(offset + 2, false); offset += 4;
      if (version !== 1 && version !== 2) break;
      const current = [];
      for (let i = 0; i < count && offset + 10 <= view.byteLength; i++) {
        const space=view.getUint16(offset,false), a=view.getUint16(offset+2,false), b=view.getUint16(offset+4,false), c=view.getUint16(offset+6,false), d=view.getUint16(offset+8,false); offset += 10;
        let color = null;
        if (space === 0) color = rgbToHex(a/257,b/257,c/257);
        else if (space === 1) color = hsvToHex(a/65535*360,b/65535*100,c/65535*100);
        else if (space === 2) color = rgbToHex(255*(1-a/65535)*(1-d/65535),255*(1-b/65535)*(1-d/65535),255*(1-c/65535)*(1-d/65535));
        else if (space === 8) color = rgbToHex(a/10000*255,a/10000*255,a/10000*255);
        let name = `Adobe ${i + 1}`;
        if (version === 2 && offset + 4 <= view.byteLength) { const len=view.getUint32(offset,false);offset+=4;name=_utf16be(view,offset,Math.max(0,len-1))||name;offset+=len*2; }
        if (color) current.push({name,color});
      }
      if (version === 2 || !out.length) { out.length = 0; out.push(...current); }
    }
    return out;
  }
  function parseGPL(text) {
    const out=[];
    String(text||"").split(/\r?\n/).forEach((line) => { const m=/^\s*(\d+)\s+(\d+)\s+(\d+)\s*(.*)$/.exec(line); if(m)out.push({name:m[4].trim()||`Color ${out.length+1}`,color:rgbToHex(m[1],m[2],m[3])}); });
    return out;
  }
  function parsePaletteFile(name, buffer) {
    const ext=String(name||"").toLowerCase().split(".").pop();
    if(ext==="ase")return parseASE(buffer); if(ext==="aco")return parseACO(buffer);
    const text=new TextDecoder("utf-8").decode(buffer);
    if(ext==="gpl")return parseGPL(text);
    if(ext==="json"||ext==="lowpalette") { try { const data=JSON.parse(text), list=Array.isArray(data)?data:(data.styles||[]); return list.map((x,i)=>({name:x.name||`Color ${i+1}`,color:normColor(x.color||x)})).filter(x=>/^#[0-9a-f]{6}$/i.test(x.color)); } catch(_){ return []; } }
    return [];
  }
  function exportGPL(palette) {
    const rows=(palette?.styles||[]).map((s)=>{const c=hexToRgb(s.color);return c?`${String(c.r).padStart(3)} ${String(c.g).padStart(3)} ${String(c.b).padStart(3)}\t${s.name||`Estilo ${s.index}`}`:null;}).filter(Boolean);
    return `GIMP Palette\nName: ${palette?.name||"LOW"}\nColumns: 8\n# Exportado por LOW\n${rows.join("\n")}\n`;
  }
  /** ¿Es un color de verdad, o un "none"/vacío? Solo los de verdad se adoptan. */
  function esColor(v) {
    if (!v) return false;
    const s = String(v).trim().toLowerCase();
    return s !== "" && s !== "none" && s !== "transparent" && !s.startsWith("url(");
  }

  /* ── resolución del color ────────────────────────────────────────────── */

  /** Hoja de estilo que hace que la paleta gobierne el color.
   *
   *  `!important` no es pereza: los trazos guardan su color literal como
   *  respaldo para abrirse en cualquier visor, y algunos además llevan estilo
   *  inline. Sin `!important` ganaría el inline y la paleta no haría nada. */
  function css(palette, scope) {
    if (!palette || !palette.styles.length) return "";
    const pre = scope ? scope + " " : "";
    const reglas = [];
    for (const s of palette.styles) {
      if (!s.index) continue;
      reglas.push(`${pre}[${ATTR.ink}="${s.index}"]{stroke:${s.color} !important}`);
      reglas.push(`${pre}[${ATTR.paint}="${s.index}"]{fill:${s.color} !important}`);
      if (s.opacity < 1) {
        reglas.push(`${pre}[${ATTR.ink}="${s.index}"],${pre}[${ATTR.paint}="${s.index}"]` +
                    `{opacity:${s.opacity}}`);
      }
    }
    return reglas.join("\n");
  }

  /* ── lectura de los dibujos (strings, sin DOM) ───────────────────────── */

  /** Recorre las etiquetas de apertura de un fragmento SVG.
   *  Alcanza y sobra para el SVG que escribe LOW, y no arrastra un parser. */
  function _tags(contenido, fn) {
    const re = /<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
    let m;
    while ((m = re.exec(contenido))) fn(m, m[1], m[2] || "");
  }
  function _attr(attrs, nombre) {
    const m = new RegExp(nombre + '\\s*=\\s*"([^"]*)"').exec(attrs);
    return m ? m[1] : null;
  }
  /** Los dibujos de la escena que dependen de una paleta (o todos si no se
   *  pasa ninguna). Un nivel sin `paletteId` no está gobernado por nadie. */
  function _drawingsDe(scene, palette) {
    const out = [];
    for (const lv of scene.levels) {
      if (palette && lv.paletteId !== palette.id) continue;
      for (const d of lv.drawings) out.push(d);
    }
    return out;
  }

  /** Cuántos elementos usan cada estilo, por número:
   *  `{ 3: { ink: 12, paint: 0, total: 12 } }`. Con esto la vista puede avisar
   *  "este estilo lo usan 12 trazos" antes de que alguien lo borre. */
  function usage(scene, palette) {
    const cuenta = {};
    const sumar = (i, papel) => {
      const n = Number(i);
      if (!n) return;
      const c = cuenta[n] || (cuenta[n] = { ink: 0, paint: 0, total: 0 });
      c[papel]++; c.total++;
    };
    for (const d of _drawingsDe(scene, palette)) {
      _tags(d.content || "", (_m, _tag, attrs) => {
        sumar(_attr(attrs, ATTR.ink), "ink");
        sumar(_attr(attrs, ATTR.paint), "paint");
      });
    }
    return cuenta;
  }

  /** Referencias a estilos que ya no están en la paleta. Es el equivalente de
   *  la celda en rojo de OpenToonz: no se corrige solo, se muestra. */
  function orphans(scene, palette) {
    const u = usage(scene, palette);
    return Object.keys(u).map(Number).filter((i) => !palette.byIndex(i)).sort((a, b) => a - b);
  }

  function _swap(contenido, attr, from, to) {
    const re = new RegExp('(' + attr + '\\s*=\\s*")' + Number(from) + '(")', "g");
    return contenido.replace(re, "$1" + Number(to) + "$2");
  }

  /** Pasa todo lo que usaba el estilo `from` a usar `to`. Es lo que se hace
   *  antes de borrar un estilo, y también para unificar dos colores que
   *  terminaron siendo el mismo. Devuelve cuántos elementos cambiaron. */
  function reassign(scene, from, to, palette) {
    if (Number(from) === Number(to)) return 0;
    const antes = usage(scene, palette)[Number(from)];
    if (!antes) return 0;
    for (const d of _drawingsDe(scene, palette)) {
      const c = d.content || "";
      if (!c) continue;
      const nuevo = _swap(_swap(c, ATTR.ink, from, to), ATTR.paint, from, to);
      if (nuevo !== c) d.content = nuevo;
    }
    return antes.total;
  }

  /** ADOPTAR: mete en la paleta lo que se dibujó antes de que la paleta
   *  gobernara. Cada trazo con color literal queda referenciando el estilo de
   *  ese color, creándolo si no estaba. Sin esto la paleta solo manda sobre lo
   *  nuevo y el trabajo viejo queda afuera para siempre.
   *
   *  Devuelve `{ elementos, estilosNuevos }`. No cambia ningún color: el dibujo
   *  se ve idéntico, la diferencia es que ahora se puede recolorear. */
  function adopt(scene, palette) {
    let elementos = 0, estilosNuevos = 0;
    const estiloDe = (color, sugerido) => {
      let s = palette.byColor(color);
      if (!s) {
        // el número va en el nombre: si no, tres colores adoptados se llaman
        // todos "Relleno" y la paleta no se puede leer
        s = palette.addStyle(`${sugerido} ${palette.nextIndex()}`, color);
        estilosNuevos++;
      }
      return s;
    };
    for (const d of _drawingsDe(scene, palette)) {
      const c = d.content || "";
      if (!c) continue;
      const parches = [];        // se aplican al final, para no correr los índices
      _tags(c, (m, tag, attrs) => {
        if (tag === "svg" || tag === "style" || tag === "defs") return;
        const finTag = m.index + m[0].length - (m[3] ? 2 : 1);   // antes de "/>" o ">"
        const añadir = [];
        if (!_attr(attrs, ATTR.ink)) {
          const ink = _attr(attrs, "stroke");
          if (esColor(ink)) añadir.push(`${ATTR.ink}="${estiloDe(ink, "Línea").index}"`);
        }
        if (!_attr(attrs, ATTR.paint)) {
          const paint = _attr(attrs, "fill");
          if (esColor(paint)) añadir.push(`${ATTR.paint}="${estiloDe(paint, "Relleno").index}"`);
        }
        if (añadir.length) { parches.push({ at: finTag, txt: " " + añadir.join(" ") }); elementos++; }
      });
      if (!parches.length) continue;
      let out = c;
      for (let i = parches.length - 1; i >= 0; i--)          // de atrás hacia adelante
        out = out.slice(0, parches[i].at) + parches[i].txt + out.slice(parches[i].at);
      d.content = out;
    }
    return { elementos, estilosNuevos };
  }

  /** Marca un fragmento de contenido con un estilo. Uso interno y de pruebas:
   *  en el lienzo la marca la pone el propio trazo cuando nace. */
  function tag(contenido, index, papel) {
    const attr = papel === "paint" ? ATTR.paint : ATTR.ink;
    let out = contenido;
    const parches = [];
    _tags(contenido, (m, tagName, attrs) => {
      if (tagName === "svg" || tagName === "style") return;
      if (_attr(attrs, attr) != null) {
        parches.push({ from: m.index, len: m[0].length,
                       txt: m[0].replace(new RegExp(attr + '\\s*=\\s*"[^"]*"'), `${attr}="${index}"`) });
      } else {
        parches.push({ from: m.index + m[0].length - (m[3] ? 2 : 1), len: 0,
                       txt: ` ${attr}="${index}"` });
      }
    });
    for (let i = parches.length - 1; i >= 0; i--) {
      const p = parches[i];
      out = out.slice(0, p.from) + p.txt + out.slice(p.from + p.len);
    }
    return out;
  }

  animation.palette = { ATTR, SEMILLA, seed, css, usage, orphans, reassign, adopt, tag, normColor,
    hexToRgb, rgbToHex, rgbToHsv, hexToHsv, hsvToHex, harmonies,
    parseASE, parseACO, parseGPL, parsePaletteFile, exportGPL };
})(window);
