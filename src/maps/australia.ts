/**
 * Australia, the phase 1 map. See spec 3.3.
 *
 * The shapes are simplified. Real state outlines have thousands of points
 * and most of them are sand. These are recognisable and easy to change.
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
  viewBox: '0 0 1000 800',

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
      shape:
        'M 120 350 L 150 250 L 235 165 L 380 160 L 380 590 ' +
        'L 300 605 L 230 570 L 175 490 L 130 430 Z',
      labelAt: { x: 250, y: 380 },
    },
    {
      id: 'rot',
      name: 'Rottnest Island',
      shortName: 'ROT',
      regionId: 'west',
      borders: ['wa'],
      shape: 'M 92 504 L 110 500 L 116 516 L 98 521 Z',
      labelAt: { x: 104, y: 474 },
    },
    {
      id: 'nt',
      name: 'Northern Territory',
      shortName: 'NT',
      regionId: 'west',
      borders: ['wa', 'sa', 'qld'],
      shape:
        'M 380 160 L 405 138 L 445 128 L 480 132 L 520 158 ' +
        'L 520 430 L 380 430 Z',
      labelAt: { x: 450, y: 285 },
    },
    {
      id: 'qld',
      name: 'Queensland',
      shortName: 'QLD',
      regionId: 'northEast',
      borders: ['nt', 'sa', 'nsw', 'whit'],
      shape:
        'M 520 158 L 555 128 L 610 112 L 680 118 L 745 152 L 792 210 ' +
        'L 815 288 L 800 355 L 775 400 L 700 425 L 565 430 L 520 430 Z',
      labelAt: { x: 655, y: 265 },
    },
    {
      id: 'whit',
      name: 'Whitsunday Islands',
      shortName: 'WHIT',
      regionId: 'northEast',
      borders: ['qld'],
      shape: 'M 828 236 L 848 229 L 856 250 L 836 258 Z',
      labelAt: { x: 842, y: 206 },
    },
    {
      id: 'sa',
      name: 'South Australia',
      shortName: 'SA',
      regionId: 'south',
      borders: ['wa', 'nt', 'qld', 'nsw', 'vic'],
      shape:
        'M 380 430 L 565 430 L 565 560 L 520 600 L 430 610 L 380 590 Z',
      labelAt: { x: 470, y: 512 },
    },
    {
      id: 'nsw',
      name: 'New South Wales',
      shortName: 'NSW',
      regionId: 'southEast',
      borders: ['qld', 'sa', 'vic', 'act'],
      shape:
        'M 565 430 L 700 425 L 775 400 L 790 450 L 762 512 ' +
        'L 700 528 L 565 530 Z',
      labelAt: { x: 660, y: 470 },
    },
    {
      id: 'act',
      name: 'Australian Capital Territory',
      shortName: 'ACT',
      regionId: 'southEast',
      borders: ['nsw'],
      shape: 'M 731 466 L 762 461 L 770 490 L 739 496 Z',
      labelAt: { x: 751, y: 479 },
    },
    {
      id: 'vic',
      name: 'Victoria',
      shortName: 'VIC',
      regionId: 'southEast',
      borders: ['sa', 'nsw', 'tas'],
      shape:
        'M 565 530 L 700 528 L 762 512 L 735 572 L 660 600 ' +
        'L 590 585 L 565 560 Z',
      labelAt: { x: 655, y: 555 },
    },
    {
      id: 'tas',
      name: 'Tasmania',
      shortName: 'TAS',
      regionId: 'south',
      borders: ['vic'],
      shape: 'M 648 662 L 690 655 L 710 685 L 692 722 L 655 715 L 638 688 Z',
      labelAt: { x: 674, y: 688 },
    },
  ],
}
