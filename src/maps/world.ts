import type { GameMap, Point, TerritoryDefinition } from '../engine'
import { pathFrom } from './shapes'

/**
 * The world. Nick's request, plan task 5.8.
 *
 * Forty-two places in six continents, which is the shape of board the
 * classic war game uses. The names are the names of real places and the
 * layout is the one everybody who has played that game already knows, so
 * nobody has to learn a new world before they can play. The drawing is our
 * own. It is not a copy of anybody's artwork, and the game is Conquest.
 *
 * **Asia pays 7 and is nearly impossible to hold.** Twelve places and
 * five ways in. Australia pays 2, has four places and ONE way in, from Siam
 * to Indonesia. That is the same lesson the detailed Australia map teaches
 * with Tasmania, and it is why the small continents are worth having: a
 * bonus you can keep beats a bigger one you cannot.
 *
 * **How it is drawn.** Borders inside a continent are straight lines, and
 * the two places either side share those exact corners. Only the coasts
 * wander. That is how the real board looks, and it is the only way to be
 * sure no two places claim the same ground. The guards of spec 3.2 check
 * it on every test run.
 *
 * A crossing over water is a border like any other, and there are many:
 * Alaska to Kamchatka, Brazil to North Africa, Siam to Indonesia. The
 * shapes cannot show those, so they are written down.
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
  readonly isIsland?: boolean
}

const PLACES: readonly Place[] = [
  // ------------------------------------------------- North America (9)
  {
    id: 'alaska',
    name: 'Alaska',
    shortName: 'ALK',
    regionId: 'northAmerica',
    borders: ['northwestTerritory', 'alberta', 'kamchatka'],
    corners: [
      [120, 70], [120, 130], [95, 130], [78, 122], [62, 128], [48, 110],
      [52, 88], [70, 72], [95, 64],
    ],
    labelAt: at(88, 100),
  },
  {
    id: 'northwestTerritory',
    name: 'Northwest Territory',
    shortName: 'NWT',
    regionId: 'northAmerica',
    borders: ['alaska', 'alberta', 'ontario', 'greenland'],
    corners: [
      [120, 70], [150, 58], [190, 54], [228, 62], [250, 74], [250, 130],
      [120, 130],
    ],
    labelAt: at(185, 96),
  },
  {
    id: 'greenland',
    name: 'Greenland',
    shortName: 'GRN',
    regionId: 'northAmerica',
    borders: ['northwestTerritory', 'ontario', 'quebec', 'iceland'],
    corners: [
      [285, 45], [330, 50], [350, 72], [344, 104], [318, 128], [292, 120],
      [272, 96], [270, 66],
    ],
    labelAt: at(310, 88),
    isIsland: true,
  },
  {
    id: 'alberta',
    name: 'Alberta',
    shortName: 'ALB',
    regionId: 'northAmerica',
    borders: ['alaska', 'northwestTerritory', 'ontario', 'westernUnitedStates'],
    corners: [
      [95, 130], [175, 130], [175, 195], [95, 195], [86, 170], [93, 148],
    ],
    labelAt: at(133, 163),
  },
  {
    id: 'ontario',
    name: 'Ontario',
    shortName: 'ONT',
    regionId: 'northAmerica',
    borders: [
      'northwestTerritory', 'alberta', 'greenland', 'quebec',
      'westernUnitedStates', 'easternUnitedStates',
    ],
    corners: [[175, 130], [255, 130], [255, 195], [175, 195]],
    labelAt: at(215, 163),
  },
  {
    id: 'quebec',
    name: 'Quebec',
    shortName: 'QUE',
    regionId: 'northAmerica',
    borders: ['greenland', 'ontario', 'easternUnitedStates'],
    corners: [
      [255, 135], [300, 132], [330, 150], [326, 182], [300, 200], [255, 200],
    ],
    labelAt: at(292, 168),
  },
  {
    id: 'westernUnitedStates',
    name: 'Western United States',
    shortName: 'WUS',
    regionId: 'northAmerica',
    borders: [
      'alberta', 'ontario', 'easternUnitedStates', 'centralAmerica',
    ],
    corners: [
      [95, 195], [175, 195], [175, 265], [130, 265], [110, 245], [90, 220],
    ],
    labelAt: at(132, 228),
  },
  {
    id: 'easternUnitedStates',
    name: 'Eastern United States',
    shortName: 'EUS',
    regionId: 'northAmerica',
    borders: [
      'ontario', 'quebec', 'westernUnitedStates', 'centralAmerica',
    ],
    corners: [
      [175, 195], [255, 195], [255, 200], [248, 232], [228, 258], [205, 265],
      [175, 265],
    ],
    labelAt: at(212, 226),
  },
  {
    id: 'centralAmerica',
    name: 'Central America',
    shortName: 'CAM',
    regionId: 'northAmerica',
    borders: ['westernUnitedStates', 'easternUnitedStates', 'venezuela'],
    corners: [
      [130, 265], [205, 265], [196, 290], [176, 308], [152, 318], [136, 300],
      [128, 282],
    ],
    labelAt: at(166, 288),
  },

  // ------------------------------------------------- South America (4)
  {
    id: 'venezuela',
    name: 'Venezuela',
    shortName: 'VEN',
    regionId: 'southAmerica',
    borders: ['centralAmerica', 'brazil', 'peru'],
    corners: [
      [212, 335], [248, 330], [272, 344], [280, 368], [280, 390], [200, 390],
      [198, 362],
    ],
    labelAt: at(240, 364),
  },
  {
    id: 'peru',
    name: 'Peru',
    shortName: 'PER',
    regionId: 'southAmerica',
    borders: ['venezuela', 'brazil', 'argentina'],
    corners: [
      [200, 390], [255, 390], [255, 470], [210, 470], [204, 440], [196, 414],
    ],
    labelAt: at(228, 430),
  },
  {
    id: 'brazil',
    name: 'Brazil',
    shortName: 'BRA',
    regionId: 'southAmerica',
    borders: ['venezuela', 'peru', 'argentina', 'northAfrica'],
    corners: [
      [255, 390], [280, 390], [330, 406], [326, 442], [300, 468], [276, 480],
      [255, 480],
    ],
    labelAt: at(292, 432),
  },
  {
    id: 'argentina',
    name: 'Argentina',
    shortName: 'ARG',
    regionId: 'southAmerica',
    borders: ['peru', 'brazil'],
    corners: [
      [210, 470], [255, 470], [255, 480], [246, 516], [232, 548], [218, 556],
      [208, 520],
    ],
    labelAt: at(232, 508),
  },

  // ------------------------------------------------------- Europe (7)
  {
    id: 'iceland',
    name: 'Iceland',
    shortName: 'ICE',
    regionId: 'europe',
    borders: ['greenland', 'greatBritain', 'scandinavia'],
    corners: [[378, 98], [404, 94], [412, 112], [398, 130], [378, 124]],
    labelAt: at(394, 76),
    isIsland: true,
  },
  {
    id: 'greatBritain',
    name: 'Great Britain',
    shortName: 'GBR',
    regionId: 'europe',
    borders: ['iceland', 'scandinavia', 'northernEurope', 'westernEurope'],
    corners: [
      [386, 152], [406, 148], [416, 168], [406, 192], [388, 190], [380, 170],
    ],
    labelAt: at(370, 210),
    isIsland: true,
  },
  {
    id: 'scandinavia',
    name: 'Scandinavia',
    shortName: 'SCA',
    regionId: 'europe',
    borders: ['iceland', 'greatBritain', 'northernEurope', 'ukraine'],
    corners: [
      [432, 96], [452, 74], [478, 72], [490, 88], [490, 140], [430, 140],
      [426, 116],
    ],
    labelAt: at(458, 110),
  },
  {
    id: 'ukraine',
    name: 'Ukraine',
    shortName: 'UKR',
    regionId: 'europe',
    borders: [
      'scandinavia', 'northernEurope', 'southernEurope', 'ural',
      'afghanistan', 'middleEast',
    ],
    corners: [
      [490, 88], [512, 70], [544, 66], [570, 75], [570, 200], [490, 200],
    ],
    labelAt: at(530, 140),
  },
  {
    id: 'northernEurope',
    name: 'Northern Europe',
    shortName: 'NEU',
    regionId: 'europe',
    borders: [
      'scandinavia', 'greatBritain', 'ukraine', 'southernEurope',
      'westernEurope',
    ],
    corners: [[430, 140], [490, 140], [490, 200], [430, 200]],
    labelAt: at(460, 170),
  },
  {
    id: 'westernEurope',
    name: 'Western Europe',
    shortName: 'WEU',
    regionId: 'europe',
    borders: [
      'greatBritain', 'northernEurope', 'southernEurope', 'northAfrica',
    ],
    corners: [
      [430, 200], [455, 200], [455, 260], [430, 258], [408, 242], [400, 218],
      [412, 202],
    ],
    labelAt: at(428, 228),
  },
  {
    id: 'southernEurope',
    name: 'Southern Europe',
    shortName: 'SEU',
    regionId: 'europe',
    borders: [
      'westernEurope', 'northernEurope', 'ukraine', 'middleEast', 'egypt',
      'northAfrica',
    ],
    corners: [
      [455, 200], [520, 200], [516, 232], [496, 256], [470, 260], [455, 260],
    ],
    labelAt: at(486, 226),
  },

  // ------------------------------------------------------- Africa (6)
  {
    id: 'northAfrica',
    name: 'North Africa',
    shortName: 'NAF',
    regionId: 'africa',
    borders: [
      'westernEurope', 'southernEurope', 'egypt', 'eastAfrica', 'congo',
      'brazil',
    ],
    corners: [
      [412, 302], [448, 298], [500, 300], [500, 390], [440, 390], [420, 366],
      [404, 334],
    ],
    labelAt: at(452, 342),
  },
  {
    id: 'egypt',
    name: 'Egypt',
    shortName: 'EGY',
    regionId: 'africa',
    borders: ['northAfrica', 'southernEurope', 'middleEast', 'eastAfrica'],
    corners: [[500, 300], [548, 302], [555, 326], [555, 360], [500, 360]],
    labelAt: at(527, 330),
  },
  {
    id: 'eastAfrica',
    name: 'East Africa',
    shortName: 'EAF',
    regionId: 'africa',
    borders: [
      'egypt', 'northAfrica', 'congo', 'southAfrica', 'madagascar',
      'middleEast',
    ],
    corners: [
      [500, 360], [555, 360], [560, 392], [556, 430], [530, 460], [500, 460],
    ],
    labelAt: at(528, 408),
  },
  {
    id: 'congo',
    name: 'Congo',
    shortName: 'CON',
    regionId: 'africa',
    borders: ['northAfrica', 'eastAfrica', 'southAfrica'],
    corners: [[440, 390], [500, 390], [500, 460], [450, 460], [436, 428]],
    labelAt: at(470, 426),
  },
  {
    id: 'southAfrica',
    name: 'South Africa',
    shortName: 'SAF',
    regionId: 'africa',
    borders: ['congo', 'eastAfrica', 'madagascar'],
    corners: [
      [450, 460], [530, 460], [524, 496], [500, 522], [472, 526], [454, 498],
    ],
    labelAt: at(490, 488),
  },
  {
    id: 'madagascar',
    name: 'Madagascar',
    shortName: 'MAD',
    regionId: 'africa',
    borders: ['southAfrica', 'eastAfrica'],
    corners: [[548, 472], [566, 468], [572, 492], [560, 512], [548, 500]],
    labelAt: at(596, 492),
    isIsland: true,
  },

  // --------------------------------------------------------- Asia (12)
  {
    id: 'ural',
    name: 'Ural',
    shortName: 'URA',
    regionId: 'asia',
    borders: ['ukraine', 'siberia', 'china', 'afghanistan'],
    corners: [[570, 75], [604, 66], [640, 72], [640, 190], [570, 190]],
    labelAt: at(604, 132),
  },
  {
    id: 'siberia',
    name: 'Siberia',
    shortName: 'SIB',
    regionId: 'asia',
    borders: ['ural', 'yakutsk', 'irkutsk', 'mongolia', 'china'],
    corners: [[640, 72], [676, 58], [715, 60], [715, 190], [640, 190]],
    labelAt: at(678, 128),
  },
  {
    id: 'yakutsk',
    name: 'Yakutsk',
    shortName: 'YAK',
    regionId: 'asia',
    borders: ['siberia', 'irkutsk', 'kamchatka'],
    corners: [[715, 60], [752, 50], [790, 55], [790, 130], [715, 130]],
    labelAt: at(752, 94),
  },
  {
    id: 'irkutsk',
    name: 'Irkutsk',
    shortName: 'IRK',
    regionId: 'asia',
    borders: ['siberia', 'yakutsk', 'kamchatka', 'mongolia'],
    corners: [[715, 130], [790, 130], [790, 190], [715, 190]],
    labelAt: at(752, 160),
  },
  {
    id: 'kamchatka',
    name: 'Kamchatka',
    shortName: 'KAM',
    regionId: 'asia',
    borders: ['yakutsk', 'irkutsk', 'mongolia', 'japan', 'alaska'],
    corners: [
      [790, 55], [830, 48], [862, 64], [870, 110], [856, 152], [830, 178],
      [800, 190], [790, 190],
    ],
    labelAt: at(828, 116),
  },
  {
    id: 'mongolia',
    name: 'Mongolia',
    shortName: 'MON',
    regionId: 'asia',
    borders: ['siberia', 'irkutsk', 'kamchatka', 'japan', 'china'],
    corners: [
      [715, 190], [800, 190], [796, 224], [772, 250], [740, 255], [715, 255],
    ],
    labelAt: at(754, 218),
  },
  {
    id: 'japan',
    name: 'Japan',
    shortName: 'JAP',
    regionId: 'asia',
    borders: ['mongolia', 'kamchatka'],
    corners: [
      [888, 192], [912, 188], [924, 212], [912, 240], [894, 236], [886, 214],
    ],
    labelAt: at(905, 264),
    isIsland: true,
  },
  {
    id: 'afghanistan',
    name: 'Afghanistan',
    shortName: 'AFG',
    regionId: 'asia',
    borders: ['ukraine', 'ural', 'china', 'india', 'middleEast'],
    corners: [[570, 190], [640, 190], [640, 250], [570, 250]],
    labelAt: at(605, 220),
  },
  {
    id: 'china',
    name: 'China',
    shortName: 'CHI',
    regionId: 'asia',
    borders: ['siberia', 'ural', 'afghanistan', 'india', 'siam', 'mongolia'],
    corners: [[640, 190], [715, 190], [715, 270], [640, 270]],
    labelAt: at(678, 230),
  },
  {
    id: 'middleEast',
    name: 'Middle East',
    shortName: 'MEA',
    regionId: 'asia',
    borders: [
      'ukraine', 'southernEurope', 'egypt', 'eastAfrica', 'afghanistan',
      'india',
    ],
    corners: [
      [570, 250], [640, 250], [640, 320], [596, 344], [555, 340], [555, 270],
    ],
    labelAt: at(598, 288),
  },
  {
    id: 'india',
    name: 'India',
    shortName: 'IND',
    regionId: 'asia',
    borders: ['middleEast', 'afghanistan', 'china', 'siam'],
    corners: [
      [640, 270], [710, 270], [710, 330], [690, 344], [668, 334], [640, 320],
    ],
    labelAt: at(674, 302),
  },
  {
    id: 'siam',
    name: 'Siam',
    shortName: 'SIA',
    regionId: 'asia',
    borders: ['india', 'china', 'indonesia'],
    corners: [
      [710, 270], [715, 270], [748, 282], [762, 308], [748, 330], [710, 330],
    ],
    labelAt: at(736, 304),
  },

  // ---------------------------------------------------- Australia (4)
  {
    id: 'indonesia',
    name: 'Indonesia',
    shortName: 'INO',
    regionId: 'australiaRegion',
    borders: ['siam', 'newGuinea', 'westernAustralia'],
    corners: [
      [792, 412], [826, 400], [850, 414], [844, 440], [812, 450], [790, 436],
    ],
    labelAt: at(820, 426),
    isIsland: true,
  },
  {
    id: 'newGuinea',
    name: 'New Guinea',
    shortName: 'NGU',
    regionId: 'australiaRegion',
    borders: ['indonesia', 'westernAustralia', 'easternAustralia'],
    corners: [[866, 398], [902, 394], [916, 412], [900, 432], [872, 426]],
    labelAt: at(890, 372),
    isIsland: true,
  },
  {
    id: 'westernAustralia',
    name: 'Western Australia',
    shortName: 'WAU',
    regionId: 'australiaRegion',
    borders: ['indonesia', 'newGuinea', 'easternAustralia'],
    corners: [
      [800, 470], [865, 465], [865, 540], [836, 548], [804, 534], [788, 504],
    ],
    labelAt: at(828, 506),
  },
  {
    id: 'easternAustralia',
    name: 'Eastern Australia',
    shortName: 'EAU',
    regionId: 'australiaRegion',
    borders: ['westernAustralia', 'newGuinea'],
    corners: [
      [865, 465], [912, 470], [940, 500], [928, 536], [896, 548], [865, 540],
    ],
    labelAt: at(898, 504),
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
    ...(place.isIsland === true ? { isIsland: true } : {}),
  }
}

export const WORLD: GameMap = {
  id: 'world',
  name: 'World',
  // Fitted to what is actually drawn: the shapes run x 48..940 and y
  // 45..556, and a name hangs 30 below its count, so the box has to reach
  // past the southernmost name rather than the southernmost coast.
  viewBox: '30 30 930 560',

  /**
   * What each continent pays for holding it.
   *
   * These are the numbers the classic board uses, and they are worth
   * keeping because they are balanced against the number of ways in, not
   * against size. Asia pays the most and almost nobody holds it. Australia
   * pays the least and wins games.
   */
  regions: [
    { id: 'northAmerica', name: 'North America', bonus: 5, outline: '#b8763a' },
    { id: 'southAmerica', name: 'South America', bonus: 2, outline: '#3f8f5e' },
    { id: 'europe', name: 'Europe', bonus: 5, outline: '#3a6ea8' },
    { id: 'africa', name: 'Africa', bonus: 3, outline: '#8557a8' },
    { id: 'asia', name: 'Asia', bonus: 7, outline: '#c2544a' },
    { id: 'australiaRegion', name: 'Australia', bonus: 2, outline: '#2f7f8f' },
  ],

  territories: PLACES.map(toTerritory),
}
