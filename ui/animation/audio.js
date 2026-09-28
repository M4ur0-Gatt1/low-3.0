/* ══════════════════════════════════════════════════════════════════════════
   AUDIO — la pista de sonido de la escena

   No es un editor de audio: es lo mínimo que un animador necesita para animar
   con sonido, sobre todo para lipsync.

     · la ONDA dibujada frame a frame, para ver dónde caen los golpes;
     · reproducción sincronizada con el playback, arrancando desde el frame
       en el que estás parado;
     · scrub: al arrastrar por la timeline suena el pedacito de audio de ese
       frame, que es como se busca la sílaba exacta;
     · desplazamiento (offset) en frames, para calzar el audio con la acción.

   Los PICOS se calculan una vez por frame y se guardan con la escena: así la
   onda se sigue viendo aunque el archivo de audio no esté disponible, y no hay
   que volver a decodificar al abrir.

   @module animation/audio
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  class AudioTrack {
    constructor(doc) {
      this.doc = doc;
      this.ctx = null;
      this.buffer = null;
      this.fuente = null;
      this.name = "";
      this.offset = 0;        // en FRAMES: negativo adelanta el audio
      this.peaks = [];        // un pico (0..1) por frame
      this.muted = false;
      this.volume = 1;
      this._scrubHasta = 0;
    }

    get duracionFrames() {
      if (!this.buffer || !this.doc) return this.peaks.length;
      return Math.ceil(this.buffer.duration * (this.doc.scene.fps || 24));
    }

    _ctx() {
      if (!this.ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      // los navegadores arrancan el contexto suspendido hasta que hay un gesto
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return this.ctx;
    }

    /** Carga desde un ArrayBuffer (archivo elegido por el usuario). */
    async load(arrayBuffer, nombre) {
      const ctx = this._ctx();
      if (!ctx) throw new Error("Este equipo no permite reproducir audio");
      this.buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      this.name = nombre || "audio";
      this.peaks = this._calcularPicos();
      return this;
    }

    /** Un valor 0..1 por frame: el pico de amplitud de ese tramo. Es lo que se
     *  dibuja, y alcanza para ver dónde están los acentos. */
    _calcularPicos() {
      if (!this.buffer || !this.doc) return [];
      const fps = this.doc.scene.fps || 24;
      const datos = this.buffer.getChannelData(0);
      const porFrame = Math.max(1, Math.floor(this.buffer.sampleRate / fps));
      const n = Math.ceil(datos.length / porFrame);
      const out = new Array(n);
      for (let i = 0; i < n; i++) {
        let max = 0;
        const ini = i * porFrame, fin = Math.min(datos.length, ini + porFrame);
        for (let j = ini; j < fin; j++) {
          const v = datos[j] < 0 ? -datos[j] : datos[j];
          if (v > max) max = v;
        }
        out[i] = max;
      }
      return out;
    }

    /** Pico del frame de la ESCENA (ya con el desplazamiento aplicado). */
    peakAt(frame) {
      const i = Math.round(frame - 1 - this.offset);
      return i >= 0 && i < this.peaks.length ? this.peaks[i] : 0;
    }

    _tiempoDe(frame) {
      const fps = this.doc ? this.doc.scene.fps || 24 : 24;
      return Math.max(0, (frame - 1 - this.offset) / fps);
    }

    /** Arranca el audio desde el frame dado (lo llama el playback). */
    playFrom(frame) {
      this.stop();
      if (!this.buffer || this.muted) return;
      const ctx = this._ctx();
      if (!ctx) return;
      const t = this._tiempoDe(frame);
      if (t >= this.buffer.duration) return;
      const src = ctx.createBufferSource();
      src.buffer = this.buffer;
      const gain = ctx.createGain();
      gain.gain.value = this.volume;
      src.connect(gain).connect(ctx.destination);
      // Con desfase POSITIVO el audio entra más adelante: si se arranca antes
      // de ese cuadro hay que ESPERAR, no sonar desde el principio del archivo
      // (sonaba adelantado). _tiempoDe ya da 0 en ese caso; falta la espera.
      const fps = this.doc ? this.doc.scene.fps || 24 : 24;
      const espera = Math.max(0, (this.offset - (frame - 1)) / fps);
      src.start(ctx.currentTime + espera, t);
      this.fuente = src;
    }

    stop() {
      if (this.fuente) {
        try { this.fuente.stop(); } catch (_) { /* ya había terminado */ }
        this.fuente = null;
      }
    }

    /** SCRUB: suena un pedacito del frame que estás mirando. Es como se busca
     *  una sílaba: se arrastra y se escucha, no se reproduce todo. */
    scrub(frame) {
      if (!this.buffer || this.muted) return;
      if (frame - 1 < this.offset) return;          // antes de que entre el audio: silencio
      const ctx = this._ctx();
      if (!ctx) return;
      const ahora = ctx.currentTime;
      // no encimar recortes: si el anterior sigue sonando, se lo deja terminar
      if (ahora < this._scrubHasta - 0.02) return;
      const t = this._tiempoDe(frame);
      if (t >= this.buffer.duration) return;
      const fps = this.doc ? this.doc.scene.fps || 24 : 24;
      const dur = Math.min(1 / fps + 0.02, this.buffer.duration - t);
      const src = ctx.createBufferSource();
      src.buffer = this.buffer;
      const gain = ctx.createGain();
      gain.gain.value = this.volume;
      // un pequeño desvanecido en la cola: sin esto cada recorte hace "clic"
      gain.gain.setValueAtTime(this.volume, ahora);
      gain.gain.linearRampToValueAtTime(0, ahora + dur);
      src.connect(gain).connect(ctx.destination);
      src.start(0, t, dur);
      this._scrubHasta = ahora + dur;
    }

    setOffset(frames) {
      this.offset = Math.round(frames) || 0;
      if (this.doc) { this.doc.touch(); this.doc.emit("audio"); }
    }
    setMuted(v) { this.muted = !!v; if (this.muted) this.stop(); if (this.doc) this.doc.emit("audio"); }
    setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); if (this.doc) this.doc.emit("audio"); }

    /** Otra pista con transporte PROPIO para otro documento (el animatic): las
     *  muestras decodificadas se comparten, sólo lectura; desfase y volumen no. */
    cloneFor(doc) {
      const track = new AudioTrack(doc).fromJSON(this.toJSON());
      track.buffer = this.buffer;
      return track;
    }

    toJSON() {
      return { name: this.name, offset: this.offset, muted: this.muted,
               volume: this.volume, peaks: this.peaks.map((p) => Math.round(p * 100) / 100) };
    }
    fromJSON(d) {
      if (!d) return this;
      this.name = d.name || "";
      this.offset = Number(d.offset) || 0;
      this.muted = !!d.muted;
      this.volume = d.volume == null ? 1 : Number(d.volume);
      this.peaks = Array.isArray(d.peaks) ? d.peaks.slice() : [];
      return this;
    }
  }

  animation.AudioTrack = AudioTrack;
})(window);
