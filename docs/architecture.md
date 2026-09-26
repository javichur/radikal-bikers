# Arquitectura

```
src/
├── core/      Utilidades puras: matemáticas, PRNG determinista, bucle de paso fijo, máquina de estados (GameFlow), guardado
├── content/   Datos del juego: personajes, recorridos (ordenados por dificultad), tipos de vehículo y obstáculos
├── sim/       Simulación determinista sin DOM: pista, física de la moto, tráfico (incl. tranvía), paso a nivel, reglas, World
├── input/     Teclado, mando (Gamepad API) y controles táctiles → ControlState abstracto
├── render/    Three.js: materiales toon, ciudad procedural con estilo por escenario (sceneryStyle), modelos, cámaras
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
  en las curvas; los muros laterales rozan o provocan caída según el ángulo.
- **Entrada abstracta.** Todos los dispositivos producen un `ControlState` (`steer`, `throttle`, `brake`, `wheelie`),
  que se combina con `combineControls`. Las acciones de menú son eventos (`MenuAction`).
- **Flujo arcade explícito.** `GameFlow` es una máquina de estados sin dependencias:
  `title → characterSelect → stageSelect → countdown → racing ⇄ paused`, `racing → continue → countdown | gameOver`,
  `racing → finished`. Devuelve _efectos_ (`startRace`, `continueRace`…) que ejecuta `Game`.
- **Contenido como datos.** Añadir un recorrido o un personaje consiste en añadir una entrada a `content/` y sus textos
  en `ui/locales/` (`stage.<id>.name` y `stage.<id>.desc`). `STAGES` se muestra en orden de dificultad y cada
  `StageDef` elige un estilo de decorado (`scenery`), la mezcla de tráfico y, opcionalmente, obstáculos, pasos a
  nivel, mar, túneles y puentes. `tests/unit/stages.test.ts` valida el trazado de cada recorrido.

## Física (resumen)

| Elemento     | Comportamiento                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Aceleración  | `a = accel · throttle · (1 − (v/vmax)³)`; rozamiento al soltar; frenada fuerte y marcha atrás lenta              |
| Dirección    | Velocidad de giro ∝ manejo, reducida a baja velocidad, con caballito (×0.45) y en el aire (×0.2)                 |
| Caballito    | Requiere > 6 m/s; +12 % de velocidad punta; máximo 3 s y luego 1,5 s de enfriamiento                             |
| Rampas       | Impulso vertical ∝ velocidad (+ extra con caballito); aterrizar muy cruzado provoca caída                        |
| Muros        | Roce con pérdida de velocidad (menor cuanto más peso); impacto lateral > 9 m/s = caída                           |
| Tráfico      | Choque frontal/alcance con velocidad relativa > 4 m/s = caída; roce lateral = rebote; se puede saltar por encima |
| Obstáculos   | Conos: se derriban y frenan; vallas, fuente y barreras bajadas: caída (se pueden saltar)                         |
| Paso a nivel | Horario determinista (`sim/crossing.ts`); campana, barreras y tren que atropella; el tráfico espera              |
| Crestas      | Si la aceleración vertical de la calzada supera la gravedad, la moto despega sin rampa                           |
| Caída        | 2,2 s en el suelo, reaparición en un carril libre con 1,6 s de invulnerabilidad                                  |

## Tests

- `tests/unit`: Vitest (Node + jsdom para adaptadores de entrada). Incluye un "piloto automático" que completa el
  recorrido con cada personaje para vigilar el equilibrio del tiempo límite.
- `tests/e2e`: Playwright contra el build de producción, en escritorio y en iPhone 13 emulado (táctil).
