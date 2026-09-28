# Relé de trabajo remoto de LOW

Poner esto en un droplet y el equipo trabaja sobre el mismo proyecto: se ven,
se respetan las piezas tomadas, se pasan el dibujo y se comentan los cuadros.

No hay servicio de terceros en el medio. **Es tu servidor.**

## Levantarlo

Un archivo, sin dependencias. Cualquier Python 3 que ya venga en el droplet:

```bash
python3 server/low_relay.py --puerto 8787 --datos /var/lib/low-relay
```

Con clave, que es como debe quedar en un servidor público:

```bash
LOW_RELAY_TOKEN=una-clave-larga-y-fea python3 server/low_relay.py --puerto 8787
```

Sin `LOW_RELAY_TOKEN` cualquiera que sepa la dirección entra a las salas. El
programa lo avisa al arrancar.

Para comprobar que está vivo, cualquier `GET` común devuelve su estado:

```bash
curl http://tu-droplet:8787/
```

## Como servicio (systemd)

`/etc/systemd/system/low-relay.service`:

```ini
[Unit]
Description=Rele de trabajo remoto de LOW
After=network.target

[Service]
Type=simple
User=low
WorkingDirectory=/opt/low
Environment=LOW_RELAY_TOKEN=una-clave-larga-y-fea
ExecStart=/usr/bin/python3 /opt/low/server/low_relay.py --puerto 8787 --datos /var/lib/low-relay
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now low-relay
sudo journalctl -u low-relay -f
```

## Detrás de nginx, con TLS

Conviene: el navegador exige `wss://` desde páginas servidas por HTTPS, y así
el puerto 8787 no queda abierto al mundo.

```nginx
location /low/ {
    proxy_pass http://127.0.0.1:8787/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;     # una sesión de dibujo dura horas
}
```

En LOW, el servidor se escribe entonces `wss://tu-dominio/low/`.

El `proxy_read_timeout` largo importa: con el valor por omisión (60 s) nginx
corta las conexiones quietas y el equipo se pasa el día reconectando.

## Qué hace y qué no

**Sí:**

- Reparte las operaciones de edición entre los que están en la misma sala, y
  las guarda numeradas para que el que llega tarde se ponga al día.
- **Arbitra los bloqueos.** Es lo único que decide por su cuenta: dos personas
  que piden la misma pieza en el mismo instante no pueden resolverlo entre
  ellas. Los bloqueos del que se desconecta se sueltan solos.
- Presencia: quién está, en qué cuadro y con qué herramienta.
- Comentarios sobre el cuadro, con autor y estado de resuelto.
- Roles: `owner` y `editor` dibujan, `reviewer` sólo comenta, `viewer` mira.

**No:**

- **No comparte pantalla.** Eso es video en vivo entre navegadores (WebRTC),
  otro problema y otra pieza. Este relé mueve texto.
- No interpreta lo que reparte: no sabe qué es un hueso ni una capa, y no debe
  saberlo. Si supiera, habría que actualizar el servidor cada vez que LOW
  aprende algo nuevo.

## Los datos

Con `--datos` se guarda, por sala, el registro de operaciones y los
comentarios, en JSON y con escritura atómica. Presencia y bloqueos **no** se
guardan: son estado de gente conectada, y al arrancar no hay nadie.

El registro tiene tope de 20.000 operaciones por sala; al pasarlo se descartan
las más viejas. El que reconecta después de eso recibe menos historia, no una
sala vacía.

## Cómo se prueba

```bash
python tools/check_relay_server.py       # protocolo, con clientes WebSocket reales
node tools/run_collab_transport_tests.js # el cliente ante cortes de red
node tools/check_colab_ui.js             # LOW contra este servidor, de punta a punta
```

Los tres están en la puerta de CI.
