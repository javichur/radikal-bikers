# Arquitectura

```
src/
├── core/      Utilidades puras: matemáticas, PRNG determinista, bucle de paso fijo, máquina de estados (GameFlow), guardado
├── content/   Datos del juego: personajes, recorridos y tipos de vehículo
├── sim/       Simulación determinista sin DOM: pista, física de la moto, tráfico, reglas de carrera, World
├── input/     Teclado, mando (Gamepad API) y controles táctiles → ControlState abstracto
├── render/    Three.js: materiales toon, ciudad procedural, modelos de moto y vehículos, cámaras
├── audio/     Web Audio: motor sintetizado y efectos
├── ui/        HUD, pantallas de menú (DOM), i18n (es/en)
├── game.ts    Raíz de composición: conecta flujo, simulación, render, entrada, audio y UI
└── main.ts    Punto de entrada
```

## Principios

- **Simulación separada de la presentación.** `sim/` y `core/` no tocan el DOM ni Three.js; se prueban en Node con
  Vitest. El renderizador solo lee el estado del `World`.
- **Determinismo.** Paso fijo de 1/60 s (`FixedStepper`) y PRNG con semilla (`Rng`): la misma entrada produce la misma
  partida (se verifica en los tests; permite repeticiones o _ghosts_ en el futuro).
- **Espacio de pista.** La física trabaja en coordenadas `(s, d)`: distancia a lo largo de la carretera y desplazamiento
  lateral (positivo = derecha). La curvatura de la carretera rota la moto respecto a la calzada, así que hay que girar
  en las curvas; los muros laterales rozan o, si se choca de frente, frenan la moto (nunca provocan caída).
- **Entrada abstracta.** Todos los dispositivos producen un `ControlState` (`steer`, `throttle`, `brake`, `wheelie`),
  que se combina con `combineControls`. Las acciones de menú son eventos (`MenuAction`).
- **Flujo arcade explícito.** `GameFlow` es una máquina de estados sin dependencias:
  `title → characterSelect → stageSelect → countdown → racing ⇄ paused`, `racing → continue → countdown | gameOver`,
  `racing → finished`. Devuelve _efectos_ (`startRace`, `continueRace`…) que ejecuta `Game`.
- **Contenido como datos.** Añadir un recorrido o un personaje consiste en añadir una entrada a `content/` y sus textos
  en `ui/locales/`.

## Física (resumen)

| Elemento    | Comportamiento                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| Aceleración | `a = accel · throttle · (1 − (v/vmax)³)`; rozamiento al soltar; frenada fuerte y marcha atrás lenta              |
| Dirección   | Velocidad de giro ∝ manejo, reducida a baja velocidad, con caballito (×0.45) y en el aire (×0.2)                 |
| Caballito   | Requiere > 6 m/s; +12 % de velocidad punta; máximo 3 s y luego 1,5 s de enfriamiento                             |
| Rampas      | Impulso vertical ∝ velocidad (+ extra con caballito); aterrizar muy cruzado provoca caída                        |
| Muros       | Roce con pérdida de velocidad (menor cuanto más peso); impacto lateral > 9 m/s = rebote y −25 % de velocidad     |
| Tráfico     | Choque frontal/alcance con velocidad relativa > 4 m/s = caída; roce lateral = rebote; se puede saltar por encima |
| Explosivo   | Con el bonus activo, los vehículos golpeados explotan y el piloto nunca se cae                                   |
| Escaparates | Romper los cristales resta un 15 % de velocidad, sin caída                                                       |
| Caída       | 2,2 s en el suelo, reaparición en un carril libre con 1,6 s de invulnerabilidad                                  |

## Tests

- `tests/unit`: Vitest (Node + jsdom para adaptadores de entrada). Incluye un "piloto automático" que completa el
  recorrido con cada personaje para vigilar el equilibrio del tiempo límite.
- `tests/e2e`: Playwright contra el build de producción, en escritorio y en iPhone 13 emulado (táctil).
