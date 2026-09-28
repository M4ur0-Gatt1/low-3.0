/* Hover and keyboard help for the drawing toolbar. */
(() => {
  let current=null,timer=null,bubble=null;
  /* DOBLE CARTEL. Este globo se arma LEYENDO el `title`, y el navegador
     muestra ademas SU tooltip nativo del mismo `title`: dos carteles con el
     mismo texto, uno encima del otro. Reportado mirando la pantalla («aparece
     doble cartel, es muy molesto») y se ve en la captura: el texto del rig
     repetido y superpuesto.

     Se saca el `title` mientras el globo esta a la vista y se DEVUELVE al
     ocultarlo. No se borra para siempre porque el `title` es lo que leen los
     lectores de pantalla y de donde sale el texto del propio globo. */
  const guardarTitulo=(el)=>{
    if(!el||el.dataset.tituloAyuda!=null)return;
    const t=el.getAttribute('title');if(t==null)return;
    el.dataset.tituloAyuda=t;el.removeAttribute('title');
  };
  const devolverTitulo=(el)=>{
    if(!el||el.dataset.tituloAyuda==null)return;
    el.setAttribute('title',el.dataset.tituloAyuda);delete el.dataset.tituloAyuda;
  };
  const textoDe=(el)=>(el?.dataset.tituloAyuda??el?.getAttribute('title'))||'';

  /* EL GLOBO TIENE QUE SER CHICO.  Reportado tres veces: primero salia doble,
     despues tapaba el boton, y ahora «siguen siendo incomodos, son grandes».
     MEDIDO sobre los 283 textos de ayuda de la interfaz: 49 caracteres de
     promedio y 179 el mas largo. A 260 px de ancho, 179 caracteres son SEIS
     renglones — un parrafo flotando al lado del cursor.

     Casi todos los textos ya vienen partidos: «Pincel (B): grosor segun la
     presion…», «Ajustar a pantalla (F) · 0 = 100% · …». Lo primero es el
     NOMBRE y el atajo, que es lo que uno viene a buscar; lo demas es detalle.
     Asi que se muestran en dos jerarquias y el detalle se recorta a dos
     renglones: el globo pasa de parrafo a etiqueta. El texto completo sigue
     estando en la ayuda del programa (?). */
  const CORTE=/^([\s\S]{0,60}?)(?:\s*[·—–]\s*|:\s+|\.\s+)([\s\S]+)$/;
  function armar(globo,texto){
    const m=CORTE.exec(texto);
    const titulo=document.createElement('b');titulo.className='dz-tth-t';
    titulo.textContent=m?m[1]:texto;
    globo.appendChild(titulo);
    if(m&&m[2]){const detalle=document.createElement('i');detalle.className='dz-tth-d';
      detalle.textContent=m[2];globo.appendChild(detalle);}
  }
  /* DONDE PONER EL GLOBO. Antes se ponia SIEMPRE a la derecha y, si no
     entraba, se lo empujaba adentro de la ventana con un `min`. Para los
     botones del panel de la derecha eso significa quedar ENCIMA del boton y de
     sus vecinos: reportado mirando la pantalla, «el tooltip tapa el boton».

     Ahora se prueban los cuatro lados en orden y se elige el PRIMERO que entra
     sin pisar al boton. Si ninguno entra —una ventana muy chica—, se usa el
     que deje menos superposicion, que siempre es mejor que taparlo entero. */
  const HUECO=8;
  const seSuperponen=(a,b)=>!(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom);
  const dentro=(v,min,max)=>Math.max(min,Math.min(max,v));
  function ubicar(globo,destino,caja){
    const w=caja.width,h=caja.height;
    const ejeY=dentro(destino.top,HUECO,Math.max(HUECO,innerHeight-h-HUECO));
    const ejeX=dentro(destino.left,HUECO,Math.max(HUECO,innerWidth-w-HUECO));
    const lados=[
      {x:destino.right+HUECO,y:ejeY},                 // derecha
      {x:destino.left-w-HUECO,y:ejeY},                // izquierda
      {x:ejeX,y:destino.bottom+HUECO},                // abajo
      {x:ejeX,y:destino.top-h-HUECO},                 // arriba
    ];
    let elegido=null,menosPisado=Infinity;
    for(const l of lados){
      const cabe=l.x>=HUECO&&l.y>=HUECO&&l.x+w<=innerWidth-HUECO&&l.y+h<=innerHeight-HUECO;
      const caj={left:l.x,top:l.y,right:l.x+w,bottom:l.y+h};
      const pisa=seSuperponen(caj,destino);
      if(cabe&&!pisa){elegido=l;break;}
      // por si ninguno entra limpio: se guarda el menos malo
      const malo=(cabe?0:1000)+(pisa?500:0);
      if(malo<menosPisado){menosPisado=malo;elegido=elegido||l;}
    }
    const fin=elegido||lados[0];
    globo.style.left=dentro(fin.x,HUECO,Math.max(HUECO,innerWidth-w-HUECO))+'px';
    globo.style.top=dentro(fin.y,HUECO,Math.max(HUECO,innerHeight-h-HUECO))+'px';
  }
  const hide=()=>{clearTimeout(timer);bubble?.remove();bubble=null;devolverTitulo(current);current=null;};
  const show=(target)=>{
    if(current===target)return;hide();if(!target)return;current=target;
    // se saca YA, no dentro del temporizador: el nativo aparece antes
    guardarTitulo(target);
    timer=setTimeout(()=>{
      if(!target.isConnected)return;const text=textoDe(target);if(!text)return;
      bubble=document.createElement('div');bubble.className='dz-tool-tooltip';bubble.setAttribute('role','tooltip');armar(bubble,text);document.body.appendChild(bubble);
      const rect=target.getBoundingClientRect(), b=bubble.getBoundingClientRect();
      ubicar(bubble,rect,b);
    },180);
  };
  // El cajon de herramientas secundarias (`#dzToolsDrawer`) se cuelga del BODY,
  // no de `#designView`: sin nombrarlo aca, las unicas herramientas sin ayuda
  // eran justo las que nadie conoce de memoria —bomba, plancha, pinza, iman,
  // inflador, pivote, espejo—. Medido: el globo salia en la barra y no salia
  // en el cajon.
  const pick=e=>e.target.closest?.('#designView button[title],#designView [data-tool][title],#dzToolsDrawer button[title]');
  document.addEventListener('pointerover',e=>show(pick(e)));
  document.addEventListener('focusin',e=>show(pick(e)));
  document.addEventListener('pointerdown',hide,true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
  document.addEventListener('focusout',hide);
})();
