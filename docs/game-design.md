# Diseño de juego — Radikal Riders

Referencia: _Radikal Bikers_ (Gaelco, 1998, recreativa). Se imitan la estructura y las sensaciones; todos los nombres,
personajes, modelos y sonidos son originales.

## Bucle arcade

1. Pantalla de título (idioma, sonido, récord).
2. Selección de repartidor: estadísticas de velocidad, aceleración, manejo y peso; vista 3D giratoria del personaje;
   ↑ ↓ cambia la pintura de la moto (se desbloquean subiendo de nivel).
3. Selección de recorrido.
4. Cuenta atrás 3-2-1-¡YA! (reloj detenido, tráfico en movimiento).
5. Carrera contra el reloj con checkpoints que dan **tiempo extra**, aviso de **¡DATE PRISA!** a los 10 s.
6. Tiempo agotado → **¿CONTINUAR?** 9…0 (reanuda en el último checkpoint con el reloj completo y −5000 puntos) o
   **FIN DE LA PARTIDA**.
7. Meta → **¡PIZZA ENTREGADA!** con nota S/A/B/C, tiempo, puntuación, récord, distancia al récord, diferencia con el
   fantasma, resultado contra el rival, retos cumplidos, XP ganada y desbloqueos (todo guardado en `localStorage`).
   La pantalla ignora la entrada 1 s; después **Enter / R = otra vez** (misma selección) y **Esc = menú**.
8. **Reinicio instantáneo** con R / Select en cualquier momento de la carrera.

Puntuación: 10 puntos por metro + 1000 por segundo sobrante al llegar a meta + combos + 5000 por ganar al rival −
5000 por continuación.

## Combos y trucos

Cada truco suma puntos base a un combo pendiente; si en 3 s no llega otro truco, el combo se cobra multiplicado
(×1 con 1–2 trucos, ×2 con 3–4… hasta ×5). Una caída pierde el combo pendiente.

| Truco                                      | Puntos base |
| ------------------------------------------ | ----------- |
| A un pelo (pasar a < 1,1 m de un vehículo) | 250         |
| Caballito (mantener ≥ 1 s seguidos)        | 150         |
| Salto (escala con el tiempo en el aire)    | 200         |
| Cristal roto                               | 300         |
| Atajo completado                           | 500         |
| Vehículo explotado (bonus explosivo)       | 1000        |

«A un pelo» y el salto aplican un breve efecto de cámara lenta.

## Retos, notas y progresión

- 3 retos por recorrido (una ⭐ cada uno, solo si entregas la pizza). Puerto Radikal: caballito de 2,5 s, 2 atajos,
  sin caerse. Puerto Radikal de noche: 12 «a un pelo», combo de 6, ganar al rival.
- Nota por puntuación (umbrales en `content/stages.ts`, calibrados con el piloto automático de los tests).
- **XP** = puntuación de cada partida; niveles con coste creciente (máx. 10) y 5 rangos. Las pinturas se desbloquean en
  los niveles 2, 3, 4, 5 y 7.
- Desbloqueos por estrellas totales: recorrido nocturno (2 ⭐), Nitro (4 ⭐).
- Estadísticas de carrera en el título: partidas, entregas, km recorridos, «a un pelo», explosiones y mejor combo.
- Los atajos descubiertos se marcan en la tarjeta del recorrido.

## Fantasma y rival

- El **fantasma** es la entrega más rápida (sin continuaciones) de cada combinación recorrido + repartidor: se ve como
  una moto translúcida, aparece en la barra de progreso y en cada checkpoint se muestra la diferencia de tiempo.
- El **rival** es otro repartidor controlado por la máquina que corre por la avenida: esquiva el tráfico (nunca se
  cae), afloja si te saca más de 40 m y aprieta si se queda 120 m atrás. En el HUD se ve la posición y la distancia.

## Personajes (iteración 1)

| Personaje | Velocidad punta   | Aceleración | Manejo | Peso | Perfil                              |
| --------- | ----------------- | ----------- | ------ | ---- | ----------------------------------- |
| Rocco     | 36 m/s (130 km/h) | 9 m/s²      | 1,55   | 1,2  | Rápido en recta, gira peor          |
| Luna      | 33 m/s (119 km/h) | 11 m/s²     | 1,95   | 0,9  | Ágil, sale rápido, esquiva mejor    |
| Nitro     | 38 m/s (137 km/h) | 10 m/s²     | 1,6    | 1,0  | El más rápido; se desbloquea (4 ⭐) |

## Recorrido: Puerto Radikal

~3,1 km de avenida de 4 carriles (2 por sentido) con curvas enlazadas, desniveles suaves, 3 checkpoints
(+30 s, +28 s, +25 s; 40 s iniciales) y 4 rampas. Tráfico mixto en ambos sentidos: coches, taxis, furgonetas,
autobuses y camiones, que frenan tras vehículos más lentos y pitan si les bloqueas.

Cada partida elige al azar 2 **obras** (conos que cierran un carril; el tráfico cambia de carril antes de llegar y
atropellar un cono frena la moto) y usa una semilla de tráfico distinta (fija con `?e2e`).

**Puerto Radikal de noche**: mismas calles con iluminación nocturna y faro, más tráfico, 3 obras, rival Nitro y retos
más duros.

## HUD

Tiempo restante (rojo y parpadeante < 10 s), puntuación, distancia al récord, posición y distancia al rival, barra de
progreso con marcas de checkpoint, rival y fantasma, velocímetro analógico con km/h, combo (multiplicador, puntos y
tiempo restante), texto de cada truco, diferencia con el fantasma en cada checkpoint, líneas de velocidad, avisos
centrales (CHECKPOINT / TIEMPO EXTRA / ¡PORRAZO! / ¡SALTO!) y cuenta atrás.

Efectos: chispas al rozar, humo al caer, polvo y temblor de cámara al aterrizar, confeti al cobrar combos grandes,
conos que salen volando. La música sintetizada gana capas (bombo, bajo, charles, arpegio) con la velocidad y el combo y
acelera con ¡DATE PRISA!.

## Próximas iteraciones

- Más recorridos (escenarios del original: ciudad, puerto, zona industrial, centro histórico…) y más repartidores.
- Peatones, tranvía, más rivales simultáneos, repeticiones completas.
- Opciones: dirección por inclinación (giroscopio, con permiso en iOS), aceleración automática, modo zurdo,
  reasignación de controles.
- WebKit en CI.
