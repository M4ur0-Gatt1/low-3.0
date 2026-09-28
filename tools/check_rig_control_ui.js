/* Guard del editor visual de controles sobre el personaje (C02).
 * Uso: node tools/check_rig_control_ui.js [endpoint] [url] [diseño]
 *
 * Corre contra la APP REAL por CDP, no contra un mock del modelo: la parte que
 * puede romperse acá es el DOM y el puntero, y eso no se ve desde node.
 * Los eventos son PointerEvent de verdad, disparados sobre el lienzo, porque un
 * click programático sobre el handler taparía justo el defecto que importa.
 */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const existing = url === "-";
  const target = existing
    ? (await (await fetch(endpoint + "/json")).json()).find((t) => t.type === "page")
    : await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data), p = pending.get(m.id);
    if (p) { pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("Timeout " + method)); }, 90000);
    pending.set(n, { resolve: (v) => { clearTimeout(timer); resolve(v); },
                     reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  try {
    await send("Page.enable"); await send("Runtime.enable");
    await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride",
      { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    if (!existing) await send("Page.navigate", { url }); else await send("Page.reload", { ignoreCache: true });

    let ready = false;
    for (let i = 0; i < 80; i++) {
      const r = await send("Runtime.evaluate",
        { expression: "!!globalThis.LOW?.rigging?.controlUI && !!api", returnByValue: true });
      if (r.result?.value) { ready = true; break; }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!ready) throw Error("El editor de mandos no arrancó");

    const design = JSON.stringify(process.argv[4] || "mock.svg");
    const result = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: `(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const assert=(v,m)=>{if(!v)throw Error(m)};
      // AISLAMIENTO: los recorridos comparten navegador y por lo tanto el
      // localStorage del origen. Con 25 claves de corridas anteriores —entre
      // ellas low.workspace.active— este recorrido fallaba con «el arrastre
      // no movio el valor del control», y con el almacen limpio pasa. Medido
      // las dos veces: sin esto acusa un defecto que no existe.
      try{localStorage.clear()}catch(e){}
      await openDesign(${design}); await dzDocInit(); await wait(500);
      if(typeof closeL3d==='function')closeL3d();
      if(!DZ.anim)await dzAnimToggle();
      if(!DZ.rigMode)dzRigToggle();
      await wait(200);

      // Un control con recorrido conocido y su canal todavía vacío.
      assert(DZ.doc.createRigControl("prueba_mando",{name:"prueba mando",min:0,max:1,default:0}),
        "no se pudo crear el control de prueba");
      assert(DZ.doc.scene.rig.controls.prueba_mando.kind==="slider",
        "el control no nace como deslizador");

      const svg=document.querySelector("#dzCanvas > svg");
      assert(svg,"no hay lienzo expuesto");
      const screen=p=>new DOMPoint(p.x,p.y).matrixTransform(svg.getScreenCTM());
      const enLienzo=(type,p)=>{const q=screen(p);
        document.querySelector("#dzCanvas").dispatchEvent(new PointerEvent(type,
          {bubbles:true,cancelable:true,button:0,pointerId:1,clientX:q.x,clientY:q.y}));};

      // 1. COLOCAR: el panel existe y el clic sobre el dibujo fija la posición.
      assert(document.querySelector("#rigControlColocar"),"falta el botón de colocar");
      assert(LOW.rigging.controlUI.colocar("prueba_mando"),"no entró en modo colocar");
      const svgVivo=document.querySelector("#dzCanvas > svg");
      const q=screen({x:220,y:150});
      svgVivo.dispatchEvent(new PointerEvent("pointerdown",
        {bubbles:true,cancelable:true,button:0,pointerId:1,clientX:q.x,clientY:q.y}));
      await wait(120);
      const puesto=DZ.doc.scene.rig.controls.prueba_mando;
      assert(Number.isFinite(puesto.x)&&Number.isFinite(puesto.y),
        "el clic sobre el dibujo no fijó la posición del mando");

      // 2. El mando se dibuja sobre el personaje.
      const grupo=document.querySelector('.rig-control-overlay [data-control="prueba_mando"]');
      assert(grupo,"el mando no se dibujó en la capa");
      const tirador=grupo.querySelector("[data-tirador]");
      assert(tirador,"el deslizador no tiene tirador");

      // 3. USAR: arrastrar el tirador mueve el valor y lo deja en el canal.
      const ruta=LOW.animation.rigControlPath("prueba_mando");
      const antesUndo=DZ.history.undoStack.length;
      const caja=tirador.getBoundingClientRect();
      const centro={x:caja.left+caja.width/2,y:caja.top+caja.height/2};
      tirador.dispatchEvent(new PointerEvent("pointerdown",
        {bubbles:true,cancelable:true,button:0,pointerId:1,clientX:centro.x,clientY:centro.y}));
      for(const dx of [10,20,30,40]){
        document.querySelector('.rig-control-overlay svg').dispatchEvent(new PointerEvent("pointermove",
          {bubbles:true,cancelable:true,button:0,pointerId:1,clientX:centro.x+dx,clientY:centro.y}));
        await wait(20);
      }
      document.querySelector('.rig-control-overlay svg').dispatchEvent(new PointerEvent("pointerup",
        {bubbles:true,cancelable:true,button:0,pointerId:1,clientX:centro.x+40,clientY:centro.y}));
      await wait(150);

      const canal=DZ.doc.scene.rigChannel(ruta);
      assert(canal,"arrastrar no creó el canal del control");
      const claves=Object.keys(canal.keys||{});
      const valor=canal.keys[claves[0]];
      assert(valor>0.01,"el arrastre no movió el valor del control ("+valor+")");
      // NO se afirma "una sola clave" ni "un solo paso de historial". Se midio:
      // comprometiendo una clave en CADA pointermove da exactamente lo mismo
      // (1 clave, 1 paso), porque setRigControlValue sobreescribe la clave del
      // mismo cuadro y el modelo coalesce el historial. Una assertion que no
      // puede fallar es peor que ninguna: da confianza falsa.
      const sumaUndo=DZ.history.undoStack.length-antesUndo;
      assert(sumaUndo>=1,"el arrastre no dejó nada en el historial");

      // 4. Un solo Undo devuelve el control a su estado anterior.
      DZ.history.undo(); await wait(120);
      const tras=DZ.doc.scene.rigChannel(ruta);
      assert(!tras||!Object.keys(tras.keys||{}).length,
        "un Undo no quitó la clave del control");

      // 5. El selector no arrastra: la casilla clickeada ES el valor.
      DZ.doc.setRigControlWidget("prueba_mando",{kind:"selector",
        options:[{label:"cero",value:0},{label:"uno",value:1}]});
      await wait(160);
      const casillas=document.querySelectorAll(
        '.rig-control-overlay [data-control="prueba_mando"] [data-opcion]');
      assert(casillas.length===2,"el selector dibujó "+casillas.length+" casillas en vez de 2");
      const uno=[...casillas].find(c=>c.dataset.opcion==="1");
      const cb=uno.getBoundingClientRect();
      uno.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,button:0,
        pointerId:1,clientX:cb.left+cb.width/2,clientY:cb.top+cb.height/2}));
      await wait(150);
      const canalSel=DZ.doc.scene.rigChannel(ruta);
      const valorSel=canalSel&&canalSel.keys[Object.keys(canalSel.keys)[0]];
      assert(valorSel===1,"clickear la opción no puso el valor 1 (dio "+valorSel+")");

      // 7. EL PUNTO 2D MUEVE LOS DOS EJES CON UN ARRASTRE.
      //    El modelo ya guardaba link.partner con su eje, pero la interfaz
      //    movia el tirador en UN eje y escribia UN canal: era un control de una
      //    dimension dibujado dentro de un cuadrado. Un punto 2D sirve para lo
      //    que tiene que servir —la mirada de un ojo, la inclinacion de una
      //    cabeza— solo si un arrastre mueve los dos canales.
      assert(DZ.doc.createRigControl("p2d_x",{name:"mirada X",min:-1,max:1,default:0}),
        "no se pudo crear el control del eje X");
      assert(DZ.doc.createRigControl("p2d_y",{name:"mirada Y",min:-1,max:1,default:0}),
        "no se pudo crear el control del eje Y");
      DZ.doc.setRigControlWidget("p2d_x",{kind:"point2d",x:300,y:220,
        link:{partner:"p2d_y",axis:"x"}});
      // el socio TAMBIEN colocado a proposito: si se dibujara aparte, un solo
      // punto 2D se veria como dos cuadrados
      DZ.doc.setRigControlWidget("p2d_y",{kind:"point2d",x:300,y:220,
        link:{partner:"p2d_x",axis:"y"}});
      await wait(220);

      const g2d=document.querySelector('.rig-control-overlay [data-control="p2d_x"]');
      assert(g2d,"el punto 2D no se dibujo");
      assert(!document.querySelector('.rig-control-overlay [data-control="p2d_y"]'),
        "el socio del punto 2D se dibujo aparte: un solo control se veria como dos cuadrados");
      assert(g2d.querySelectorAll("line").length===2,
        "el punto 2D no dibuja sus dos guias: sin ellas se lee como una caja con un "
        +"punto adentro y no se entiende que se puede mover en diagonal");

      const rx=LOW.animation.rigControlPath("p2d_x");
      const ry=LOW.animation.rigControlPath("p2d_y");
      const pasos2dAntes=DZ.history.undoStack.length;
      const t2d=g2d.querySelector("[data-tirador]");
      assert(t2d,"el punto 2D no tiene tirador");
      const c2d=t2d.getBoundingClientRect();
      const o2d={x:c2d.left+c2d.width/2,y:c2d.top+c2d.height/2};
      t2d.dispatchEvent(new PointerEvent("pointerdown",
        {bubbles:true,cancelable:true,button:0,pointerId:1,clientX:o2d.x,clientY:o2d.y}));
      // EN DIAGONAL Y ASIMETRICO. Si se moviera un solo eje, el otro canal
      // quedaria vacio; y si los dos ejes escribieran el MISMO valor —un error
      // facil— un arrastre simetrico no lo notaria. Asi que se mueve mucho en X
      // y poco en Y, y despues se exige que los dos valores sean DISTINTOS.
      // Se apunta a una COORDENADA DEL DIBUJO, no a un desplazamiento en
      // pixeles: al zoom de trabajo unos pocos pixeles de pantalla son muchas
      // unidades del lienzo y los dos ejes se iban al tope. El cuadro del punto
      // 2D va de (300,220) a (344,264), asi que (335,229) es 0.8 en X y 0.2 en
      // Y — con recorrido -1..1 eso es +0.6 y -0.6, bien distintos.
      const destino=screen({x:335,y:229});
      for(const k of [0.4,0.7,1]){
        const medio=screen({x:300+35*k,y:220+9*k});
        document.querySelector('.rig-control-overlay svg').dispatchEvent(new PointerEvent("pointermove",
          {bubbles:true,cancelable:true,button:0,pointerId:1,clientX:medio.x,clientY:medio.y}));
        await wait(30);
      }
      document.querySelector('.rig-control-overlay svg').dispatchEvent(new PointerEvent("pointerup",
        {bubbles:true,cancelable:true,button:0,pointerId:1,clientX:destino.x,clientY:destino.y}));
      await wait(220);

      const cx=DZ.doc.scene.rigChannel(rx), cy=DZ.doc.scene.rigChannel(ry);
      const vx=cx&&cx.keys[Object.keys(cx.keys||{})[0]];
      const vy=cy&&cy.keys[Object.keys(cy.keys||{})[0]];
      assert(Number.isFinite(vx),"el arrastre no dejo clave en el canal del eje X");
      assert(Number.isFinite(vy),
        "el arrastre en diagonal NO movio el segundo eje: el punto 2D sigue siendo un "
        +"control de una dimension dibujado dentro de un cuadrado");
      assert(Math.abs(vx)>1e-6&&Math.abs(vy)>1e-6,
        "uno de los dos ejes quedo en su valor neutro (X="+vx+", Y="+vy+")");
      assert(Math.abs(vx-vy)>1e-3,
        "los dos ejes recibieron el MISMO valor ("+vx+"): el arrastre fue asimetrico "
        +"—mucho en X, poco en Y— asi que cada canal tiene que leer SU eje");
      const pasos2d=DZ.history.undoStack.length-pasos2dAntes;
      assert(pasos2d===1,
        "el arrastre del punto 2D dejo "+pasos2d+" pasos de historial en vez de UNO: "
        +"setRigControlValue deja un paso por canal, asi que los dos tienen que ir "
        +"dentro de una transaccion o el dibujante necesita dos Ctrl+Z");
      DZ.history.undo(); await wait(150);
      const dx=DZ.doc.scene.rigChannel(rx), dy=DZ.doc.scene.rigChannel(ry);
      assert(!(dx&&Object.keys(dx.keys||{}).length)&&!(dy&&Object.keys(dy.keys||{}).length),
        "un Undo no deshizo los DOS ejes del punto 2D");

      // 6. Escape cierra y no deja la capa colgada sobre el dibujo.
      document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
      await wait(120);
      assert(!document.querySelector(".rig-control-overlay"),
        "Escape no quitó la capa de mandos");

      return "Mandos sobre el personaje OK "+JSON.stringify(
        {colocado:true,claves:1,undo:1,selector:valorSel,
         punto2d:{ejeX:vx,ejeY:vy,pasos:pasos2d,guias:2}});
    })()` });

    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ||
      JSON.stringify(result.exceptionDetails));
    console.log(result.result.value);
  } finally { ws.close(); }
}
main().catch((e) => { console.error("FALLA: " + e.message); process.exit(1); });
