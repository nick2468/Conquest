import type { GameMap, Point, TerritoryDefinition } from '../engine'
import { pathFrom } from './shapes'

/**
 * The world. Nick's request, plan task 5.8.
 *
 * WRITTEN BY A TOOL. Do not change the shapes by hand: run
 * `node tools/make-world-map.mjs` instead. Everything a person decides
 * lives in `tools/world-cells.json`: the names, the continents, who
 * borders whom, and the straight-sided cell each place is cut from.
 *
 * **The coasts are real and the inland borders are ours.** The coastlines
 * come from Natural Earth, which is public domain and asks for nothing at
 * all, not even credit. Each place is the land inside a cell we drew, so a
 * coast wanders and a border between two places runs in a line. That is how
 * the world looks and how the classic board looks.
 *
 * Forty-two places in six continents, the layout anybody who has played
 * that board already knows.
 *
 * **Asia pays 7 and is nearly impossible to hold.** Twelve places and five
 * ways in. Australia pays 2, has four places and ONE way in, from Siam to
 * Indonesia. A bonus you can keep beats a bigger one you cannot.
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
  // --------------------------------------------- North America (9)
  {
    id: 'alaska',
    name: 'Alaska',
    shortName: 'ALK',
    regionId: 'northAmerica',
    borders: [
      'northwestTerritory',
      'alberta',
      'kamchatka',
    ],
    corners: [
      [101.4, 98.8], [85.5, 94.6], [73.5, 100.2], [76.4, 93.3], [67.6, 99.6], [69.5, 101.2],
      [67, 103.5], [56.1, 110.5], [39.6, 115.7], [57.9, 105.4], [59.7, 101], [46.9, 101.8],
      [47.1, 98.7], [42.1, 98.2], [36.1, 92.6], [40.1, 87.3], [50, 85.3], [48.1, 83.2],
      [50, 81.9], [39.1, 83], [30.9, 79.1], [40.4, 76.1], [47.6, 77.6], [34.4, 70.3],
      [60.9, 60.6], [101.4, 66.8],
    ],
    labelAt: at(66, 79),
  },
  {
    id: 'northwestTerritory',
    name: 'Northwest Territory',
    shortName: 'NWT',
    regionId: 'northAmerica',
    borders: [
      'alaska',
      'alberta',
      'ontario',
      'greenland',
    ],
    corners: [
      [101.4, 66.8], [113.1, 68.6], [134.8, 63.4], [141, 66.7], [144.5, 64.5], [144.8, 67],
      [152.2, 65.7], [168.4, 68.6], [171.9, 70.2], [168.2, 71.8], [184.9, 73.5], [187.7, 71.9],
      [185.1, 70.5], [186.8, 69.4], [192, 68.9], [202.8, 72.2], [202.8, 97.5], [101.4, 97.5],
    ],
    labelAt: at(128, 82),
  },
  {
    id: 'greenland',
    name: 'Greenland',
    shortName: 'GRN',
    regionId: 'northAmerica',
    borders: [
      'northwestTerritory',
      'ontario',
      'quebec',
      'iceland',
    ],
    corners: [
      [397.5, 21.1], [413.8, 23.6], [386.4, 25.9], [408.5, 25.7], [410.6, 26.9], [407.8, 28.8],
      [427, 26.3], [436.3, 28.3], [415.9, 31.9], [421.9, 32.1], [416.8, 36.6], [416.8, 40.2],
      [420, 42.3], [411.6, 43.5], [416.4, 45.2], [417, 47.9], [414.3, 48.2], [417.6, 51],
      [406.7, 54.3], [410, 57.9], [403.5, 57.4], [411.4, 62.8], [401.6, 60.3], [402.5, 62.6],
      [399.5, 64.3], [409.9, 64.6], [364.5, 79.8], [356.7, 88.8], [357.7, 91.3], [355.2, 97.2],
      [342.5, 94.7], [333.8, 85.8], [333.7, 85.7], [327.7, 74.1], [335.7, 65.2], [325.8, 66.3],
      [326.7, 62.3], [334.4, 63.1], [322.8, 59.6], [325.7, 56.6], [317.2, 48.5], [317.2, 25.9],
      [337, 24.6], [352.2, 27.1], [346.4, 24], [355.1, 22],
    ],
    labelAt: at(369, 49),
    isIsland: true,
  },
  {
    id: 'alberta',
    name: 'Alberta',
    shortName: 'ALB',
    regionId: 'northAmerica',
    borders: [
      'alaska',
      'northwestTerritory',
      'ontario',
      'westernUnitedStates',
    ],
    corners: [
      [144.7, 139.8], [143.8, 135.9], [147.9, 136.4], [149.3, 139.4], [148.6, 133.2], [136.7, 127.3],
      [135.6, 122.4], [132.3, 121], [119.4, 103.6], [101.4, 98.8], [101.4, 97.5], [202.8, 97.5],
      [202.8, 139.8],
    ],
    labelAt: at(166, 119),
  },
  {
    id: 'ontario',
    name: 'Ontario',
    shortName: 'ONT',
    regionId: 'northAmerica',
    borders: [
      'northwestTerritory',
      'alberta',
      'greenland',
      'quebec',
      'westernUnitedStates',
      'easternUnitedStates',
    ],
    corners: [
      [232.6, 66.6], [232.6, 70], [236, 67.4], [240.9, 74.1], [245.5, 69], [245.6, 65.4],
      [253.2, 66.1], [256.7, 67.7], [254.9, 71.1], [256.7, 72.8], [251.3, 76.7], [245, 76.2],
      [241, 82], [225.8, 90.9], [221.8, 100.9], [225.6, 101.5], [228, 107], [254.1, 113.3],
      [254.5, 119.3], [260.2, 126.1], [262.6, 123], [262.6, 119.5], [260.4, 114.8], [262.6, 113.3],
      [262.6, 139.8], [202.8, 139.8], [202.8, 72.2], [204.2, 72.6], [212, 72.2], [214.1, 69.6],
      [218.1, 70.7], [218.1, 73.8], [223, 68], [217.2, 64.7], [217.4, 61.1], [220.5, 58.8],
      [226.5, 60.7], [230, 64.4], [227.7, 66],
    ],
    labelAt: at(221, 124),
  },
  {
    id: 'quebec',
    name: 'Quebec',
    shortName: 'QUE',
    regionId: 'northAmerica',
    borders: [
      'greenland',
      'ontario',
      'easternUnitedStates',
    ],
    corners: [
      [262.6, 123], [263.6, 121.7], [262.6, 119.5], [262.6, 113.3], [269, 108.8], [263.9, 101.4],
      [266.9, 98], [264.9, 90], [276, 89.6], [287.1, 94.1], [287.9, 100.9], [292.1, 103.3],
      [300.1, 96.4], [308.4, 107.4], [307.3, 109.4], [317.2, 114.1], [317.2, 126.3], [311.9, 129.2],
      [295.4, 129.3], [283.8, 139.8], [284.3, 139.8], [298.9, 132.5], [301.2, 134.1], [298.7, 136.3],
      [299.7, 139.8], [310.6, 139.8], [310.7, 139.7], [310.7, 139.8], [262.6, 139.8],
    ],
    labelAt: at(283, 118),
  },
  {
    id: 'westernUnitedStates',
    name: 'Western United States',
    shortName: 'WUS',
    regionId: 'northAmerica',
    borders: [
      'alberta',
      'ontario',
      'easternUnitedStates',
      'centralAmerica',
    ],
    corners: [
      [177.7, 198], [171.9, 189.9], [169.6, 189.2], [169.8, 194.5], [171.4, 196.9], [169.5, 196.6],
      [163, 185.1], [154.4, 180], [144.6, 161.5], [145.9, 144.5], [144.7, 139.8], [202.8, 139.8],
      [202.8, 202.2],
    ],
    labelAt: at(178, 165),
  },
  {
    id: 'easternUnitedStates',
    name: 'Eastern United States',
    shortName: 'EUS',
    regionId: 'northAmerica',
    borders: [
      'ontario',
      'quebec',
      'westernUnitedStates',
      'centralAmerica',
    ],
    corners: [
      [283.8, 139.8], [283.1, 140.3], [284.3, 139.8], [299.7, 139.8], [300.4, 142.2], [308, 143.4],
      [310.6, 139.8], [310.7, 139.8], [312.5, 143.3], [298.1, 151], [296, 148], [300.5, 145.3],
      [293.4, 145.8], [284.2, 152.7], [286.1, 157.2], [276.4, 159.5], [280.9, 159.5], [275.7, 160.1],
      [273.2, 165.9], [271.6, 164.1], [272.9, 167.7], [270.6, 171.5], [269.5, 165.3], [269.5, 168.7],
      [267.9, 168.2], [271.1, 177], [256.5, 190.3], [259.9, 205.1], [259, 210.6], [255.6, 208.4],
      [249.3, 194.7], [236.1, 194], [236, 197.3], [233.6, 197.9], [224, 195.9], [216.9, 200.5],
      [214.8, 203.5], [214.8, 204.1], [202.8, 202.2], [202.8, 139.8],
    ],
    labelAt: at(232, 168),
  },
  {
    id: 'centralAmerica',
    name: 'Central America',
    shortName: 'CAM',
    regionId: 'northAmerica',
    borders: [
      'westernUnitedStates',
      'easternUnitedStates',
      'venezuela',
    ],
    corners: [
      [214.8, 204], [213.5, 219.6], [217.6, 229.7], [222.5, 233.5], [228.7, 231.7], [232, 229.8],
      [233.3, 224.3], [241.7, 222.5], [236.8, 240.9], [251.1, 242.9], [250.1, 256.4], [256.3, 263.9],
      [261.1, 261.3], [266, 263.4], [269.8, 262], [273.2, 256.5], [281.4, 252.1], [283, 253.1],
      [280.9, 255.4], [281.1, 257.6], [282.3, 257.2], [282.4, 256.9], [286.1, 253], [287.9, 255],
      [263.1, 264.6], [261.1, 263.5], [259.7, 265.9], [255.5, 267.5], [245.3, 260.2], [240.5, 249.3],
      [230.8, 247.2], [221.8, 239.8], [217, 241.6], [198.9, 233.1], [193.7, 227.7], [192.3, 218.5],
      [177.6, 197.9], [171.3, 196.8], [183.5, 216.6], [181.9, 218.3], [176.3, 212.1], [176, 208],
      [168.9, 202.4], [171.2, 199.7], [169.4, 196.5],
    ],
    labelAt: at(201, 213),
  },
  // --------------------------------------------- South America (4)
  {
    id: 'venezuela',
    name: 'Venezuela',
    shortName: 'VEN',
    regionId: 'southAmerica',
    borders: [
      'centralAmerica',
      'brazil',
      'peru',
    ],
    corners: [
      [266, 263.4], [268.2, 264.4], [269.8, 262], [281.1, 257.6], [281.6, 263], [282.3, 257.2],
      [287.9, 255], [290.7, 258.2], [299.3, 259.7], [307.1, 257.7], [305.8, 260.2], [319.4, 273.1],
      [327.7, 273.8], [334.6, 278.8], [338.1, 286.9], [337, 292.8], [341.6, 293.3], [341.7, 296.5],
      [343.7, 294.4], [351.2, 297.5], [351.6, 299], [257.5, 299], [257.6, 295.9], [267.5, 280],
      [264.7, 265.5], [263.1, 264.6], [259.7, 265.9], [257.7, 269], [255.5, 267.5],
    ],
    labelAt: at(294, 278),
  },
  {
    id: 'peru',
    name: 'Peru',
    shortName: 'PER',
    regionId: 'southAmerica',
    borders: [
      'venezuela',
      'brazil',
      'argentina',
    ],
    corners: [
      [284.5, 370.5], [285.6, 356.7], [282.2, 348.9], [270.4, 340.1], [260.6, 315.9], [256.8, 312.4],
      [256.3, 307.9], [260.6, 301.1], [257.5, 299.8], [257.5, 299], [312, 299], [312, 370.5],
    ],
    labelAt: at(288, 323),
  },
  {
    id: 'brazil',
    name: 'Brazil',
    shortName: 'BRA',
    regionId: 'southAmerica',
    borders: [
      'venezuela',
      'peru',
      'argentina',
      'northAfrica',
    ],
    corners: [
      [351.6, 299], [352.1, 301.2], [364.1, 301.8], [375.4, 309.2], [377.7, 316.4], [376.7, 321.7],
      [367.4, 334.9], [365.9, 350.6], [361.5, 363.8], [349.3, 370.5], [312, 370.5], [312, 299],
    ],
    labelAt: at(340, 328),
  },
  {
    id: 'argentina',
    name: 'Argentina',
    shortName: 'ARG',
    regionId: 'southAmerica',
    borders: [
      'peru',
      'brazil',
    ],
    corners: [
      [338, 389.9], [328.1, 404.3], [321.8, 405.8], [316.1, 402.7], [320.4, 412.4], [314, 418.3],
      [305.9, 418.7], [304.9, 425.8], [298.7, 426], [299.1, 429.2], [303, 430.8], [298.5, 433.9],
      [297.5, 438.9], [293, 440.5], [292.3, 443], [297.3, 446], [296.4, 448.9], [288.2, 457.4],
      [290.8, 462.6], [283.8, 464.4], [283.4, 467.5], [273.1, 462.4], [271.4, 450.7], [275.3, 445.1],
      [271.3, 444.1], [274.7, 435.8], [277.6, 437], [278.9, 430.2], [274.7, 433], [277.6, 420.1],
      [276.7, 413.3], [282.3, 397.9], [284.5, 370.5], [338, 370.5],
    ],
    labelAt: at(302, 390),
  },
  // ---------------------------------------------------- Europe (7)
  {
    id: 'iceland',
    name: 'Iceland',
    shortName: 'ICE',
    regionId: 'europe',
    borders: [
      'greenland',
      'greatBritain',
      'scandinavia',
    ],
    corners: [
      [430.3, 76.5], [429.7, 78.6], [432.6, 80.8], [419.5, 86.1], [408.8, 84.6], [411.4, 83.2],
      [405.7, 81.6], [410.2, 80], [404.8, 79.3], [410.4, 76.7], [414.5, 78.9],
    ],
    labelAt: at(420, 82),
    isIsland: true,
  },
  {
    id: 'greatBritain',
    name: 'Great Britain',
    shortName: 'GBR',
    regionId: 'europe',
    borders: [
      'iceland',
      'scandinavia',
      'northernEurope',
      'westernEurope',
    ],
    corners: [
      [460.2, 101.9], [457.4, 105.5], [462.9, 105], [459.9, 110.6], [472.4, 121.1], [471.8, 125.8],
      [454.4, 130.1], [459.1, 125.4], [454.3, 123.5], [457, 122.5], [456.1, 118.6], [460.3, 117],
      [455.4, 114.4], [454.9, 111.2], [453.5, 112.7], [452, 107.9], [455, 102],
    ],
    labelAt: at(464, 122),
    isIsland: true,
  },
  {
    id: 'scandinavia',
    name: 'Scandinavia',
    shortName: 'SCA',
    regionId: 'europe',
    borders: [
      'iceland',
      'greatBritain',
      'northernEurope',
      'ukraine',
    ],
    corners: [
      [489.7, 113.8], [489.1, 112.1], [490.2, 106.9], [495.5, 104.9], [496.4, 109], [493.1, 112.2],
      [494.2, 113.8], [522.3, 113.8], [523.3, 113.1], [524.1, 105.9], [530.7, 107.2], [531.5, 102.8],
      [528.7, 100.1], [543.7, 97.4], [527.5, 98], [523.4, 95.2], [524, 87.1], [534, 80.9],
      [530.1, 78], [525.7, 78.9], [523.6, 83.2], [514.4, 88.6], [512.5, 93.1], [516.8, 97.2],
      [511.8, 101.7], [509.3, 110.2], [501.7, 112.6], [494.9, 99.2], [489.8, 103], [482.7, 102.1],
      [481, 91.1], [495.4, 82.9], [506.4, 72.1], [531.8, 61.7], [541.2, 61.1], [549.4, 63.5],
      [546, 64.4], [548.9, 66.4], [551.2, 67], [551.2, 113.8],
    ],
    labelAt: at(502, 91),
  },
  {
    id: 'ukraine',
    name: 'Ukraine',
    shortName: 'UKR',
    regionId: 'europe',
    borders: [
      'scandinavia',
      'northernEurope',
      'southernEurope',
      'ural',
      'afghanistan',
      'middleEast',
    ],
    corners: [
      [551.2, 156.9], [555.1, 155.9], [567.7, 159.4], [576.4, 156.1], [563.4, 145.5], [569.7, 138.9],
      [558.9, 142.1], [562.5, 145.9], [556.1, 148.3], [552.4, 145.2], [554.6, 142.7], [551.2, 141.9],
      [551.2, 67], [572.8, 71.7], [574.9, 75.4], [572, 77.1], [554.3, 75.9], [558.5, 78.3],
      [558.9, 83.2], [564.2, 85], [562.9, 82], [564.7, 80.8], [570.9, 82.8], [573.1, 82],
      [571.4, 79.6], [577.4, 76.5], [582.3, 77.8], [583.8, 75.5], [581, 69.6], [588.3, 70.7],
      [589.7, 72.5], [586.5, 74.7], [588.5, 75.8], [607.7, 68.7], [609.6, 68.9], [607.1, 70.8],
      [620.9, 68.6], [623.8, 70.6], [624, 70.5], [624, 162.5], [551.2, 162.5],
    ],
    labelAt: at(590, 112),
  },
  {
    id: 'northernEurope',
    name: 'Northern Europe',
    shortName: 'NEU',
    regionId: 'europe',
    borders: [
      'scandinavia',
      'greatBritain',
      'ukraine',
      'southernEurope',
      'westernEurope',
    ],
    corners: [
      [551.2, 146.3], [551.2, 141.9], [547.9, 141.1], [544.8, 146.3], [505.2, 146.3], [502.2, 143.9],
      [500.1, 145], [500.3, 146.3], [473.2, 146.3], [473.2, 127.7], [480.2, 120], [489.1, 118.5],
      [490.9, 116.9], [489.7, 113.8], [494.2, 113.8], [496.4, 117], [519.1, 115.6], [522.3, 113.8],
      [551.2, 113.8], [551.2, 146.3],
    ],
    labelAt: at(528, 130),
  },
  {
    id: 'westernEurope',
    name: 'Western Europe',
    shortName: 'WEU',
    regionId: 'europe',
    borders: [
      'greatBritain',
      'northernEurope',
      'southernEurope',
      'northAfrica',
    ],
    corners: [
      [467.8, 175.5], [471.8, 173.5], [473.2, 173.4], [473.2, 157.7], [470.1, 159.2], [468.3, 166.6],
      [462.4, 173.3], [454.6, 175.5], [453.9, 175.5], [451, 172.4], [444.9, 172.7], [443.6, 152.7],
      [464.4, 149.4], [464.9, 143], [456.1, 134.3], [463.8, 134.4], [463.5, 133.3], [473.2, 133.3],
      [473.2, 175.5],
    ],
    labelAt: at(456, 163),
  },
  {
    id: 'southernEurope',
    name: 'Southern Europe',
    shortName: 'SEU',
    regionId: 'europe',
    borders: [
      'westernEurope',
      'northernEurope',
      'ukraine',
      'middleEast',
      'egypt',
      'northAfrica',
    ],
    corners: [
      [473.2, 173.4], [492.7, 171.1], [496.9, 172.6], [496.3, 175.5], [551.2, 175.5], [551.2, 173.4],
      [539.9, 173.4], [536, 164.2], [544, 158.5], [551.2, 156.9], [551.2, 146.3], [544.8, 146.3],
      [540, 154.1], [542.9, 159.1], [536.5, 162], [532.8, 159.4], [529.7, 160.3], [530.1, 162.6],
      [526.8, 161.7], [530.5, 170.1], [528.1, 169.3], [528.2, 174.1], [526.5, 174.2], [518.5, 161.7],
      [518.8, 156.9], [505.2, 146.3], [500.3, 146.3], [500.7, 149.2], [516, 162], [511.9, 161.1],
      [512.3, 166.1], [509.9, 169], [508.1, 162.3], [491.1, 148.3], [485, 152.3], [476.1, 152.5],
      [475.9, 156.4], [473.2, 157.7], [473.2, 146.3], [551.2, 146.3], [551.2, 175.5], [473.2, 175.5],
    ],
    labelAt: at(525, 154),
  },
  // ---------------------------------------------------- Africa (6)
  {
    id: 'northAfrica',
    name: 'North Africa',
    shortName: 'NAF',
    regionId: 'africa',
    borders: [
      'westernEurope',
      'southernEurope',
      'egypt',
      'eastAfrica',
      'congo',
      'brazil',
    ],
    corners: [
      [434.1, 266.5], [424.8, 252.9], [422.2, 244.6], [426, 233.6], [423.9, 221.4], [430.5, 207.2],
      [443.1, 195.2], [443.8, 186.7], [452.6, 176.3], [462.4, 178.2], [467.8, 175.5], [496.3, 175.5],
      [494.9, 182.7], [517.6, 194.1], [520.3, 187.7], [524, 185.8], [533, 188.8], [533, 175.5],
      [454.6, 175.5], [454, 175.7], [453.9, 175.5], [533, 175.5], [533, 266.5],
    ],
    labelAt: at(478, 224),
  },
  {
    id: 'egypt',
    name: 'Egypt',
    shortName: 'EGY',
    regionId: 'africa',
    borders: [
      'northAfrica',
      'southernEurope',
      'middleEast',
      'eastAfrica',
    ],
    corners: [
      [564.2, 210], [558, 201.3], [558.8, 196.6], [556.2, 202.6], [552.3, 195.5], [560.4, 217.4],
      [563.9, 221], [564.2, 223.4], [564.2, 243.8], [533, 243.8], [533, 188.8], [543.2, 192.2],
      [548.5, 189.9], [555.8, 191.9], [557.4, 188.5], [564.2, 188.5],
    ],
    labelAt: at(549, 227),
  },
  {
    id: 'eastAfrica',
    name: 'East Africa',
    shortName: 'EAF',
    regionId: 'africa',
    borders: [
      'egypt',
      'northAfrica',
      'congo',
      'southAfrica',
      'madagascar',
      'middleEast',
    ],
    corners: [
      [603.2, 243.8], [599.9, 243.8], [594.6, 247], [581.1, 251.4], [579.8, 243.8], [574.3, 243.8],
      [580.6, 252.2], [579.1, 254.4], [584, 258.6], [600.9, 253.4], [600.7, 257.9], [592.1, 278.8],
      [572.7, 300.9], [569.9, 307.7], [568.9, 313.5], [573.2, 327.5], [573.3, 328.3], [533, 328.3],
      [533, 243.8], [603.2, 243.8],
    ],
    labelAt: at(561, 275),
  },
  {
    id: 'congo',
    name: 'Congo',
    shortName: 'CON',
    regionId: 'africa',
    borders: [
      'northAfrica',
      'eastAfrica',
      'southAfrica',
    ],
    corners: [
      [503.3, 328.3], [503.6, 327.4], [499, 308.9], [490.9, 296.1], [492.5, 280.4], [490.1, 277],
      [483.3, 278.6], [479.2, 272.1], [462.9, 277.2], [444.6, 276.8], [435.7, 268.9], [434.1, 266.5],
      [533, 266.5], [533, 328.3],
    ],
    labelAt: at(513, 287),
  },
  {
    id: 'southAfrica',
    name: 'South Africa',
    shortName: 'SAF',
    regionId: 'africa',
    borders: [
      'congo',
      'eastAfrica',
      'madagascar',
    ],
    corners: [
      [573.3, 328.3], [574, 340.2], [570.6, 346.8], [558.4, 356.8], [560.6, 369.5], [552.7, 376.1],
      [551.7, 385.9], [541.4, 399], [535, 402.8], [519, 405.7], [515.8, 403.4], [515.4, 395.4],
      [507.5, 380.5], [505.1, 364.4], [498.7, 351.2], [498.6, 343.8], [503.3, 328.3],
    ],
    labelAt: at(531, 357),
  },
  {
    id: 'madagascar',
    name: 'Madagascar',
    shortName: 'MAD',
    regionId: 'africa',
    borders: [
      'southAfrica',
      'eastAfrica',
    ],
    corners: [
      [598.1, 336.6], [599, 343.5], [597.1, 343.6], [590.4, 373.6], [586.1, 375.7], [582.5, 373.7],
      [580.5, 364.2], [583.4, 357.7], [583.6, 345.2], [592, 339.9], [595.9, 331.6],
    ],
    labelAt: at(590, 349),
    isIsland: true,
  },
  // ------------------------------------------------------ Asia (12)
  {
    id: 'ural',
    name: 'Ural',
    shortName: 'URA',
    regionId: 'asia',
    borders: [
      'ukraine',
      'siberia',
      'china',
      'afghanistan',
    ],
    corners: [
      [624, 70.5], [626.8, 68.4], [624.1, 66.6], [625.4, 65.5], [646.1, 71.2], [647.9, 69.5],
      [642, 66.8], [641.4, 61.7], [647.9, 55.8], [656.7, 56], [654.8, 60.4], [657.3, 63.7],
      [656.7, 68.2], [659.5, 70.2], [653.3, 77], [656.3, 77.4], [663.1, 72.3], [662.8, 68.3],
      [659.4, 66.2], [661.4, 62.9], [658.1, 60.3], [662.7, 58.1], [662.1, 55.8], [664.8, 57.5],
      [663.8, 60.7], [666.5, 61.3], [665.3, 58.9], [669.7, 57.6], [679.9, 59.3], [677.3, 53.1],
      [693.7, 52.2], [691.6, 50.5], [694.6, 48.4], [702, 47.5], [702, 136.5], [624, 136.5],
    ],
    labelAt: at(671, 104),
  },
  {
    id: 'siberia',
    name: 'Siberia',
    shortName: 'SIB',
    regionId: 'asia',
    borders: [
      'ural',
      'yakutsk',
      'irkutsk',
      'mongolia',
      'china',
    ],
    corners: [
      [746.1, 42.3], [754, 43.9], [754, 50.7], [752.4, 51.4], [754, 51.6], [754, 130],
      [702, 130], [702, 47.5], [730, 44.1], [739.3, 40],
    ],
    labelAt: at(728, 73),
  },
  {
    id: 'yakutsk',
    name: 'Yakutsk',
    shortName: 'YAK',
    regionId: 'asia',
    borders: [
      'siberia',
      'irkutsk',
      'kamchatka',
    ],
    corners: [
      [754, 43.9], [764.7, 46], [754, 50.7], [754, 51.6], [788.3, 55.3], [788.5, 52.9],
      [798.1, 53.4], [809.4, 62.4], [811.9, 59], [831.7, 60.2], [829.8, 57.1], [832, 56.2],
      [832, 91], [754, 91],
    ],
    labelAt: at(775, 72),
  },
  {
    id: 'irkutsk',
    name: 'Irkutsk',
    shortName: 'IRK',
    regionId: 'asia',
    borders: [
      'siberia',
      'yakutsk',
      'kamchatka',
      'mongolia',
    ],
    corners: [
      [832, 105], [819.3, 114.6], [827.2, 117.8], [831.7, 116.4], [832, 116.8], [832, 130],
      [754, 130], [754, 91], [832, 91],
    ],
    labelAt: at(775, 111),
  },
  {
    id: 'kamchatka',
    name: 'Kamchatka',
    shortName: 'KAM',
    regionId: 'asia',
    borders: [
      'yakutsk',
      'irkutsk',
      'mongolia',
      'japan',
      'alaska',
    ],
    corners: [
      [832, 56.2], [833.2, 55.7], [856.7, 57.8], [865.7, 62.3], [881.4, 62.2], [886.4, 66.8],
      [904.4, 66.4], [908.9, 69.2], [912.1, 68.2], [910, 66.1], [911.2, 64.7], [932.4, 66.9],
      [936, 68.4], [936, 81.3], [929.3, 82.5], [934.7, 89.2], [919.6, 92.1], [910.9, 97.9],
      [907.1, 95.6], [893.2, 97.9], [889.2, 103.2], [892.3, 105.3], [889.5, 114.2], [885, 115.9],
      [884.1, 119.6], [880.2, 120.4], [875.7, 126.7], [872.1, 112.5], [873.4, 108], [893.5, 93.8],
      [895.6, 89.2], [884.3, 95.7], [882.2, 91.7], [875.5, 92.8], [869, 98.3], [871.1, 100.3],
      [861.3, 101.5], [861.5, 99.1], [857.4, 98.6], [837.7, 100.6], [832, 105], [832, 116.8],
      [835.6, 122.7], [833.6, 130], [832, 130],
    ],
    labelAt: at(853, 78),
  },
  {
    id: 'mongolia',
    name: 'Mongolia',
    shortName: 'MON',
    regionId: 'asia',
    borders: [
      'siberia',
      'irkutsk',
      'kamchatka',
      'japan',
      'china',
    ],
    corners: [
      [800.8, 162.2], [800.4, 162.5], [784.8, 162.5], [785.6, 161.1], [784.3, 159.4], [779.2, 162.5],
      [702, 162.5], [702, 130], [800.8, 130],
    ],
    labelAt: at(718, 146),
  },
  {
    id: 'japan',
    name: 'Japan',
    shortName: 'JAP',
    regionId: 'asia',
    borders: [
      'mongolia',
      'kamchatka',
    ],
    corners: [
      [826.4, 143], [818.7, 151.5], [811.9, 151.8], [800.8, 162.2], [800.8, 165.6], [804.6, 173],
      [803.6, 178.5], [800.8, 179.4], [800.8, 143],
    ],
    labelAt: at(807, 149),
    isIsland: true,
  },
  {
    id: 'afghanistan',
    name: 'Afghanistan',
    shortName: 'AFG',
    regionId: 'asia',
    borders: [
      'ukraine',
      'ural',
      'china',
      'india',
      'middleEast',
    ],
    corners: [
      [641.6, 211.3], [640.6, 209.9], [624, 209.1], [624, 136.5], [702, 136.5], [702, 211.3],
    ],
    labelAt: at(663, 174),
  },
  {
    id: 'china',
    name: 'China',
    shortName: 'CHI',
    regionId: 'asia',
    borders: [
      'siberia',
      'ural',
      'afghanistan',
      'india',
      'siam',
      'mongolia',
    ],
    corners: [
      [793, 169.2], [792.3, 168.6], [793, 166.4], [793, 164.1], [782.7, 166.1], [784.8, 162.5],
      [779.2, 162.5], [774.9, 165.1], [773.6, 166.6], [777.2, 170.8], [786.1, 170.8], [777.8, 179],
      [785, 189.5], [783.3, 192.8], [785.4, 195.5], [784.4, 200.8], [776.5, 212.7], [769.3, 218.5],
      [756, 223], [755.2, 226.4], [750.2, 221.9], [744.2, 227.5], [710.3, 227.5], [705.7, 218.5],
      [703.3, 218.4], [702.7, 221.5], [702, 221.6], [702, 162.5], [793, 162.5],
    ],
    labelAt: at(735, 195),
  },
  {
    id: 'middleEast',
    name: 'Middle East',
    shortName: 'MEA',
    regionId: 'asia',
    borders: [
      'ukraine',
      'southernEurope',
      'egypt',
      'eastAfrica',
      'afghanistan',
      'india',
    ],
    corners: [
      [624, 209.1], [617.2, 208.8], [614.9, 204.3], [610.3, 206.4], [602, 201.9], [598.3, 194.5],
      [592.7, 195.1], [600.1, 212], [600.6, 208], [602.1, 208.6], [602.7, 214.4], [608.4, 214.1],
      [614.5, 206.7], [615.8, 213.7], [623.5, 220], [618.3, 226.7], [618, 230.9], [611.7, 236.5],
      [599.9, 243.8], [579.8, 243.8], [578.9, 238], [569.8, 223.3], [568.1, 215.5], [564.2, 210],
      [564.2, 223.4], [565.5, 232], [574.3, 243.8], [564.2, 243.8], [564.2, 162.5], [624, 162.5],
    ],
    labelAt: at(582, 181),
  },
  {
    id: 'india',
    name: 'India',
    shortName: 'IND',
    regionId: 'asia',
    borders: [
      'middleEast',
      'afghanistan',
      'china',
      'siam',
    ],
    corners: [
      [702, 221.6], [694.1, 222.6], [692.9, 227], [676.8, 240.8], [675.6, 258.8], [669.6, 266.6],
      [659.2, 240.5], [656.8, 223.1], [651.2, 224.6], [641.6, 211.3], [637, 211.3], [702, 211.3],
    ],
    labelAt: at(672, 226),
  },
  {
    id: 'siam',
    name: 'Siam',
    shortName: 'SIA',
    regionId: 'asia',
    borders: [
      'india',
      'china',
      'indonesia',
    ],
    corners: [
      [744.2, 227.5], [743.3, 228.3], [752.3, 248.9], [751.9, 254.6], [741.4, 264.6], [741.2, 260.3],
      [728.3, 248.9], [726, 262.5], [735.7, 274.5], [736.9, 279.5], [730.5, 279.5], [728.2, 271.5],
      [724.1, 265.3], [723.7, 267.2], [724.8, 255.3], [720.6, 237.5], [716, 241.4], [712.9, 240.4],
      [713.2, 233.3], [710.3, 227.5], [707.2, 227.5],
    ],
    labelAt: at(736, 240),
  },
  // ------------------------------------------------- Australia (4)
  {
    id: 'indonesia',
    name: 'Indonesia',
    shortName: 'INO',
    regionId: 'australiaRegion',
    borders: [
      'siam',
      'newGuinea',
      'westernAustralia',
    ],
    corners: [
      [774.5, 286.6], [777.4, 289.6], [774.3, 290], [770, 305.5], [754.6, 302], [751.6, 294],
      [753.1, 286], [757, 286.5], [757.6, 283.7], [761.8, 282.4], [764.1, 279.5], [774.7, 279.5],
      [773, 282],
    ],
    labelAt: at(763, 294),
    isIsland: true,
  },
  {
    id: 'newGuinea',
    name: 'New Guinea',
    shortName: 'NGU',
    regionId: 'australiaRegion',
    borders: [
      'indonesia',
      'westernAustralia',
      'easternAustralia',
    ],
    corners: [
      [816.8, 296.2], [817.5, 301.5], [820.2, 303.4], [827.7, 298], [843.9, 305], [851.9, 312.3],
      [850.7, 316.5], [859.8, 326.9], [852.6, 325.4], [844.3, 317.3], [838.8, 322.8], [829.7, 318.8],
      [825.8, 319.8], [828.5, 316.3], [826.6, 310], [815.5, 304], [813.8, 305.9], [811.2, 301.7],
      [815.6, 299.7], [807.4, 295.5], [812.2, 293.7],
    ],
    labelAt: at(837, 311),
    isIsland: true,
  },
  {
    id: 'westernAustralia',
    name: 'Western Australia',
    shortName: 'WAU',
    regionId: 'australiaRegion',
    borders: [
      'indonesia',
      'newGuinea',
      'easternAustralia',
    ],
    corners: [
      [813.8, 396.9], [809.4, 394.9], [796, 397.2], [789.5, 402.6], [779.7, 402.9], [774.9, 406.5],
      [767.1, 403.6], [768.8, 395.2], [762.7, 377.4], [765, 378], [762.8, 371.8], [764.8, 363.2],
      [765, 365.7], [771.5, 359.8], [782.2, 356.5], [787.8, 345.8], [790, 348], [789.1, 346.4],
      [794.8, 338.7], [798.4, 337.4], [805, 341.2], [807.6, 333.2], [812.7, 331.9], [810.7, 329.1],
      [812.1, 328.7], [813.8, 329.5],
    ],
    labelAt: at(787, 378),
  },
  {
    id: 'easternAustralia',
    name: 'Eastern Australia',
    shortName: 'EAU',
    regionId: 'australiaRegion',
    borders: [
      'westernAustralia',
      'newGuinea',
    ],
    corners: [
      [841.3, 337.2], [846, 341.2], [848.6, 354.1], [855, 358.8], [866.2, 377.2], [865.5, 395.3],
      [858, 414.1], [848.4, 419.4], [845.1, 415.7], [841.4, 418.6], [833.7, 416.1], [830.9, 409.9],
      [827.1, 408.2], [827.3, 404.3], [823.8, 407.1], [826.3, 399.4], [821.6, 405.9], [817.1, 398.5],
      [813.8, 396.9], [813.8, 329.5], [819.8, 332.3], [822.9, 331], [824.1, 332.6], [820.3, 341.2],
      [832.6, 350.1], [836.4, 341.4], [837.6, 328.4],
    ],
    labelAt: at(840, 380),
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
  viewBox: '17 7 933 475',

  /**
   * What each continent pays for holding it.
   *
   * The numbers the classic board uses. They are balanced against the
   * number of ways in, not against size: Asia pays the most and almost
   * nobody holds it, Australia pays the least and wins games.
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
