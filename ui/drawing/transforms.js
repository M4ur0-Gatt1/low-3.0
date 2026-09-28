(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  LOW.drawing = LOW.drawing || {};

  function data(m) {
    if (!m) return { a:1, b:0, c:0, d:1, e:0, f:0 };
    return { a:+m.a, b:+m.b, c:+m.c, d:+m.d, e:+m.e, f:+m.f };
  }
  function identity() { return data(null); }
  // A * B: primero actúa B y después A. Así la rotación nueva envuelve
  // rígidamente a todas las transformaciones que la forma ya tenía.
  function multiply(A, B) {
    A = data(A); B = data(B);
    return {
      a:A.a*B.a + A.c*B.b, b:A.b*B.a + A.d*B.b,
      c:A.a*B.c + A.c*B.d, d:A.b*B.c + A.d*B.d,
      e:A.a*B.e + A.c*B.f + A.e, f:A.b*B.e + A.d*B.f + A.f
    };
  }
  function point(m, p) {
    m = data(m);
    return { x:m.a*p.x + m.c*p.y + m.e, y:m.b*p.x + m.d*p.y + m.f };
  }
  function vector(m, v) {
    m = data(m);
    return { x:m.a*v.x + m.c*v.y, y:m.b*v.x + m.d*v.y };
  }
  function rotationAround(degrees, center) {
    const r=degrees*Math.PI/180, co=Math.cos(r), si=Math.sin(r);
    return { a:co, b:si, c:-si, d:co,
      e:center.x-co*center.x+si*center.y,
      f:center.y-si*center.x-co*center.y };
  }
  function rigidRotate(base, degrees, centerInParent) {
    return multiply(rotationAround(degrees, centerInParent), base || identity());
  }
  function scaleAround(kx, ky, center) {
    return { a:kx, b:0, c:0, d:ky,
      e:center.x*(1-kx), f:center.y*(1-ky) };
  }
  // Escala el objeto completo en el espacio de su PADRE. El ancla ya está en
  // ese espacio, por lo que funciona igual aunque el objeto o la capa tengan
  // rotación, escala, reflejo o traslación previas.
  function rigidScale(base, kx, ky, centerInParent) {
    return multiply(scaleAround(kx, ky, centerInParent), base || identity());
  }
  function rigidTranslate(base, delta, rootToParent) {
    const d=vector(rootToParent || identity(), delta);
    return multiply({a:1,b:0,c:0,d:1,e:d.x,f:d.y}, base || identity());
  }
  // El gesto se mide donde el usuario lo ve: en pantalla. El signo del
  // determinante traduce ese giro al sistema del padre, incluso si una capa
  // está reflejada. Medirlo en coordenadas locales después de una escala o
  // rotación podía hacer que la manija avanzara en sentido contrario.
  function screenRotationDelta(start, current, center, parentScreenMatrix) {
    const a0=Math.atan2(start.y-center.y,start.x-center.x);
    const a1=Math.atan2(current.y-center.y,current.x-center.x);
    let delta=(a1-a0)*180/Math.PI;
    while(delta>180)delta-=360;
    while(delta<-180)delta+=360;
    const m=data(parentScreenMatrix), determinant=m.a*m.d-m.b*m.c;
    return delta*(determinant<0?-1:1);
  }
  function attr(m) {
    const n=v=>Math.abs(v)<1e-10?0:Math.round(v*1e6)/1e6;
    return `matrix(${n(m.a)} ${n(m.b)} ${n(m.c)} ${n(m.d)} ${n(m.e)} ${n(m.f)})`;
  }
  LOW.drawing.transforms = { identity, multiply, point, vector, rotationAround,
    scaleAround, rigidRotate, rigidScale, rigidTranslate, screenRotationDelta, attr };
})(typeof window !== "undefined" ? window : globalThis);
