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

## Recorridos

Como en otros arcades de Gaelco, los recorridos se eligen por dificultad (★ a ★★★★★) y los más difíciles son más
largos. Todos transcurren de día en una ciudad costera de estilo italiano y sus alrededores.

| Recorrido              | Dificultad | Longitud | Calzada                   | Tiempo inicial / checkpoints | Rasgos propios                                                                                              |
| ---------------------- | ---------- | -------- | ------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Paseo Marítimo         | ★          | ~2,6 km  | 4 carriles                | 45 s / +22, +20, +18 s       | Avenida junto al mar, pocas curvas, 7 rampas, callejones hacia el paseo, palmeras y sombrillas              |
| Puerto Radikal         | ★★         | ~3,1 km  | 4 carriles                | 40 s / +30, +28, +25 s       | Curvas enlazadas, puente sobre el río, túnel, atajos por tiendas y callejones                               |
| Centro Histórico       | ★★★        | ~2,3 km  | 2 carriles, adoquines     | 40 s / +26, +24, +20 s       | Esquinas de 90°, soportales, fuente en la plaza, conos y vallas de obra, tranvía, 4 tiendas                 |
| Zona Industrial        | ★★★★       | ~2,7 km  | 4 carriles                | 40 s / +26, +24, +20 s       | Paso a nivel con tren, tráfico pesado (camiones, autobuses), naves, contenedores y grúas, túnel             |
| Carretera de la Colina | ★★★★★      | ~4,2 km  | 2 carriles, guardarraíles | 45 s / +34, +32, +28, +24 s  | Crestas que hacen saltar sin rampa, puente sobre el barranco, túnel largo, atajos de tierra, tráfico rápido |

Obstáculos y peligros nuevos:

- **Tranvía** (Centro Histórico): vehículo largo por raíles centrales, indestructible (ni los explosivos lo mueven);
  se puede saltar desde una rampa.
- **Obstáculos fijos**: los conos se derriban al pasar (frenan un poco); las vallas de obra y la fuente provocan caída.
  Los explosivos rompen las vallas, pero no la fuente.
- **Paso a nivel** (Zona Industrial): el tren pasa según un horario determinista; la campana y las luces avisan
  antes de que bajen las barreras. Con las barreras bajadas el tráfico espera y, en el suelo, chocas contra ellas; la
  rampa previa permite saltarlas, pero el tren sí te atropella.
- **Crestas** (Carretera de la Colina): los cambios de rasante bruscos lanzan la moto por el aire.

> Los datos del original se han recordado sin poder contrastarlos con fuentes externas; conviene revisarlos con un
> vídeo _longplay_ o con MAME. Una variante de noche del casco antiguo queda pendiente hasta confirmar si existía
> (en la recreativa no consta; quizá en la versión de PlayStation).

## HUD

Tiempo restante (rojo y parpadeante < 10 s), puntuación, barra de progreso con marcas de checkpoint, velocímetro
analógico con km/h, avisos centrales (CHECKPOINT / TIEMPO EXTRA / ¡PORRAZO! / ¡SALTO!) y cuenta atrás.

## Próximas iteraciones

- Más repartidores; variante nocturna del casco antiguo (solo si se confirma en el original).
- Peatones.
- Rivales (modo "versus" del original), repeticiones / _ghost_ gracias a la simulación determinista.
- Opciones: dirección por inclinación (giroscopio, con permiso en iOS), aceleración automática, modo zurdo,
  reasignación de controles.
- Partículas (humo, chispas), música, WebKit en CI.
