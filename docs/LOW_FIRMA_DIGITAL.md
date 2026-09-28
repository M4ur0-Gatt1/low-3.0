# Firma digital de LOW — qué está hecho y qué falta

## Lo primero, sin vueltas

**No puedo conseguir el certificado.** La firma que saca el aviso de Windows
necesita un **certificado de firma de código emitido por una autoridad
reconocida**, y eso se compra a nombre de una persona o de una empresa, con
verificación de identidad. No hay forma de generarlo desde acá.

Y hay una trampa que conviene descartar de entrada: **un certificado
autofirmado no sirve** para esto. Se puede generar en dos minutos y firma el
archivo, pero Windows no lo reconoce, así que el aviso sigue apareciendo — a
veces con un texto peor, porque una firma que no valida se lee como sospechosa.
Si alguien te dice que con `New-SelfSignedCertificate` se arregla, no es cierto.

## Lo que sí está hecho (desde v4.19.0)

La compilación **ya firma sola** en cuanto haya certificado. Están cableados
los dos pasos que hacen falta, en el orden que importa:

1. Se firma `LOW.exe` después de compilarlo y de pasar el humo.
2. Se firma `LOWSetup-x.y.z.exe` **después** de armar el instalador.

El segundo no es opcional: lo primero que ejecuta el usuario es el setup, y es
eso lo que Windows mira. Firmar sólo el `.exe` de adentro deja el aviso igual.

Mientras no haya certificado cargado, los dos pasos **se saltean solos** y el
release sale sin firma, con un aviso en el log. Preferí eso a que la compilación
falle y no haya instaladores.

Los dos pasos usan `/fd sha256` y **sellado de tiempo**
(`/tr http://timestamp.digicert.com`). El sello no es un detalle: sin él, la
firma deja de valer el día que el certificado vence, y los instaladores que ya
habías publicado empiezan a dar aviso de la nada.

## Cómo se enciende, cuando tengas el certificado

Dos secretos en el repositorio (Settings → Secrets and variables → Actions):

| secreto | qué es |
|---|---|
| `LOW_PFX_BASE64` | el archivo `.pfx` del certificado, convertido a base64 |
| `LOW_PFX_PASSWORD` | la contraseña del `.pfx` |

Para convertirlo:

```bash
base64 -w 0 mi-certificado.pfx > pfx.txt
```

Y el contenido de `pfx.txt` va como valor del secreto. Con eso, el próximo tag
sale firmado sin tocar nada más.

## Qué certificado conviene

| tipo | qué consigue | costo aproximado |
|---|---|---|
| **Azure Trusted Signing** | firma válida, sin token físico; el más barato hoy | ~10 USD/mes |
| **OV** (validación de organización) | firma válida; SmartScreen **acumula reputación** — los primeros días puede seguir avisando | 200–400 USD/año |
| **EV** (validación extendida) | reputación **inmediata** en SmartScreen; exige token físico o HSM | 400–700 USD/año |
| autofirmado | **no sirve** para esto | gratis |

Dos cosas que suelen sorprender:

- Desde junio de 2023 los certificados OV y EV **no se entregan como archivo**:
  la clave privada tiene que vivir en hardware (token USB o HSM) o en un
  servicio de firma en la nube. Con un token físico, el flujo de `.pfx` en un
  secreto **no funciona** y hay que firmar desde una máquina con el token, o
  usar un servicio como Azure Trusted Signing. Si vas por token, decímelo y
  cambio el cableado a ese camino.
- Con **OV**, el aviso puede seguir apareciendo un tiempo hasta que la firma
  junte reputación. Con **EV** desaparece desde la primera descarga. Esa es la
  diferencia real por la que EV cuesta más.

Para el caso de LOW —un programa que instalás vos y un puñado de personas—
**Azure Trusted Signing es la opción sensata**: cuesta como un café por mes,
firma de verdad y no necesita token.

## Mientras no haya firma

El aviso de Windows se puede pasar con «Más información → Ejecutar de todas
formas», y eso es todo lo que hay. Cualquier otra vuelta —empaquetar en un zip,
renombrar la extensión, pedirle al usuario que desactive SmartScreen— empeora
las cosas o le pide a la gente que baje sus defensas. No vale la pena.

## macOS y Linux

- **macOS** tiene el mismo problema con Gatekeeper y necesita su propio camino:
  cuenta de Apple Developer (99 USD/año), firma y **notarización**. Hoy el
  `.zip` de macOS sale sin firmar y hay que abrirlo con clic derecho → Abrir.
- **Linux** no pide firma para ejecutar el binario.
