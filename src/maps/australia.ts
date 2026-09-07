/**
 * Australia, the phase 1 map. See spec 3.3 and S18.
 *
 * The coastline points come from real latitude and longitude, placed with a
 * simple flat projection:
 *
 *   x = 150 + (longitude east - 113) * 16.1
 *   y = 120 + (latitude south - 10.7) * 17.63
 *
 * The two factors differ because a degree of longitude is shorter than a
 * degree of latitude at Australia's latitudes. Using one factor for both
 * would stretch the country sideways.
 *
 * The named features are the ones that make the shape recognisable: Cape
 * York, the Gulf of Carpentaria, Shark Bay and the Great Australian Bight.
 * The rest of the coast is smoothed. This is a game map, not a chart.
 *
 * The shapes do NOT decide who borders whom. The `borders` list does. See
 * spec S4. So a rough drawing cannot break the rules, and an island can
 * border the mainland with no bridge drawn.
 *
 * Every number here is a first guess, most of all the region bonuses. See
 * spec S5. Change them, play a game, change them again.
 */
import type { GameMap } from '../engine'

export const AUSTRALIA: GameMap = {
  id: 'australia',
  name: 'Australia',
  // Trimmed to what the coastline actually uses, so the map fills the
  // screen instead of floating in empty space.
  viewBox: '136 100 690 622',

  regions: [
    { id: 'west', name: 'The West', bonus: 3, outline: '#b8763a' },
    { id: 'northEast', name: 'The North East', bonus: 2, outline: '#3f8f5e' },
    { id: 'southEast', name: 'The South East', bonus: 3, outline: '#3a6ea8' },
    { id: 'south', name: 'The South', bonus: 2, outline: '#7a4f9c' },
  ],

  territories: [
    {
      id: 'wa',
      name: 'Western Australia',
      shortName: 'WA',
      regionId: 'west',
      borders: ['nt', 'sa', 'rot'],
      // Down the west coast: Cape Londonderry, Broome, North West Cape,
      // the Shark Bay notch, Perth, Cape Leeuwin, then east along the
      // Great Australian Bight to the 129 degree border.
      shape:
        'M 408 192 L 396 212 L 374 173 L 344 192 L 316 224 L 298 248 ' +
        'L 262 278 L 240 289 L 202 301 L 168 316 L 182 342 L 166 362 ' +
        'L 156 381 L 172 391 L 159 400 L 168 420 L 176 439 L 186 470 ' +
        'L 195 496 L 184 538 L 210 551 L 229 548 L 262 540 L 293 529 ' +
        'L 350 506 L 408 490 Z',
      labelAt: { x: 272, y: 382 },
    },
    {
      id: 'rot',
      name: 'Rottnest Island',
      shortName: 'ROT',
      regionId: 'west',
      borders: ['wa'],
      shape: 'M 170 491 L 182 489 L 185 499 L 173 502 Z',
      labelAt: { x: 178, y: 466 },
      isIsland: true,
    },
    {
      id: 'nt',
      name: 'Northern Territory',
      shortName: 'NT',
      regionId: 'west',
      borders: ['wa', 'sa', 'qld'],
      // Darwin, the Cobourg Peninsula, Arnhem Land, then south down the
      // western shore of the Gulf of Carpentaria.
      shape:
        'M 408 192 L 424 178 L 437 150 L 452 162 L 459 127 L 472 148 ' +
        'L 492 133 L 512 141 L 533 146 L 522 172 L 540 189 L 553 225 ' +
        'L 553 390 L 408 390 Z',
      labelAt: { x: 480, y: 286 },
    },
    {
      id: 'qld',
      name: 'Queensland',
      shortName: 'QLD',
      regionId: 'northEast',
      borders: ['nt', 'sa', 'nsw', 'whit'],
      // Around the bottom of the Gulf of Carpentaria, up the west side of
      // Cape York Peninsula, round the cape itself, then all the way down
      // the east coast past Cairns, Mackay and Brisbane.
      //
      // The southern border steps. It runs along 29 degrees south as far
      // west as 141 degrees east, then jumps north to 26 degrees south for
      // the stretch beside South Australia. Running 29 south the whole way
      // made Queensland and South Australia claim the same rectangle, which
      // showed on screen as a stray block of colour.
      shape:
        'M 553 222 L 575 236 L 598 243 L 607 214 L 613 178 L 619 150 ' +
        'L 625 120 L 638 152 L 648 168 L 657 182 L 668 205 L 678 229 ' +
        'L 688 252 L 694 272 L 715 288 L 733 303 L 745 325 L 754 344 ' +
        'L 775 361 L 796 377 L 800 400 L 794 416 L 800 443 L 601 443 ' +
        'L 601 390 L 553 390 Z',
      labelAt: { x: 676, y: 300 },
    },
    {
      id: 'whit',
      name: 'Whitsunday Islands',
      shortName: 'WHIT',
      regionId: 'northEast',
      borders: ['qld'],
      shape: 'M 742 281 L 753 278 L 756 289 L 745 292 Z',
      labelAt: { x: 750, y: 256 },
      isIsland: true,
    },
    {
      id: 'sa',
      name: 'South Australia',
      shortName: 'SA',
      regionId: 'south',
      borders: ['wa', 'nt', 'qld', 'nsw', 'vic'],
      // East along the Great Australian Bight past the Head of Bight and
      // Ceduna, then the three prongs: Eyre Peninsula, Spencer Gulf,
      // Yorke Peninsula and Gulf St Vincent.
      shape:
        'M 408 390 L 408 490 L 428 484 L 445 483 L 464 490 L 483 497 ' +
        'L 496 520 L 512 546 L 519 518 L 530 500 L 543 498 L 542 522 ' +
        'L 534 556 L 546 528 L 556 512 L 564 516 L 566 546 L 578 566 ' +
        'L 588 582 L 601 602 L 601 390 Z',
      labelAt: { x: 476, y: 452 },
    },
    {
      id: 'nsw',
      name: 'New South Wales',
      shortName: 'NSW',
      regionId: 'southEast',
      borders: ['qld', 'sa', 'vic', 'act'],
      // Down the coast past Sydney to Cape Howe, then west along the
      // Murray to the 141 degree border.
      shape:
        'M 601 443 L 800 443 L 806 458 L 797 482 L 780 505 L 765 530 ' +
        'L 754 558 L 744 593 L 712 578 L 678 562 L 640 545 L 601 531 Z',
      labelAt: { x: 690, y: 492 },
    },
    {
      id: 'act',
      name: 'Australian Capital Territory',
      shortName: 'ACT',
      regionId: 'southEast',
      borders: ['nsw'],
      shape: 'M 722 546 L 741 543 L 747 562 L 728 566 Z',
      labelAt: { x: 734, y: 554 },
    },
    {
      id: 'vic',
      name: 'Victoria',
      shortName: 'VIC',
      regionId: 'southEast',
      borders: ['sa', 'nsw', 'tas'],
      // Wilsons Promontory, the mouth of Port Phillip, Cape Otway.
      shape:
        'M 601 531 L 640 545 L 678 562 L 712 578 L 744 593 L 722 607 ' +
        'L 700 618 L 689 621 L 676 604 L 666 600 L 660 614 L 642 618 ' +
        'L 622 612 L 611 607 L 601 602 Z',
      labelAt: { x: 658, y: 566 },
    },
    {
      id: 'tas',
      name: 'Tasmania',
      shortName: 'TAS',
      regionId: 'south',
      borders: ['vic'],
      shape:
        'M 660 649 L 686 644 L 713 650 L 718 668 L 713 693 L 697 701 ' +
        'L 681 700 L 668 684 L 655 668 Z',
      labelAt: { x: 684, y: 662 },
      isIsland: true,
    },
  ],
}
