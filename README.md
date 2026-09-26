# Radikal Riders

Juego arcade de carreras de motos de reparto de pizza para el navegador, inspirado en el clásico de recreativa
_Radikal Bikers_ (Gaelco, 1998). Todo el arte, el audio y el código son originales: los gráficos son 3D estilizados
(_cel-shading_) generados por código y el sonido se sintetiza en tiempo real con Web Audio.

> Primera iteración: modo arcade para 1 jugador, 1 recorrido (**Puerto Radikal**) y 2 repartidores (**Rocco** y **Luna**),
> en español e inglés.

## Cómo jugar

Reparte la pizza antes de que se acabe el tiempo. Cada **CHECKPOINT** suma tiempo extra. Esquiva coches, taxis,
furgonetas, autobuses y camiones (en ambos sentidos), usa las rampas para saltar por encima del tráfico y haz
**caballitos** para ganar velocidad punta (a costa de maniobrabilidad). Si se acaba el tiempo tienes 9 segundos para
**continuar** desde el último checkpoint (con penalización de puntos).

| Acción         | Teclado         | Mando                | Táctil (iPhone / Android)             |
| -------------- | --------------- | -------------------- | ------------------------------------- |
| Girar          | ← → / A D       | Stick izq. / cruceta | Joystick flotante (mitad izquierda)   |
| Acelerar       | ↑ / W           | RT / A               | Botón **GAS**                         |
| Frenar / atrás | ↓ / S           | LT / X               | Botón **FRENO**                       |
| Caballito      | Espacio / Shift | RB / Y               | Botón **CABALLITO** (también acelera) |
| Pausa          | Esc / P         | Start                | Botón **II**                          |
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

Más información en [docs/architecture.md](docs/architecture.md) y [docs/game-design.md](docs/game-design.md).
