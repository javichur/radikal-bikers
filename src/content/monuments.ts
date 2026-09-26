/** Landmark buildings of a real city, placed beside the road (scenery only: they never touch the rider). */
export type MonumentKind =
  | 'palauArts'
  | 'hemisferic'
  | 'museuCiencies'
  | 'umbracle'
  | 'assutPylon'
  | 'palauMusica'
  | 'peineta'
  | 'bellesArts'
  | 'torresSerrans'
  | 'fontTuria'
  | 'micalet'
  | 'ajuntament'
  | 'correos'
  | 'estacioNord'
  | 'placaBous'
  | 'portaMar';

export interface MonumentDef {
  readonly kind: MonumentKind;
  /** Radius of the footprint, metres (procedural buildings keep out of it). */
  readonly radius: number;
  /** Straddles the main road over a covered section (a city gate): its footprint leaves the carriageway free. */
  readonly spansRoad?: boolean;
}

export const MONUMENTS: Readonly<Record<MonumentKind, MonumentDef>> = {
  /** Palau de les Arts Reina Sofia: white shell under a steel "feather". */
  palauArts: { kind: 'palauArts', radius: 34 },
  /** L'Hemisfèric: the eye with its eyelid, over a pond. */
  hemisferic: { kind: 'hemisferic', radius: 26 },
  /** Museu de les Ciències: a long row of white concrete ribs. */
  museuCiencies: { kind: 'museuCiencies', radius: 44 },
  /** L'Umbracle: garden walkway under white arches, alongside the avenue. */
  umbracle: { kind: 'umbracle', radius: 28 },
  /** Pont de l'Assut de l'Or: the leaning white pylon of the cable-stayed bridge. */
  assutPylon: { kind: 'assutPylon', radius: 4 },
  /** Palau de la Música: glass vault in the gardens of the old riverbed. */
  palauMusica: { kind: 'palauMusica', radius: 24 },
  /** Pont de l'Exposició, «la Peineta»: a leaning white arch with a comb of ribs. */
  peineta: { kind: 'peineta', radius: 22 },
  /** Museu de Belles Arts: brick college with its blue-tiled dome. */
  bellesArts: { kind: 'bellesArts', radius: 20 },
  /** Torres de Serrans: the gothic city gate, two towers over the street. */
  torresSerrans: { kind: 'torresSerrans', radius: 26, spansRoad: true },
  /** Font del Túria in the Plaça de la Mare de Déu, with the Basílica dels Desamparats behind. */
  fontTuria: { kind: 'fontTuria', radius: 10 },
  /** El Micalet: the octagonal bell tower of the cathedral. */
  micalet: { kind: 'micalet', radius: 12 },
  /** Ajuntament: the town hall façade with its clock tower. */
  ajuntament: { kind: 'ajuntament', radius: 26 },
  /** Edifici de Correus: the post office with its glass dome and crown. */
  correos: { kind: 'correos', radius: 14 },
  /** Estació del Nord: modernist station façade crowned with oranges. */
  estacioNord: { kind: 'estacioNord', radius: 24 },
  /** Plaça de Bous: the neoclassical bullring, rows of brick arches. */
  placaBous: { kind: 'placaBous', radius: 24 },
  /** Porta de la Mar: the triumphal arch in the middle of its roundabout. */
  portaMar: { kind: 'portaMar', radius: 12 },
};

export const MONUMENT_KINDS = Object.keys(MONUMENTS) as MonumentKind[];
