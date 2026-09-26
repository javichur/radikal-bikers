# Arquitectura

```
src/
├── core/      Utilidades puras: matemáticas, PRNG determinista, bucle de paso fijo, máquina de estados (GameFlow), guardado
├── content/   Datos del juego: personajes, recorridos (ordenados por dificultad), tipos de vehículo, obstáculos, retos y progresión
├── sim/       Simulación determinista sin DOM: pista, física de la moto, tráfico (incl. tranvía), paso a nivel,
│              obras (conos), rival, fantasma, combos, reglas y World
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
  en las curvas; los muros laterales rozan o, si se choca de frente, frenan la moto (nunca provocan caída).
- **Entrada abstracta.** Todos los dispositivos producen un `ControlState` (`steer`, `throttle`, `brake`, `wheelie`),
  que se combina con `combineControls`. Las acciones de menú son eventos (`MenuAction`).
- **Flujo arcade explícito.** `GameFlow` es una máquina de estados sin dependencias:
  `title → characterSelect → stageSelect → countdown → racing ⇄ paused`, `racing → continue → countdown | gameOver`,
  `racing → finished`. La acción `restart` reinicia desde cualquier pantalla de carrera y los resultados ignoran la
  entrada durante `RESULT_LOCK_SECONDS`. Devuelve _efectos_ (`startRace`, `restartRace`, `cyclePaint`, `locked`…) que
  ejecuta `Game`; qué está bloqueado lo decide `Game` (`isLocked`) a partir de las estrellas guardadas.
- **Eventos de simulación.** `World.step` devuelve `SimEvent`s (`trick`, `comboBanked`, `nearMiss`, `rivalPassed`,
  `cone`…) que `Game` traduce en HUD, efectos, sonido y cámara lenta (la cámara lenta solo escala el `dt`
  acumulado; el paso de simulación sigue siendo fijo).
- **Guardado.** `SaveData` guarda ajustes, récords, perfil (XP y estadísticas), estrellas y atajos (máscaras de bits)
  y pinturas en una clave; cada fantasma (`sim/ghost.ts`, 15 muestras/s) va en su propia clave
  `radikal-riders:ghost:<recorrido>:<repartidor>` y se valida al cargar.
- **Contenido como datos.** Añadir un recorrido o un personaje consiste en añadir una entrada a `content/` y sus textos
  en `ui/locales/` (`stage.<id>.name` y `stage.<id>.desc`). `STAGES` se muestra en orden de dificultad y cada
  `StageDef` elige un estilo de decorado (`scenery`), la mezcla de tráfico y, opcionalmente, obstáculos, pasos a
  nivel, mar, túneles y puentes. Cada puente puede ajustar el tamaño de su río (`river`, con `dry` para un cauce seco
  de césped). También hay parques (`parks`, polígonos sin edificios que la avenida solo cruza por puentes) y
  monumentos (`monuments`, tipos de `content/monuments.ts` dibujados en `render/monuments.ts`, que apartan los
  edificios procedurales). El estilo `valencia` añade manzanas continuas del Ensanche, tejados de teja azul vidriada y
  naranjos. `tests/unit/stages.test.ts` valida el trazado de cada recorrido, que los parques solo se crucen por puentes
  y que los monumentos no pisen calzadas ni atajos.

## Física (resumen)

| Elemento     | Comportamiento                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Aceleración  | `a = accel · throttle · (1 − (v/vmax)³)`; rozamiento al soltar; frenada fuerte y marcha atrás lenta          |
| Dirección    | Velocidad de giro ∝ manejo, reducida a baja velocidad, con caballito (×0.45) y en el aire (×0.2)             |
| Caballito    | Requiere > 6 m/s; +12 % de velocidad punta; máximo 3 s y luego 1,5 s de enfriamiento; puede saltar vehículos |
| Rampas       | Impulso vertical ∝ velocidad (+ extra con caballito); aterrizar muy cruzado provoca caída                    |
| Muros        | Roce con pérdida de velocidad (menor cuanto más peso); impacto lateral > 9 m/s = rebote y −25 % de velocidad |
| Tráfico      | Choque frontal/alcance con velocidad relativa > 4 m/s = caída; con caballito la moto puede trepar y saltar   |
| Explosivo    | Con el bonus activo, los vehículos golpeados explotan y el piloto no se cae                                  |
| Escaparates  | Romper los cristales resta un 15 % de velocidad, sin caída                                                   |
| Obstáculos   | Conos: se derriban y frenan; vallas, fuente y barreras bajadas: caída (se pueden saltar)                     |
| Paso a nivel | Horario determinista (`sim/crossing.ts`); campana, barreras y tren que atropella; el tráfico espera          |
| Crestas      | Si la aceleración vertical de la calzada supera la gravedad, la moto despega sin rampa                       |
| Caída        | 2,2 s en el suelo, reaparición en un carril libre con 1,6 s de invulnerabilidad                              |

## Tests

- `tests/unit`: Vitest (Node + jsdom para adaptadores de entrada). Incluye un "piloto automático" que completa el
  recorrido con cada personaje para vigilar el equilibrio del tiempo límite.
- `tests/e2e`: Playwright contra el build de producción, en escritorio y en iPhone 13 emulado (táctil).
