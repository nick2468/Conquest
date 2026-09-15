import type { GameMap, Point, TerritoryDefinition } from '../engine'
import { pathFrom } from './shapes'

/**
 * Australia in detail. Nick's design, plan task 5.0.
 *
 * The states and territories become REGIONS, each divided into several
 * places, and the big cities are playable in their own right.
 *
 * The point of it is measured, not decorative. On the ten-territory map a
 * region is two or three squares, so a plan is never more than one attack
 * from finished and strategy means nothing: the Planner scored 78 to 82
 * against Cautious. On a board this size it wins about six games in ten.
 * See plan task 4.13.
 *
 * Measured again on 2026-09-15, after seven borders were added to this map
 * (plan task 5.12), and the claim holds: the Planner takes 63.9% and 62.8%
 * of 1200 games against Cautious on two seed families, against 62.2% before
 * the borders. The seven changed nothing anyone can measure.
 *
 * The same flat projection as the small map:
 *
 *   x = 150 + (longitude east - 113) * 16.1
 *   y = 120 + (latitude south - 10.7) * 17.63
 *
 * Tasmania is the prize. It has ONE way in, from Melbourne, which makes it
 * the same kind of base that Australia is on a real Risk board: not rich,
 * but cheap to hold and impossible to be surprised in.
 *
 * A city sits INSIDE the place around it and is drawn on top of it. That is
 * deliberate, and it is the one place two shapes are allowed to overlap.
 * Cities are drawn last so they are never hidden.
 */

function at(x: number, y: number): Point {
  return { x, y }
}

interface Place {
  readonly id: string
  readonly name: string
  readonly shortName: string
  readonly regionId: string
  readonly borders: readonly string[]
  readonly corners: ReadonlyArray<readonly [number, number]>
  readonly labelAt: Point
  /** Reachable only by sea. See spec S26. */
  readonly isIsland?: boolean
  /** The place this city is drawn on top of. See spec 3.2. */
  readonly drawnOver?: string
}

const PLACES: readonly Place[] = [
  // ------------------------------------------------- Western Australia (7)
  {
    id: 'kimberley',
    name: 'The Kimberley',
    shortName: 'KIM',
    regionId: 'wa',
    borders: ['pilbara', 'topEnd'],
    corners: [
      [408, 192], [396, 212], [374, 173], [344, 192], [316, 224], [298, 248],
      [408, 248],
    ],
    labelAt: at(360, 222),
  },
  {
    id: 'pilbara',
    name: 'The Pilbara',
    shortName: 'PIL',
    regionId: 'wa',
    borders: ['kimberley', 'gascoyne', 'barkly', 'topEnd'],
    corners: [
      [298, 248], [262, 278], [240, 289], [202, 301], [168, 316], [408, 316],
      [408, 248],
    ],
    labelAt: at(300, 285),
  },
  {
    id: 'gascoyne',
    name: 'The Gascoyne',
    shortName: 'GAS',
    regionId: 'wa',
    borders: [
      'pilbara', 'goldfields', 'southWest', 'redCentre', 'nullarbor',
      'barkly', 'outbackSa',
    ],
    corners: [
      [168, 316], [182, 342], [166, 362], [156, 381], [172, 391], [159, 400],
      [168, 420], [408, 420], [408, 316],
    ],
    labelAt: at(290, 372),
  },
  {
    id: 'goldfields',
    name: 'The Goldfields',
    shortName: 'GLD',
    regionId: 'wa',
    borders: ['gascoyne', 'southWest', 'nullarbor', 'outbackSa'],
    corners: [
      [408, 420], [408, 490], [350, 506], [293, 529], [262, 540], [250, 545],
      [250, 420],
    ],
    labelAt: at(340, 470),
  },
  {
    id: 'southWest',
    name: 'The South West',
    shortName: 'SW',
    regionId: 'wa',
    borders: ['gascoyne', 'goldfields', 'perth'],
    corners: [
      [250, 420], [250, 545], [229, 548], [210, 551], [184, 538], [195, 496],
      [186, 470], [176, 439], [168, 420],
    ],
    labelAt: at(222, 465),
  },
  {
    id: 'perth',
    name: 'Perth',
    shortName: 'PER',
    regionId: 'wa',
    borders: ['southWest', 'rottnest'],
    corners: [[190, 489], [206, 486], [209, 500], [193, 503]],
    labelAt: at(232, 508),
    drawnOver: 'southWest',
  },
  {
    id: 'rottnest',
    name: 'Rottnest Island',
    shortName: 'ROT',
    regionId: 'wa',
    borders: ['perth'],
    corners: [[158, 492], [170, 489], [173, 501], [161, 504]],
    labelAt: at(166, 456),
    isIsland: true,
  },

  // ----------------------------------------------- Northern Territory (5)
  {
    id: 'topEnd',
    name: 'The Top End',
    shortName: 'TOP',
    regionId: 'nt',
    borders: ['kimberley', 'arnhem', 'barkly', 'darwin', 'pilbara'],
    corners: [
      [408, 192], [424, 178], [437, 150], [452, 162], [459, 127], [472, 148],
      [480, 140], [480, 250], [408, 250],
    ],
    labelAt: at(432, 218),
  },
  {
    id: 'darwin',
    name: 'Darwin',
    shortName: 'DAR',
    regionId: 'nt',
    borders: ['topEnd'],
    corners: [[432, 157], [448, 154], [451, 168], [435, 171]],
    labelAt: at(398, 138),
    drawnOver: 'topEnd',
  },
  {
    id: 'arnhem',
    name: 'Arnhem Land',
    shortName: 'ARN',
    regionId: 'nt',
    borders: ['topEnd', 'barkly', 'gulfCountry'],
    corners: [
      [480, 140], [492, 133], [512, 141], [533, 146], [522, 172], [540, 189],
      [553, 225], [553, 250], [480, 250],
    ],
    labelAt: at(514, 200),
  },
  {
    id: 'barkly',
    name: 'The Barkly',
    shortName: 'BAR',
    regionId: 'nt',
    borders: [
      'topEnd', 'arnhem', 'redCentre', 'pilbara', 'gulfCountry', 'gascoyne',
    ],
    corners: [[408, 250], [553, 250], [553, 320], [408, 320]],
    labelAt: at(480, 288),
  },
  {
    id: 'redCentre',
    name: 'The Red Centre',
    shortName: 'RED',
    regionId: 'nt',
    borders: ['barkly', 'gascoyne', 'gulfCountry', 'outbackSa'],
    corners: [[408, 320], [553, 320], [553, 390], [408, 390]],
    labelAt: at(480, 356),
  },

  // ------------------------------------------------------- Queensland (8)
  {
    id: 'capeYork',
    name: 'Cape York',
    shortName: 'CY',
    regionId: 'qld',
    borders: ['gulfCountry', 'farNorth'],
    corners: [
      [607, 214], [613, 178], [619, 150], [625, 120], [638, 152], [648, 168],
      [657, 182], [640, 214],
    ],
    labelAt: at(628, 172),
  },
  {
    id: 'gulfCountry',
    name: 'Gulf Country',
    shortName: 'GULF',
    regionId: 'qld',
    borders: [
      'capeYork', 'farNorth', 'northQld', 'centralQld', 'darlingDowns',
      'barkly', 'redCentre', 'outbackSa', 'arnhem',
    ],
    corners: [
      [553, 222], [575, 236], [598, 243], [607, 214], [640, 214], [640, 390],
      [553, 390],
    ],
    labelAt: at(590, 300),
  },
  {
    id: 'farNorth',
    name: 'Far North Queensland',
    shortName: 'FNQ',
    regionId: 'qld',
    borders: ['capeYork', 'gulfCountry', 'northQld'],
    corners: [
      [640, 214], [657, 182], [668, 205], [678, 229], [688, 252], [640, 280],
    ],
    labelAt: at(662, 240),
  },
  {
    id: 'northQld',
    name: 'North Queensland',
    shortName: 'NQ',
    regionId: 'qld',
    borders: ['farNorth', 'gulfCountry', 'centralQld', 'whitsunday'],
    corners: [
      [640, 280], [688, 252], [694, 272], [715, 288], [733, 303], [640, 330],
    ],
    labelAt: at(684, 296),
  },
  {
    id: 'whitsunday',
    name: 'Whitsunday Islands',
    shortName: 'WHIT',
    regionId: 'qld',
    borders: ['northQld'],
    corners: [[744, 282], [755, 279], [758, 290], [747, 293]],
    labelAt: at(786, 262),
    isIsland: true,
  },
  {
    id: 'centralQld',
    name: 'Central Queensland',
    shortName: 'CQ',
    regionId: 'qld',
    borders: ['northQld', 'gulfCountry', 'brisbane', 'darlingDowns'],
    corners: [
      [640, 330], [733, 303], [745, 325], [754, 344], [775, 361], [796, 377],
      [760, 400], [640, 400],
    ],
    labelAt: at(700, 360),
  },
  {
    id: 'brisbane',
    name: 'Brisbane',
    shortName: 'BNE',
    regionId: 'qld',
    borders: ['centralQld', 'darlingDowns', 'newEngland'],
    corners: [
      [760, 400], [796, 377], [800, 400], [794, 416], [800, 443], [770, 443],
    ],
    labelAt: at(781, 415),
  },
  {
    id: 'darlingDowns',
    name: 'The Darling Downs',
    shortName: 'DD',
    regionId: 'qld',
    borders: [
      'centralQld', 'gulfCountry', 'brisbane', 'farWest', 'newEngland',
      'outbackSa',
    ],
    corners: [
      [601, 390], [640, 390], [640, 400], [760, 400], [770, 443], [601, 443],
    ],
    labelAt: at(672, 424),
  },

  // -------------------------------------------------- South Australia (5)
  {
    id: 'outbackSa',
    name: 'The Far North',
    shortName: 'FN',
    regionId: 'sa',
    borders: [
      'nullarbor', 'eyre', 'riverland', 'adelaide', 'redCentre',
      'gulfCountry', 'gascoyne', 'goldfields', 'darlingDowns', 'farWest',
    ],
    corners: [[408, 390], [601, 390], [601, 470], [408, 470]],
    labelAt: at(500, 430),
  },
  {
    id: 'nullarbor',
    name: 'The Nullarbor',
    shortName: 'NUL',
    regionId: 'sa',
    borders: ['outbackSa', 'eyre', 'gascoyne', 'goldfields'],
    corners: [
      [408, 470], [408, 490], [441, 487], [462, 492], [483, 497], [483, 470],
    ],
    labelAt: at(444, 481),
  },
  {
    id: 'eyre',
    name: 'Eyre Peninsula',
    shortName: 'EYR',
    regionId: 'sa',
    borders: ['nullarbor', 'outbackSa', 'adelaide', 'riverland'],
    corners: [
      [483, 470], [483, 497], [496, 520], [512, 546], [519, 518], [530, 500],
      [543, 498], [543, 470],
    ],
    labelAt: at(510, 490),
  },
  {
    id: 'adelaide',
    name: 'Adelaide',
    shortName: 'ADL',
    regionId: 'sa',
    borders: ['eyre', 'outbackSa', 'riverland'],
    corners: [[558, 533], [574, 530], [577, 544], [561, 547]],
    labelAt: at(536, 584),
    drawnOver: 'riverland',
  },
  {
    id: 'riverland',
    name: 'The Riverland',
    shortName: 'RIV',
    regionId: 'sa',
    borders: ['outbackSa', 'adelaide', 'farWest', 'riverina', 'westVic', 'eyre'],
    corners: [
      [543, 470], [543, 498], [542, 522], [534, 556], [546, 528], [556, 512],
      [564, 516], [566, 546], [578, 566], [588, 582], [601, 602], [601, 470],
    ],
    labelAt: at(588, 476),
  },

  // -------------------------------------------------- New South Wales (6)
  {
    id: 'farWest',
    name: 'The Far West',
    shortName: 'FW',
    regionId: 'nsw',
    borders: [
      'newEngland', 'hunter', 'riverina', 'darlingDowns', 'riverland',
      'outbackSa',
    ],
    corners: [[601, 443], [680, 443], [680, 531], [601, 531]],
    labelAt: at(640, 487),
  },
  {
    id: 'newEngland',
    name: 'New England',
    shortName: 'NE',
    regionId: 'nsw',
    borders: ['farWest', 'hunter', 'darlingDowns', 'brisbane'],
    corners: [[680, 443], [800, 443], [806, 458], [797, 482], [680, 482]],
    labelAt: at(740, 464),
  },
  {
    id: 'hunter',
    name: 'The Hunter',
    shortName: 'HUN',
    regionId: 'nsw',
    borders: ['newEngland', 'farWest', 'sydney', 'riverina'],
    corners: [[680, 482], [797, 482], [780, 505], [765, 530], [680, 530]],
    labelAt: at(706, 496),
  },
  {
    id: 'sydney',
    name: 'Sydney',
    shortName: 'SYD',
    regionId: 'nsw',
    borders: ['hunter'],
    corners: [[754, 506], [770, 503], [773, 517], [757, 520]],
    labelAt: at(800, 500),
    drawnOver: 'hunter',
  },
  {
    id: 'riverina',
    name: 'The Riverina',
    shortName: 'RNA',
    regionId: 'nsw',
    borders: [
      'farWest', 'hunter', 'act', 'riverland', 'murray', 'gippsland',
    ],
    // The two corners at x=680 are not decoration. The Far West sits above
    // the western half of this northern edge and The Hunter above the
    // eastern half, and their southern edges are one unit apart. One
    // straight line cannot follow both, so it cut half a unit into The Far
    // West. Invisible on screen, and a real overlap. Found by the guard in
    // plan task 2.2.8 on the day the guard was written.
    corners: [
      [601, 531], [680, 531], [680, 530], [765, 530], [744, 593], [640, 545],
    ],
    labelAt: at(646, 546),
  },
  {
    id: 'act',
    name: 'Canberra',
    shortName: 'ACT',
    regionId: 'nsw',
    borders: ['riverina'],
    corners: [[704, 546], [720, 543], [723, 557], [707, 560]],
    labelAt: at(762, 552),
    drawnOver: 'riverina',
  },

  // --------------------------------------------------------- Victoria (4)
  {
    id: 'westVic',
    name: 'Western Victoria',
    shortName: 'WV',
    regionId: 'vic',
    borders: ['murray', 'melbourne', 'riverland'],
    corners: [
      [601, 531], [660, 555], [660, 614], [642, 618], [622, 612], [611, 607],
      [601, 602],
    ],
    labelAt: at(620, 586),
  },
  {
    id: 'murray',
    name: 'The Murray',
    shortName: 'MUR',
    regionId: 'vic',
    borders: ['westVic', 'gippsland', 'melbourne', 'riverina'],
    corners: [[660, 555], [744, 593], [705, 592], [660, 592]],
    labelAt: at(676, 570),
  },
  {
    id: 'melbourne',
    name: 'Melbourne',
    shortName: 'MEL',
    regionId: 'vic',
    borders: ['westVic', 'murray', 'gippsland', 'launceston'],
    corners: [[657, 597], [673, 594], [676, 608], [660, 611]],
    labelAt: at(614, 626),
    drawnOver: 'westVic',
  },
  {
    id: 'gippsland',
    name: 'Gippsland',
    shortName: 'GIP',
    regionId: 'vic',
    borders: ['murray', 'melbourne', 'riverina'],
    corners: [
      [705, 592], [744, 593], [722, 607], [700, 618], [689, 621], [676, 604],
      [680, 592],
    ],
    labelAt: at(704, 604),
  },

  // -------------------------------------------------------- Tasmania (3)
  {
    id: 'westCoast',
    name: 'The West Coast',
    shortName: 'WC',
    regionId: 'tas',
    borders: ['launceston', 'hobart'],
    corners: [[640, 656], [672, 649], [672, 713], [652, 715], [632, 690]],
    labelAt: at(652, 684),
    isIsland: true,
  },
  {
    id: 'launceston',
    name: 'Launceston',
    shortName: 'LST',
    regionId: 'tas',
    borders: ['westCoast', 'hobart', 'melbourne'],
    corners: [[672, 649], [730, 645], [738, 669], [672, 673]],
    labelAt: at(690, 656),
    isIsland: true,
  },
  {
    id: 'hobart',
    name: 'Hobart',
    shortName: 'HOB',
    regionId: 'tas',
    borders: ['westCoast', 'launceston'],
    corners: [
      [672, 673], [738, 669], [731, 700], [710, 716], [688, 716], [672, 713],
    ],
    labelAt: at(716, 694),
    isIsland: true,
  },
]

function toTerritory(place: Place): TerritoryDefinition {
  return {
    id: place.id,
    name: place.name,
    shortName: place.shortName,
    regionId: place.regionId,
    borders: place.borders,
    shape: pathFrom(place.corners),
    labelAt: place.labelAt,
    // Said only when true. A place that carries "isIsland: false" and
    // "drawnOver: undefined" is not the same shape of thing as one that
    // carries neither, and the round trip through a map file would then
    // fail on maps that are the same in every way that matters.
    ...(place.isIsland === true ? { isIsland: true } : {}),
    ...(place.drawnOver === undefined ? {} : { drawnOver: place.drawnOver }),
  }
}

export const AUSTRALIA_BIG: GameMap = {
  id: 'australia-big',
  name: 'Australia in detail',
  // Taller than the small map's box, because Tasmania is drawn bigger here
  // and its names need room below it. A name sits 30 units under its count,
  // so the box has to reach past the southernmost label, not the coast.
  viewBox: '136 100 690 648',

  /**
   * The states and territories, as regions.
   *
   * The bonus follows how hard each is to hold rather than how big it is.
   * Tasmania is small and pays little, but it has ONE way in, which makes
   * it the best base on the board. That is the Australia of a real Risk
   * game, and it is meant to be.
   */
  regions: [
    { id: 'wa', name: 'Western Australia', bonus: 5, outline: '#b8763a' },
    { id: 'nt', name: 'Northern Territory', bonus: 3, outline: '#c2544a' },
    { id: 'qld', name: 'Queensland', bonus: 5, outline: '#3f8f5e' },
    { id: 'sa', name: 'South Australia', bonus: 3, outline: '#7a4f9c' },
    { id: 'nsw', name: 'New South Wales', bonus: 4, outline: '#3a6ea8' },
    { id: 'vic', name: 'Victoria', bonus: 3, outline: '#2f7f8f' },
    { id: 'tas', name: 'Tasmania', bonus: 2, outline: '#8a7326' },
  ],

  territories: PLACES.map(toTerritory),
}
