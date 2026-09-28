/* ══════════════════════════════════════════════════════════════════════════
   REPRODUCCIÓN

   Reproduce sobre el modelo: avanza el frame del documento y deja que la vista
   muestre el dibujo que corresponda. No precarga archivos ni arma una lista de
   imágenes — con holds, la misma imagen se repite sola porque la celda apunta
   al mismo dibujo.

   Mantiene el FPS pedido con reloj real: se calcula qué frame TOCA según el
   tiempo transcurrido en vez de sumar de a uno por cada vuelta. Si la máquina
   no llega, saltea frames en lugar de reproducir en cámara lenta — que es lo
   que uno necesita para juzgar timing.

   @module animation/playback
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  class Playback {
    constructor(doc) {
      this.doc = doc;
      this.playing = false;
      this.loop = true;
      this.raf = 0;
      this.t0 = 0;
      this.frame0 = 1;
      this.listeners = new Set();
      this.medidoFps = 0;
      this._marcas = [];
    }
    setDoc(doc) { this.stop(); this.doc = doc; }
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    _emit() { this.listeners.forEach((fn) => { try { fn(this); } catch (_) { /* noop */ } }); }

    /** Rango a reproducir: el de la escena, o todo lo que haya. */
    range() {
      const r = this.doc ? this.doc.scene.playRange() : { in: 1, out: 1 };
      return { in: r.in, out: Math.max(r.in, r.out) };
    }

    play() {
      if (!this.doc || this.playing) return;
      const { in: ini, out } = this.range();
      if (out <= ini) return;
      this.playing = true;
      // si está parado al final, arranca de nuevo desde el principio
      this.frame0 = this.doc.frame >= out ? ini : this.doc.frame;
      this.t0 = (global.performance || Date).now();
      this._marcas = [];
      // el audio arranca desde el MISMO frame: si no, cada vez que pausás y
      // seguís, la imagen y el sonido quedan corridos
      if (this.audio) this.audio.playFrom(this.frame0);
      this._emit();
      const paso = () => {
        if (!this.playing) return;
        const ahora = (global.performance || Date).now();
        const fps = Math.max(1, this.doc.scene.fps || 24);
        const { in: a, out: z } = this.range();
        const total = z - a + 1;
        // frame por RELOJ: si la máquina se atrasa se saltean frames y el
        // timing sigue siendo el real, que es lo que se está juzgando
        const avance = Math.floor(((ahora - this.t0) / 1000) * fps);
        let f = this.frame0 + avance;
        if (f > z) {
          if (!this.loop) { this.stop(); this.doc.goTo(z); return; }
          f = a + ((f - a) % total);
          // al dar la vuelta hay que reanclar el reloj Y el audio, si no el
          // sonido sigue de largo mientras la imagen volvió al principio
          this.frame0 = f;
          this.t0 = ahora;
          if (this.audio) this.audio.playFrom(f);
        }
        if (f !== this.doc.frame) {
          this.doc.goTo(f);
          // fps real medido con las últimas vueltas
          this._marcas.push(ahora);
          if (this._marcas.length > 12) this._marcas.shift();
          if (this._marcas.length > 1) {
            const span = this._marcas[this._marcas.length - 1] - this._marcas[0];
            this.medidoFps = span > 0 ? Math.round(((this._marcas.length - 1) * 1000) / span) : 0;
          }
        }
        // Al RITMO DEL CUADRO, no a 60 Hz. requestAnimationFrame despierta 60
        // veces por segundo (desperdicio a 12 o 24 fps) y además se PAUSA
        // cuando la ventana no está visible: con la timeline en el otro
        // monitor, la reproducción se congelaba. El frame se sigue calculando
        // por reloj real, así que el timing no deriva.
        const espera = Math.max(4, 1000 / Math.max(1, this.doc.scene.fps || 24));
        this.raf = global.setTimeout(paso, espera);
      };
      this.raf = global.setTimeout(paso, 0);
    }

    stop() {
      if (!this.playing) return;
      this.playing = false;
      if (this.audio) this.audio.stop();
      if (this.raf) global.clearTimeout(this.raf);
      this.raf = 0;
      this.medidoFps = 0;
      this._emit();
    }
    toggle() { if (this.playing) this.stop(); else this.play(); }

    /** Ir al frame anterior/siguiente. */
    step(d) { if (this.doc) { this.stop(); this.doc.step(d); } }
    /** Ir al dibujo anterior/siguiente, salteando holds. */
    stepDrawing(d) { if (this.doc) { this.stop(); this.doc.stepDrawing(d); } }
    first() { if (this.doc) { this.stop(); this.doc.goTo(this.range().in); } }
    last() { if (this.doc) { this.stop(); this.doc.goTo(this.range().out); } }
    setLoop(v) { this.loop = !!v; this._emit(); }
    setFps(v) {
      if (!this.doc) return;
      this.doc.scene.fps = Math.max(1, Math.min(120, Math.round(v) || 24));
      this.doc.touch();
      // reanclar el reloj para que el cambio se sienta ya mismo
      if (this.playing) { this.frame0 = this.doc.frame; this.t0 = (global.performance || Date).now(); }
      this._emit();
    }
    setRange(a, z) {
      if (!this.doc) return;
      this.doc.scene.range = { in: Math.max(1, a || 1), out: Math.max(0, z || 0) };
      this.doc.touch();
      this._emit();
    }
  }

  animation.Playback = Playback;
})(window);
