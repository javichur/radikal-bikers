# Radikal Riders

Juego arcade de carreras de motos de reparto de pizza para el navegador, inspirado en el clásico de recreativa
_Radikal Bikers_ (Gaelco, 1998). Todo el arte, el audio y el código son originales: los gráficos son 3D estilizados
(_cel-shading_) generados por código y el sonido se sintetiza en tiempo real con Web Audio.

> Primera iteración: modo arcade para 1 jugador, 1 recorrido (**Puerto Radikal**) y 2 repartidores (**Rocco** y **Luna**),
> en español e inglés.

## Cómo jugar

Reparte la pizza antes de que se acabe el tiempo. Cada **CHECKPOINT** suma tiempo extra. Esquiva coches, taxis,
furgonetas, autobuses y camiones (en ambos sentidos), usa las rampas para saltar por encima del tráfico y haz
**caballitos** para ganar velocidad punta (a costa de maniobrabilidad) y saltar por encima de los vehículos que se crucen. Si se acaba el tiempo tienes 9 segundos para
**continuar** desde el último checkpoint (con penalización de puntos).

Encadena **trucos** (pasar a un pelo de un coche, caballitos largos, saltos, cristales, atajos, explosiones) para subir
el **multiplicador de combo** hasta ×5; si te caes, lo pierdes. Cada recorrido tiene 3 **retos** (⭐) y una nota
**S/A/B/C**; las estrellas desbloquean al repartidor **Nitro** y el recorrido nocturno. Compites contra un **rival** y
contra el **fantasma** de tu mejor entrega, ganas **XP** para subir de nivel y desbloquear pinturas para la moto, y
puedes **reiniciar al instante** en cualquier momento.

| Acción         | Teclado         | Mando                | Táctil (iPhone / Android)             |
| -------------- | --------------- | -------------------- | ------------------------------------- |
| Girar          | ← → / A D       | Stick izq. / cruceta | Joystick flotante (mitad izquierda)   |
| Acelerar       | ↑ / W           | RT / A               | Botón **GAS**                         |
| Frenar / atrás | ↓ / S           | LT / X               | Botón **FRENO**                       |
| Caballito      | Espacio / Shift | RB / Y               | Botón **CABALLITO** (también acelera) |
| Pausa          | Esc / P         | Start                | Botón **II**                          |
| Reiniciar      | R               | Select / Back        | Menú de pausa                         |
| Menús          | Flechas + Enter | Cruceta + A / B      | Tocar (1er toque elige, 2º confirma)  |

En móvil se juega en horizontal (se muestra un aviso en vertical). Los controles respetan las _safe areas_ del iPhone
y el juego bloquea el zoom y el desplazamiento de la página.

## Desarrollo

Requisitos: Node.js 22+.

```bash
npm install
npm run dev            # servidor de desarrollo (http://localhost:5173)
npm run build          # typecheck + build de producción en dist/
npm run preview        # sirve dist/
```

Calidad:

```bash
npm run lint           # ESLint (typescript-eslint strict)
npm run format:check   # Prettier
npm run typecheck      # TypeScript estricto
npm test               # tests unitarios (Vitest)
npm run test:coverage  # con umbrales de cobertura
npx playwright install chromium
npm run test:e2e       # tests end-to-end (Playwright: escritorio + iPhone emulado)
```

Parámetros de URL útiles: `?quality=low` (sin sombras ni antialiasing, resolución reducida; útil en equipos lentos) y
`?e2e` (expone `window.__RR__` para los tests end-to-end).

El build usa `base: './'`, por lo que `dist/` puede alojarse en cualquier servidor estático o subcarpeta.

## Publicación en GitHub Pages (URL difícil de adivinar)

El workflow `.github/workflows/pages.yml` publica el juego en cada push a `main` (o manualmente desde _Actions_) bajo
una ruta secreta: `https://<usuario>.github.io/<repo>/<SECRETO>/`. La raíz del sitio solo sirve una página vacía y todo
lleva `noindex` / `robots.txt` para que los buscadores no lo indexen.

Configuración (una sola vez):

1. _Settings → Pages → Build and deployment → Source_: **GitHub Actions**.
2. _Settings → Secrets and variables → Actions → New repository secret_: `PAGES_SECRET_PATH` con un valor aleatorio de
   al menos 16 caracteres `[A-Za-z0-9_-]` (p. ej. `openssl rand -hex 16`).
3. Lanzar el workflow _Deploy to GitHub Pages_. Para cambiar la URL, cambia el secreto y vuelve a lanzarlo.

> ⚠️ Es ocultación, no control de acceso: cualquiera que tenga el enlace puede jugar. Con repositorio privado, GitHub
> Pages requiere plan Pro (o superior).

Más información en [docs/architecture.md](docs/architecture.md) y [docs/game-design.md](docs/game-design.md).
