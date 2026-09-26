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
| Caballito (por cada 1,5 s seguidos)        | 150         |
| Salto (escala con el tiempo en el aire)    | 200         |
| Cristal roto                               | 300         |
| Atajo completado                           | 500         |
| Vehículo explotado (bonus explosivo)       | 1000        |
| Caja de turbo recogida                     | 1500        |

«A un pelo» y el salto aplican un breve efecto de cámara lenta.

## Retos, notas y progresión

- 3 retos por recorrido (una ⭐ cada uno, solo si entregas la pizza). Puerto Radikal: caballito de 2,5 s, 2 atajos,
  sin caerse. Puerto Radikal de noche: 12 «a un pelo», combo de 6, ganar al rival. València: 4 atajos, 3 explosiones,
  ganar al rival.
- Nota por puntuación (umbrales en `content/stages.ts`, calibrados con el piloto automático de los tests).
- **XP** = puntuación de cada partida; niveles con coste creciente (máx. 10) y 5 rangos. Las pinturas se desbloquean en
  los niveles 2, 3, 4, 5 y 7.
- Desbloqueos por estrellas totales: recorrido nocturno (2 ⭐), Nitro (4 ⭐), València (8 ⭐).
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

## Recorridos

Como en otros arcades de Gaelco, los recorridos se eligen por dificultad (★ a ★★★★★) y los más difíciles son más
largos. Casi todos transcurren de día en una ciudad costera de estilo italiano y sus alrededores; el último recorre
calles reales de València.

| Recorrido              | Dificultad | Longitud | Calzada                   | Tiempo inicial / checkpoints | Rasgos propios                                                                                              |
| ---------------------- | ---------- | -------- | ------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Paseo Marítimo         | ★          | ~2,6 km  | 4 carriles                | 45 s / +22, +20, +18 s       | Avenida junto al mar, pocas curvas, 7 rampas, callejones hacia el paseo, palmeras y sombrillas              |
| Puerto Radikal         | ★★         | ~3,1 km  | 4 carriles                | 40 s / +30, +28, +25 s       | Curvas enlazadas, puente sobre el río, túnel, atajos por tiendas y callejones                               |
| Centro Histórico       | ★★★        | ~2,3 km  | 2 carriles, adoquines     | 40 s / +26, +24, +20 s       | Esquinas de 90°, soportales, fuente en la plaza, conos y vallas de obra, tranvía, 4 tiendas                 |
| Zona Industrial        | ★★★★       | ~2,7 km  | 4 carriles                | 40 s / +26, +24, +20 s       | Paso a nivel con tren, tráfico pesado (camiones, cisternas, autobuses), naves, contenedores y grúas, túnel  |
| Carretera de la Colina | ★★★★★      | ~4,2 km  | 2 carriles, guardarraíles | 45 s / +34, +32, +28, +24 s  | Crestas que hacen saltar sin rampa, puente sobre el barranco, túnel largo, atajos de tierra, tráfico rápido |

Obstáculos y peligros nuevos:

- **Tranvía** (Centro Histórico): vehículo largo por raíles centrales, indestructible (ni los explosivos lo mueven);
  se puede saltar desde una rampa.
- **Tráfico variado**: además de coches, taxis, furgonetas, autobuses y camiones circulan coches de policía,
  ambulancias y camiones de bomberos (con rotativos que parpadean), camiones de la basura lentos (Centro Histórico y
  Zona Industrial) y camiones cisterna (Zona Industrial y Carretera de la Colina).
- **Obstáculos fijos**: los conos se derriban al pasar (frenan un poco); las vallas de obra y la fuente provocan caída.
  Los explosivos rompen las vallas, pero no la fuente.
- **Paso a nivel** (Zona Industrial): el tren pasa según un horario determinista; la campana y las luces avisan
  antes de que bajen las barreras. Con las barreras bajadas el tráfico espera y, en el suelo, chocas contra ellas; la
  rampa previa permite saltarlas, pero el tren sí te atropella.
- **Crestas** (Carretera de la Colina): los cambios de rasante bruscos lanzan la moto por el aire.

> Los datos del original se han recordado sin poder contrastarlos con fuentes externas; conviene revisarlos con un
> vídeo _longplay_ o con MAME. Una variante de noche del casco antiguo queda pendiente hasta confirmar si existía
> (en la recreativa no consta; quizá en la versión de PlayStation).

Cada partida elige al azar 2 **obras** (conos que cierran un carril; el tráfico cambia de carril antes de llegar y
atropellar un cono frena la moto) y usa una semilla de tráfico distinta (fija con `?e2e`).

**Puerto Radikal de noche**: mismas calles con iluminación nocturna y faro, más tráfico, 3 obras, rival Nitro y retos
más duros. De noche también se iluminan los demás vehículos (faros con haz en el asfalto, pilotos traseros y ventanillas
de autobuses y tranvías), las farolas (cono y charco de luz), los túneles (luz bajo cada plafón), los escaparates y
rótulos de las tiendas y las ventanas de los edificios. Son luces falsas (formas aditivas con degradado por vértice), sin
coste de luces reales.

**València** (★★★★★, ~3,9 km, 4 carriles, 45 s / +42, +32, +32, +38 s; se desbloquea con 8 ⭐): reparto en plenas
Fallas sobre un trazado sacado de coordenadas reales (lat/lon proyectadas a metros con una escala uniforme de 0,53, así
se conservan ángulos y proporciones). Las esquinas se han situado de memoria (sin contrastar con OpenStreetMap), con un
margen de unos 100 m reales:

1. Av. del Professor López Piñero junto a L'Umbracle, L'Hemisfèric y el Museu de les Ciències.
2. Pont de l'Assut de l'Or (puente elevado con su pilón blanco inclinado) sobre los estanques de la Ciutat de les Arts.
3. Margen norte del Jardí del Túria (0,15–0,65 del recorrido): Palau de les Arts, Passeig de
   l'Albereda, Palau de la Música, La Peineta, Pont del Real y Museu de Belles Arts.
4. Pont de Serrans (sobre el cauce seco) y paso bajo las Torres de Serrans (licencia: en realidad el arco es peatonal).
5. Carrer de Serrans, Plaça de la Mare de Déu (Font del Túria), Plaça de la Reina (Micalet) y Sant Vicent Màrtir.
6. Plaça de l'Ajuntament con una **falla** en el centro (sólida e indestructible; el tráfico pasa por ambos lados),
   el Ajuntament y Correos.
7. Carrer de Xàtiva (Estació del Nord y Plaça de Bous) y Carrer de Colón hasta la Porta de la Mar.

Tiene 8 atajos: pasarela de L'Umbracle, dos caminos de tierra por el Jardí del Túria, callejones de Penya-roja, Barri
del Carme hasta la Plaça Redonda (tiendas), carrerons de Sant Francesc, Carrer de Ribera (tiendas) y Poeta Querol
(tiendas). Los escaparates llevan rótulos locales (MERCAT, ORXATA, FARTONS, FALLES, CERÀMICA). Además: 6 rampas, 5 cajas
de explosivos en la avenida y 3 en atajos, **terrasses** de bar que se derriban como los conos, conos, 3 obras al azar,
autobuses, taxis, furgonetas, camiones, tranvía y rival Nitro. Como las curvas del Túria son casi todas a la izquierda,
la mayoría de los atajos salen por ese lado, y en las rectas del cauce no caben atajos más cortos que la avenida.

## HUD

Tiempo restante (rojo y parpadeante < 10 s), puntuación, distancia al récord, posición y distancia al rival, barra de
progreso con marcas de checkpoint, rival y fantasma, velocímetro analógico con km/h, combo (multiplicador, puntos y
tiempo restante), texto de cada truco, diferencia con el fantasma en cada checkpoint, líneas de velocidad, avisos
centrales (CHECKPOINT / TIEMPO EXTRA / ¡PORRAZO! / ¡SALTO!) y cuenta atrás.

Efectos: chispas al rozar, humo al caer, polvo y temblor de cámara al aterrizar, confeti al cobrar combos grandes,
conos que salen volando. La música sintetizada gana capas (bombo, bajo, charles, arpegio) con la velocidad y el combo y
acelera con ¡DATE PRISA!.

## Próximas iteraciones

- Más repartidores; variante nocturna del casco antiguo (solo si se confirma en el original).
- Peatones.
- Más recorridos y repartidores; variante nocturna del casco antiguo (solo si se confirma en el original).
- Peatones, tranvía, más rivales simultáneos, repeticiones completas / _ghost_ gracias a la simulación determinista.
- Opciones: dirección por inclinación (giroscopio, con permiso en iOS), aceleración automática, modo zurdo,
  reasignación de controles.
- WebKit en CI.
