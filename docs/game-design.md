# Diseño de juego — Radikal Riders

Referencia: _Radikal Bikers_ (Gaelco, 1998, recreativa). Se imitan la estructura y las sensaciones; todos los nombres,
personajes, modelos y sonidos son originales.

## Bucle arcade

1. Pantalla de título (idioma, sonido, récord).
2. Selección de repartidor: estadísticas de velocidad, aceleración, manejo y peso; vista 3D giratoria del personaje.
3. Selección de recorrido.
4. Cuenta atrás 3-2-1-¡YA! (reloj detenido, tráfico en movimiento).
5. Carrera contra el reloj con checkpoints que dan **tiempo extra**, aviso de **¡DATE PRISA!** a los 10 s.
6. Tiempo agotado → **¿CONTINUAR?** 9…0 (reanuda en el último checkpoint con el reloj completo y −5000 puntos) o
   **FIN DE LA PARTIDA**.
7. Meta → **¡PIZZA ENTREGADA!** con tiempo, puntuación y récord (guardado en `localStorage`).

Puntuación: 10 puntos por metro + 1000 por segundo sobrante al llegar a meta − 5000 por continuación.

## Personajes (iteración 1)

| Personaje | Velocidad punta   | Aceleración | Manejo | Peso | Perfil                           |
| --------- | ----------------- | ----------- | ------ | ---- | -------------------------------- |
| Rocco     | 36 m/s (130 km/h) | 9 m/s²      | 1,55   | 1,2  | Rápido en recta, gira peor       |
| Luna      | 33 m/s (119 km/h) | 11 m/s²     | 1,95   | 0,9  | Ágil, sale rápido, esquiva mejor |

## Recorrido: Puerto Radikal

~3,1 km de avenida de 4 carriles (2 por sentido) con curvas enlazadas, desniveles suaves, 3 checkpoints
(+30 s, +28 s, +25 s; 40 s iniciales) y 4 rampas. Tráfico mixto en ambos sentidos: coches, taxis, furgonetas,
autobuses y camiones, que frenan tras vehículos más lentos y pitan si les bloqueas.

## HUD

Tiempo restante (rojo y parpadeante < 10 s), puntuación, barra de progreso con marcas de checkpoint, velocímetro
analógico con km/h, avisos centrales (CHECKPOINT / TIEMPO EXTRA / ¡PORRAZO! / ¡SALTO!) y cuenta atrás.

## Próximas iteraciones

- Más recorridos (escenarios del original: ciudad, puerto, zona industrial, centro histórico…) y más repartidores.
- Atajos, peatones, obstáculos en calzada (obras, conos), tranvía.
- Rivales (modo "versus" del original), repeticiones / _ghost_ gracias a la simulación determinista.
- Opciones: dirección por inclinación (giroscopio, con permiso en iOS), aceleración automática, modo zurdo,
  reasignación de controles.
- Partículas (humo, chispas), música, WebKit en CI.
