// Block definitions + procedurally generated 16px texture atlas (no image assets needed).

import { mulberry32, hash2 } from './noise.js';

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, PLANK: 5, LOG: 6, LEAVES: 7,
  SAND: 8, GLASS: 9, WATER: 10, SNOW: 11, BEDROCK: 12, COAL_ORE: 13, IRON_ORE: 14, DIAMOND_ORE: 15,
  WOOL: 16, CRAFTING_TABLE: 17, STONE_BRICK: 18, IRON_BLOCK: 19, DIAMOND_BLOCK: 20,
  ICE: 21, FURNACE: 22, LAVA: 23, OBSIDIAN: 24, PORTAL: 25, NETHERRACK: 26,
  END_FRAME: 27, END_FRAME_FILLED: 28, END_PORTAL: 29, END_STONE: 30, DRAGON_EGG: 31,
  CHEST: 32, BED: 33,
  // building blocks
  BRICKS: 34, SANDSTONE: 35, SMOOTH_STONE: 36, MOSSY_COBBLE: 37, GRAVEL: 38, CLAY: 39,
  BOOKSHELF: 40, GLOWSTONE: 41, QUARTZ_BLOCK: 42, NETHER_BRICK: 43,
  GOLD_ORE: 44, REDSTONE_ORE: 45, LAPIS_ORE: 46, EMERALD_ORE: 47, QUARTZ_ORE: 48,
  GOLD_BLOCK: 49, REDSTONE_BLOCK: 50, LAPIS_BLOCK: 51, EMERALD_BLOCK: 52,
  BIRCH_LOG: 53, BIRCH_PLANK: 54, SPRUCE_LOG: 55, SPRUCE_PLANK: 56,
  PUMPKIN: 57, MELON: 58, HAY: 59, SNOW_BLOCK: 60, TNT: 61, CACTUS: 62,
  TORCH: 63, FENCE: 64, GLASS_PANE: 65, POPPY: 66, DANDELION: 67,
  OAK_SLAB: 68, COBBLE_SLAB: 69, STONE_SLAB: 70, STONE_BRICK_SLAB: 71, BRICK_SLAB: 72, SANDSTONE_SLAB: 73,
  // stairs occupy 4 ids each (one per horizontal facing); the first is the item
  OAK_STAIRS: 74, COBBLE_STAIRS: 78, STONE_BRICK_STAIRS: 82, BRICK_STAIRS: 86,
  // colored wool: 90..104 (see WOOL_COLORS)
  LADDER: 105, // 4 facings: 105..108
  DOOR: 109,   // bottom halves: closed 109..112, open 113..116 (by facing)
  DOOR_TOP: 117, DOOR_TOP_OPEN: 118,
  // new blocks (must stay below 200 — non-block items start there)
  COAL_BLOCK: 119, JACK_O_LANTERN: 120, MOSSY_STONE_BRICK: 121,
  SPRUCE_STAIRS: 122, SANDSTONE_STAIRS: 126, // 4 facings each
  BLUE_ORCHID: 130, ALLIUM: 131, COBWEB: 132,
  ENCHANT_TABLE: 133, JUKEBOX: 134, NOTE_BLOCK: 135,
  SPRUCE_SLAB: 136, BIRCH_SLAB: 137,
  STONE_STAIRS: 138, // 4 facings: 138..141
  DARK_LOG: 142, DARK_PLANK: 143, IRON_BARS: 144, MAGMA: 145,
  PACKED_ICE: 146, SEA_LANTERN: 147, CHISELED_BRICKS: 148, TINTED_GLASS: 149,
  CRYING_OBSIDIAN: 150, NETHERITE_BLOCK: 151, BONE_BLOCK: 152, AMETHYST: 153,
  RED_MUSHROOM: 154, BROWN_MUSHROOM: 155, SUGAR_CANE: 156, LANTERN: 157, SLIME_BLOCK: 158,
  REDSTONE_DUST: 159, REDSTONE_DUST_ON: 160, RTORCH: 161, RTORCH_OFF: 162,
  LEVER: 163, LEVER_ON: 164, BUTTON: 165, BUTTON_ON: 166, PLATE: 167, PLATE_ON: 168,
  LAMP: 169, LAMP_ON: 170, SENSOR: 171, SHULKER_BOX: 172,
  REPEATER: 173, // off facings 173..176, on 177..180
  COMPARATOR: 181, // off 181..184, on 185..188
  OBSERVER: 189, OBSERVER_ON: 190,
  PISTON: 191, STICKY_PISTON: 192, PISTON_HEAD: 193,
  DISPENSER: 194, DROPPER: 195, HOPPER: 196,
  BULB: 197, BULB_ON: 198, TARGET: 199,
};

export const TILE = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, COBBLE: 4, PLANK: 5, LOG_SIDE: 6, LOG_TOP: 7,
  LEAVES: 8, SAND: 9, GLASS: 10, WATER: 11, SNOW: 12, SNOW_SIDE: 13, BEDROCK: 14,
  COAL: 15, IRON: 16, DIAMOND: 17, WOOL: 18,
  CRAFTING_TOP: 19, CRAFTING_SIDE: 20, STONE_BRICK: 21, IRON_BLOCK: 22, DIAMOND_BLOCK: 23,
  ICE: 24, FURNACE_FRONT: 25, FURNACE_TOP: 26, LAVA: 27,
  OBSIDIAN: 28, PORTAL: 29, NETHERRACK: 30,
  END_FRAME: 31, END_FRAME_FILLED: 32, END_PORTAL: 33, END_STONE: 34, DRAGON_EGG: 35,
  CHEST: 36, BED_TOP: 37, BED_SIDE: 38,
  BRICKS: 39, SANDSTONE_TOP: 40, SANDSTONE_SIDE: 41, SMOOTH_STONE: 42, MOSSY_COBBLE: 43, GRAVEL: 44, CLAY: 45,
  BOOKSHELF: 46, GLOWSTONE: 47, QUARTZ: 48, NETHER_BRICK: 49,
  GOLD_ORE: 50, REDSTONE_ORE: 51, LAPIS_ORE: 52, EMERALD_ORE: 53, QUARTZ_ORE: 54,
  GOLD_BLOCK: 55, REDSTONE_BLOCK: 56, LAPIS_BLOCK: 57, EMERALD_BLOCK: 58,
  BIRCH_LOG: 59, BIRCH_PLANK: 60, SPRUCE_LOG: 61, SPRUCE_PLANK: 62,
  PUMPKIN_TOP: 63, PUMPKIN_SIDE: 64, MELON_SIDE: 65, MELON_TOP: 66, HAY_SIDE: 67, HAY_TOP: 68,
  TNT_SIDE: 69, TNT_TOP: 70, CACTUS_SIDE: 71, CACTUS_TOP: 72,
  TORCH: 73, POPPY: 74, DANDELION: 75,
  WOOL0: 76, // 15 colored wool tiles: 76..90
  ICON_FENCE: 91,
  ICON_SLAB_OAK: 92, ICON_SLAB_COBBLE: 93, ICON_SLAB_STONE: 94,
  ICON_SLAB_STONE_BRICK: 95, ICON_SLAB_BRICK: 96, ICON_SLAB_SANDSTONE: 97,
  ICON_STAIR_OAK: 98, ICON_STAIR_COBBLE: 99, ICON_STAIR_STONE_BRICK: 100, ICON_STAIR_BRICK: 101,
  LADDER: 102, DOOR_BOTTOM: 103, DOOR_TOP: 104, ICON_DOOR: 105,
  COAL_BLOCK: 106, JACK_SIDE: 107, MOSSY_STONE_BRICK: 108,
  BLUE_ORCHID: 109, ALLIUM: 110, COBWEB: 111,
  ENCHANT_TOP: 112, ENCHANT_SIDE: 113, JUKEBOX_TOP: 114, JUKEBOX_SIDE: 115,
  NOTE_BLOCK: 116, ICON_STAIR_SPRUCE: 117, ICON_STAIR_SANDSTONE: 118,
  ICON_SLAB_SPRUCE: 119, ICON_SLAB_BIRCH: 120,
  ICON_STAIR_STONE: 121,
  DARK_LOG_SIDE: 122, DARK_LOG_TOP: 123, DARK_PLANK: 124,
  IRON_BARS: 125, MAGMA: 126, PACKED_ICE: 127, SEA_LANTERN: 128,
  CHISELED_BRICKS: 129, TINTED_GLASS: 130, CRYING_OBSIDIAN: 131,
  NETHERITE_BLOCK: 132, BONE_TOP: 133, BONE_SIDE: 134, AMETHYST: 135,
  MUSHROOM_RED: 136, MUSHROOM_BROWN: 137, CANE_SIDE: 138, CANE_TOP: 139, LANTERN: 140, SLIME: 141,
  DUST_OFF: 142, DUST_ON: 143, RTORCH_ON: 144, RTORCH_OFF: 145, LEVER_OFF: 146, LEVER_ON: 147,
  BUTTON: 148, PLATE: 149, LAMP_OFF: 150, LAMP_ON: 151, SENSOR_TOP: 152, SENSOR_SIDE: 153,
  SHULKER_SIDE: 154, SHULKER_TOP: 155,
  REP_TOP: 156, REP_TOP_ON: 157, REP_SIDE: 158,
  COMP_TOP: 159, COMP_TOP_ON: 160, COMP_SIDE: 161,
  OBSERVER_SIDE: 162, OBSERVER_FACE: 163, OBSERVER_BACK: 164,
  PISTON_SIDE: 165, HEAD_SIDE: 166, HEAD_FACE: 167,
  DISP_SIDE: 168, DISP_HOLE: 169, DROP_SIDE: 170, DROP_HOLE: 171,
  HOPPER_TOP: 172, HOPPER_SIDE: 173, BULB_OFF: 174, BULB_ON: 175,
  TARGET_TOP: 176, TARGET_SIDE: 177,
};

export const WOOL_COLORS = [
  ['Orange', [235, 126, 40]], ['Magenta', [190, 74, 200]], ['Light Blue', [58, 175, 220]],
  ['Yellow', [248, 198, 40]], ['Lime', [112, 190, 32]], ['Pink', [238, 140, 172]],
  ['Gray', [62, 68, 72]], ['Light Gray', [142, 142, 135]], ['Cyan', [22, 138, 145]],
  ['Purple', [122, 42, 172]], ['Blue', [52, 58, 158]], ['Brown', [114, 72, 40]],
  ['Green', [85, 110, 28]], ['Red', [162, 40, 34]], ['Black', [22, 23, 26]],
];
const WOOL_ID0 = 90;

// def: {name, top, bottom, side (tile ids), solid (collision), opaque (face culling), breakable}
// extras: shape ('slab'|'stairs'|'cross'|'fence'|'pane'|'cactus'), colHeight (partial
// collision height), glow (renders unlit), needSupport (must sit on a solid block),
// facing/facings/item + hidden (stair orientation variants), icon (palette tile override)
export const BLOCKS = [];
const def = (id, name, top, bottom, side, opts = {}) => {
  BLOCKS[id] = { name, top, bottom, side, solid: true, opaque: true, breakable: true, ...opts };
};
BLOCKS[B.AIR] = { name: 'Air', solid: false, opaque: false, breakable: false };
def(B.GRASS, 'Grass', TILE.GRASS_TOP, TILE.DIRT, TILE.GRASS_SIDE);
def(B.DIRT, 'Dirt', TILE.DIRT, TILE.DIRT, TILE.DIRT);
def(B.STONE, 'Stone', TILE.STONE, TILE.STONE, TILE.STONE);
def(B.COBBLE, 'Cobblestone', TILE.COBBLE, TILE.COBBLE, TILE.COBBLE);
def(B.PLANK, 'Oak Planks', TILE.PLANK, TILE.PLANK, TILE.PLANK);
def(B.LOG, 'Oak Log', TILE.LOG_TOP, TILE.LOG_TOP, TILE.LOG_SIDE);
def(B.LEAVES, 'Leaves', TILE.LEAVES, TILE.LEAVES, TILE.LEAVES);
def(B.SAND, 'Sand', TILE.SAND, TILE.SAND, TILE.SAND);
def(B.GLASS, 'Glass', TILE.GLASS, TILE.GLASS, TILE.GLASS, { opaque: false });
def(B.WATER, 'Water', TILE.WATER, TILE.WATER, TILE.WATER, { solid: false, opaque: false, breakable: false });
def(B.SNOW, 'Snow', TILE.SNOW, TILE.DIRT, TILE.SNOW_SIDE);
def(B.BEDROCK, 'Bedrock', TILE.BEDROCK, TILE.BEDROCK, TILE.BEDROCK, { breakable: false });
def(B.COAL_ORE, 'Coal Ore', TILE.COAL, TILE.COAL, TILE.COAL);
def(B.IRON_ORE, 'Iron Ore', TILE.IRON, TILE.IRON, TILE.IRON);
def(B.DIAMOND_ORE, 'Diamond Ore', TILE.DIAMOND, TILE.DIAMOND, TILE.DIAMOND);
def(B.WOOL, 'Wool', TILE.WOOL, TILE.WOOL, TILE.WOOL);
def(B.CRAFTING_TABLE, 'Crafting Table', TILE.CRAFTING_TOP, TILE.PLANK, TILE.CRAFTING_SIDE);
def(B.STONE_BRICK, 'Stone Bricks', TILE.STONE_BRICK, TILE.STONE_BRICK, TILE.STONE_BRICK);
def(B.IRON_BLOCK, 'Iron Block', TILE.IRON_BLOCK, TILE.IRON_BLOCK, TILE.IRON_BLOCK);
def(B.DIAMOND_BLOCK, 'Diamond Block', TILE.DIAMOND_BLOCK, TILE.DIAMOND_BLOCK, TILE.DIAMOND_BLOCK);
def(B.ICE, 'Ice', TILE.ICE, TILE.ICE, TILE.ICE, { slip: 0.98 });
def(B.FURNACE, 'Furnace', TILE.FURNACE_TOP, TILE.FURNACE_TOP, TILE.FURNACE_FRONT);
def(B.LAVA, 'Lava', TILE.LAVA, TILE.LAVA, TILE.LAVA, { solid: false, opaque: false, breakable: false });
def(B.OBSIDIAN, 'Obsidian', TILE.OBSIDIAN, TILE.OBSIDIAN, TILE.OBSIDIAN);
def(B.PORTAL, 'Nether Portal', TILE.PORTAL, TILE.PORTAL, TILE.PORTAL, { solid: false, opaque: false, breakable: false });
def(B.NETHERRACK, 'Netherrack', TILE.NETHERRACK, TILE.NETHERRACK, TILE.NETHERRACK);
def(B.END_FRAME, 'End Portal Frame', TILE.END_FRAME, TILE.END_FRAME, TILE.END_FRAME);
def(B.END_FRAME_FILLED, 'Filled Portal Frame', TILE.END_FRAME_FILLED, TILE.END_FRAME_FILLED, TILE.END_FRAME_FILLED);
def(B.END_PORTAL, 'End Portal', TILE.END_PORTAL, TILE.END_PORTAL, TILE.END_PORTAL, { solid: false, opaque: false, breakable: false });
def(B.END_STONE, 'End Stone', TILE.END_STONE, TILE.END_STONE, TILE.END_STONE);
def(B.DRAGON_EGG, 'Dragon Egg', TILE.DRAGON_EGG, TILE.DRAGON_EGG, TILE.DRAGON_EGG);
def(B.CHEST, 'Chest', TILE.PLANK, TILE.PLANK, TILE.CHEST);
def(B.BED, 'Bed', TILE.BED_TOP, TILE.PLANK, TILE.BED_SIDE);

// --- building blocks --------------------------------------------------------
def(B.BRICKS, 'Bricks', TILE.BRICKS, TILE.BRICKS, TILE.BRICKS);
def(B.SANDSTONE, 'Sandstone', TILE.SANDSTONE_TOP, TILE.SANDSTONE_TOP, TILE.SANDSTONE_SIDE);
def(B.SMOOTH_STONE, 'Smooth Stone', TILE.SMOOTH_STONE, TILE.SMOOTH_STONE, TILE.SMOOTH_STONE);
def(B.MOSSY_COBBLE, 'Mossy Cobblestone', TILE.MOSSY_COBBLE, TILE.MOSSY_COBBLE, TILE.MOSSY_COBBLE);
def(B.GRAVEL, 'Gravel', TILE.GRAVEL, TILE.GRAVEL, TILE.GRAVEL);
def(B.CLAY, 'Clay', TILE.CLAY, TILE.CLAY, TILE.CLAY);
def(B.BOOKSHELF, 'Bookshelf', TILE.PLANK, TILE.PLANK, TILE.BOOKSHELF);
def(B.GLOWSTONE, 'Glowstone', TILE.GLOWSTONE, TILE.GLOWSTONE, TILE.GLOWSTONE, { glow: true });
def(B.QUARTZ_BLOCK, 'Quartz Block', TILE.QUARTZ, TILE.QUARTZ, TILE.QUARTZ);
def(B.NETHER_BRICK, 'Nether Bricks', TILE.NETHER_BRICK, TILE.NETHER_BRICK, TILE.NETHER_BRICK);
def(B.GOLD_ORE, 'Gold Ore', TILE.GOLD_ORE, TILE.GOLD_ORE, TILE.GOLD_ORE);
def(B.REDSTONE_ORE, 'Redstone Ore', TILE.REDSTONE_ORE, TILE.REDSTONE_ORE, TILE.REDSTONE_ORE);
def(B.LAPIS_ORE, 'Lapis Lazuli Ore', TILE.LAPIS_ORE, TILE.LAPIS_ORE, TILE.LAPIS_ORE);
def(B.EMERALD_ORE, 'Emerald Ore', TILE.EMERALD_ORE, TILE.EMERALD_ORE, TILE.EMERALD_ORE);
def(B.QUARTZ_ORE, 'Nether Quartz Ore', TILE.QUARTZ_ORE, TILE.QUARTZ_ORE, TILE.QUARTZ_ORE);
def(B.GOLD_BLOCK, 'Gold Block', TILE.GOLD_BLOCK, TILE.GOLD_BLOCK, TILE.GOLD_BLOCK);
def(B.REDSTONE_BLOCK, 'Redstone Block', TILE.REDSTONE_BLOCK, TILE.REDSTONE_BLOCK, TILE.REDSTONE_BLOCK);
def(B.LAPIS_BLOCK, 'Lapis Lazuli Block', TILE.LAPIS_BLOCK, TILE.LAPIS_BLOCK, TILE.LAPIS_BLOCK);
def(B.EMERALD_BLOCK, 'Emerald Block', TILE.EMERALD_BLOCK, TILE.EMERALD_BLOCK, TILE.EMERALD_BLOCK);
def(B.BIRCH_LOG, 'Birch Log', TILE.LOG_TOP, TILE.LOG_TOP, TILE.BIRCH_LOG);
def(B.BIRCH_PLANK, 'Birch Planks', TILE.BIRCH_PLANK, TILE.BIRCH_PLANK, TILE.BIRCH_PLANK);
def(B.SPRUCE_LOG, 'Spruce Log', TILE.LOG_TOP, TILE.LOG_TOP, TILE.SPRUCE_LOG);
def(B.SPRUCE_PLANK, 'Spruce Planks', TILE.SPRUCE_PLANK, TILE.SPRUCE_PLANK, TILE.SPRUCE_PLANK);
def(B.PUMPKIN, 'Pumpkin', TILE.PUMPKIN_TOP, TILE.PUMPKIN_TOP, TILE.PUMPKIN_SIDE);
def(B.MELON, 'Melon', TILE.MELON_TOP, TILE.MELON_TOP, TILE.MELON_SIDE);
def(B.HAY, 'Hay Bale', TILE.HAY_TOP, TILE.HAY_TOP, TILE.HAY_SIDE);
def(B.SNOW_BLOCK, 'Snow Block', TILE.SNOW, TILE.SNOW, TILE.SNOW);
def(B.TNT, 'TNT', TILE.TNT_TOP, TILE.TNT_TOP, TILE.TNT_SIDE);
def(B.CACTUS, 'Cactus', TILE.CACTUS_TOP, TILE.CACTUS_TOP, TILE.CACTUS_SIDE,
  { shape: 'cactus', opaque: false, needSupport: true });
def(B.TORCH, 'Torch', TILE.TORCH, TILE.TORCH, TILE.TORCH,
  { shape: 'cross', glow: true, solid: false, opaque: false, needSupport: true });
def(B.FENCE, 'Oak Fence', TILE.PLANK, TILE.PLANK, TILE.PLANK,
  { shape: 'fence', opaque: false, icon: TILE.ICON_FENCE });
def(B.GLASS_PANE, 'Glass Pane', TILE.GLASS, TILE.GLASS, TILE.GLASS, { shape: 'pane', opaque: false });
def(B.POPPY, 'Poppy', TILE.POPPY, TILE.POPPY, TILE.POPPY,
  { shape: 'cross', solid: false, opaque: false, needSupport: true });
def(B.RED_MUSHROOM, 'Red Mushroom', TILE.MUSHROOM_RED, TILE.MUSHROOM_RED, TILE.MUSHROOM_RED,
  { shape: 'cross', solid: false, opaque: false, needSupport: true });
def(B.BROWN_MUSHROOM, 'Brown Mushroom', TILE.MUSHROOM_BROWN, TILE.MUSHROOM_BROWN, TILE.MUSHROOM_BROWN,
  { shape: 'cross', solid: false, opaque: false, needSupport: true });
def(B.SUGAR_CANE, 'Sugar Cane', TILE.CANE_TOP, TILE.CANE_TOP, TILE.CANE_SIDE,
  { shape: 'cactus', solid: false, opaque: false, needSupport: true });
def(B.LANTERN, 'Lantern', TILE.LANTERN, TILE.LANTERN, TILE.LANTERN, { glow: true });
def(B.SLIME_BLOCK, 'Slime Block', TILE.SLIME, TILE.SLIME, TILE.SLIME);
def(B.REDSTONE_DUST, 'Redstone Dust', TILE.DUST_OFF, TILE.DUST_OFF, TILE.DUST_OFF,
  { shape: 'dust', solid: false, opaque: false, needSupport: true });
def(B.REDSTONE_DUST_ON, 'Redstone Dust', TILE.DUST_ON, TILE.DUST_ON, TILE.DUST_ON,
  { shape: 'dust', solid: false, opaque: false, needSupport: true, glow: true, item: B.REDSTONE_DUST, hidden: true });
def(B.RTORCH, 'Redstone Torch', TILE.RTORCH_ON, TILE.RTORCH_ON, TILE.RTORCH_ON,
  { shape: 'cross', glow: true, solid: false, opaque: false, needSupport: true });
def(B.RTORCH_OFF, 'Redstone Torch', TILE.RTORCH_OFF, TILE.RTORCH_OFF, TILE.RTORCH_OFF,
  { shape: 'cross', solid: false, opaque: false, needSupport: true, item: B.RTORCH, hidden: true });
def(B.LEVER, 'Lever', TILE.LEVER_OFF, TILE.LEVER_OFF, TILE.LEVER_OFF,
  { shape: 'cross', solid: false, opaque: false, needSupport: true });
def(B.LEVER_ON, 'Lever', TILE.LEVER_ON, TILE.LEVER_ON, TILE.LEVER_ON,
  { shape: 'cross', solid: false, opaque: false, needSupport: true, item: B.LEVER, hidden: true });
def(B.BUTTON, 'Stone Button', TILE.BUTTON, TILE.BUTTON, TILE.BUTTON,
  { shape: 'plate', solid: false, opaque: false, needSupport: true, plateH: 3 / 16 });
def(B.BUTTON_ON, 'Stone Button', TILE.BUTTON, TILE.BUTTON, TILE.BUTTON,
  { shape: 'plate', solid: false, opaque: false, needSupport: true, plateH: 1 / 16, item: B.BUTTON, hidden: true });
def(B.PLATE, 'Stone Pressure Plate', TILE.PLATE, TILE.PLATE, TILE.PLATE,
  { shape: 'plate', solid: false, opaque: false, needSupport: true, plateH: 2 / 16 });
def(B.PLATE_ON, 'Stone Pressure Plate', TILE.PLATE, TILE.PLATE, TILE.PLATE,
  { shape: 'plate', solid: false, opaque: false, needSupport: true, plateH: 1 / 16, item: B.PLATE, hidden: true });
def(B.LAMP, 'Redstone Lamp', TILE.LAMP_OFF, TILE.LAMP_OFF, TILE.LAMP_OFF);
def(B.LAMP_ON, 'Redstone Lamp', TILE.LAMP_ON, TILE.LAMP_ON, TILE.LAMP_ON,
  { glow: true, item: B.LAMP, hidden: true });
def(B.SENSOR, 'Daylight Sensor', TILE.SENSOR_TOP, TILE.SENSOR_TOP, TILE.SENSOR_SIDE,
  { shape: 'slab', opaque: false, colHeight: 0.5, needSupport: true });
def(B.SHULKER_BOX, 'Shulker Box', TILE.SHULKER_TOP, TILE.SHULKER_TOP, TILE.SHULKER_SIDE);
// repeaters & comparators: 4 facings (0:+x 1:-x 2:+z 3:-z) x off/on
{
  const repOff = [B.REPEATER, B.REPEATER + 1, B.REPEATER + 2, B.REPEATER + 3];
  for (let i = 0; i < 4; i++) {
    def(B.REPEATER + i, 'Redstone Repeater', TILE.REP_TOP, TILE.REP_SIDE, TILE.REP_SIDE, {
      shape: 'repeater', opaque: false, colHeight: 0.5, needSupport: true,
      facing: i, facings: repOff, item: B.REPEATER, hidden: i > 0,
    });
    def(B.REPEATER + 4 + i, 'Redstone Repeater', TILE.REP_TOP_ON, TILE.REP_SIDE, TILE.REP_SIDE, {
      shape: 'repeater', opaque: false, colHeight: 0.5, needSupport: true, glow: true,
      facing: i, item: B.REPEATER, hidden: true,
    });
  }
  const compOff = [B.COMPARATOR, B.COMPARATOR + 1, B.COMPARATOR + 2, B.COMPARATOR + 3];
  for (let i = 0; i < 4; i++) {
    def(B.COMPARATOR + i, 'Redstone Comparator', TILE.COMP_TOP, TILE.COMP_SIDE, TILE.COMP_SIDE, {
      shape: 'repeater', comp: true, opaque: false, colHeight: 0.5, needSupport: true,
      facing: i, facings: compOff, item: B.COMPARATOR, hidden: i > 0,
    });
    def(B.COMPARATOR + 4 + i, 'Redstone Comparator', TILE.COMP_TOP_ON, TILE.COMP_SIDE, TILE.COMP_SIDE, {
      shape: 'repeater', comp: true, opaque: false, colHeight: 0.5, needSupport: true, glow: true,
      facing: i, item: B.COMPARATOR, hidden: true,
    });
  }
}
def(B.OBSERVER, 'Observer', TILE.OBSERVER_SIDE, TILE.OBSERVER_SIDE, TILE.OBSERVER_SIDE,
  { shape: 'frontplate', plate: TILE.OBSERVER_FACE, back: TILE.OBSERVER_BACK });
def(B.OBSERVER_ON, 'Observer', TILE.OBSERVER_SIDE, TILE.OBSERVER_SIDE, TILE.OBSERVER_SIDE,
  { shape: 'frontplate', plate: TILE.OBSERVER_FACE, back: TILE.OBSERVER_BACK, item: B.OBSERVER, hidden: true });
def(B.PISTON, 'Piston', TILE.HEAD_FACE, TILE.PISTON_SIDE, TILE.PISTON_SIDE, { opaque: false });
def(B.STICKY_PISTON, 'Sticky Piston', TILE.HEAD_FACE, TILE.PISTON_SIDE, TILE.PISTON_SIDE, { opaque: false });
def(B.PISTON_HEAD, 'Piston Head', TILE.HEAD_SIDE, TILE.HEAD_SIDE, TILE.HEAD_SIDE,
  { shape: 'pistonhead', opaque: false, hidden: true });
def(B.DISPENSER, 'Dispenser', TILE.DISP_SIDE, TILE.DISP_SIDE, TILE.DISP_SIDE,
  { shape: 'frontplate', plate: TILE.DISP_HOLE });
def(B.DROPPER, 'Dropper', TILE.DROP_SIDE, TILE.DROP_SIDE, TILE.DROP_SIDE,
  { shape: 'frontplate', plate: TILE.DROP_HOLE });
def(B.HOPPER, 'Hopper', TILE.HOPPER_TOP, TILE.HOPPER_SIDE, TILE.HOPPER_SIDE);
def(B.BULB, 'Copper Bulb', TILE.BULB_OFF, TILE.BULB_OFF, TILE.BULB_OFF);
def(B.BULB_ON, 'Copper Bulb', TILE.BULB_ON, TILE.BULB_ON, TILE.BULB_ON,
  { glow: true, item: B.BULB, hidden: true });
def(B.TARGET, 'Target', TILE.TARGET_TOP, TILE.TARGET_TOP, TILE.TARGET_SIDE);
def(B.DANDELION, 'Dandelion', TILE.DANDELION, TILE.DANDELION, TILE.DANDELION,
  { shape: 'cross', solid: false, opaque: false, needSupport: true });

const defSlab = (id, name, top, bottom, side, icon) =>
  def(id, name, top, bottom, side, { shape: 'slab', opaque: false, colHeight: 0.5, icon });
defSlab(B.OAK_SLAB, 'Oak Slab', TILE.PLANK, TILE.PLANK, TILE.PLANK, TILE.ICON_SLAB_OAK);
defSlab(B.COBBLE_SLAB, 'Cobblestone Slab', TILE.COBBLE, TILE.COBBLE, TILE.COBBLE, TILE.ICON_SLAB_COBBLE);
defSlab(B.STONE_SLAB, 'Stone Slab', TILE.SMOOTH_STONE, TILE.SMOOTH_STONE, TILE.SMOOTH_STONE, TILE.ICON_SLAB_STONE);
defSlab(B.STONE_BRICK_SLAB, 'Stone Brick Slab', TILE.STONE_BRICK, TILE.STONE_BRICK, TILE.STONE_BRICK, TILE.ICON_SLAB_STONE_BRICK);
defSlab(B.BRICK_SLAB, 'Brick Slab', TILE.BRICKS, TILE.BRICKS, TILE.BRICKS, TILE.ICON_SLAB_BRICK);
defSlab(B.SANDSTONE_SLAB, 'Sandstone Slab', TILE.SANDSTONE_TOP, TILE.SANDSTONE_TOP, TILE.SANDSTONE_SIDE, TILE.ICON_SLAB_SANDSTONE);

// stairs: the high step faces STAIR_DIRS[facing]; variants 1-3 are hidden placement states
export const STAIR_DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const PISTON_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const defStairs = (baseId, name, top, bottom, side, icon) => {
  const facings = [baseId, baseId + 1, baseId + 2, baseId + 3];
  for (let i = 0; i < 4; i++) {
    def(facings[i], name, top, bottom, side, {
      shape: 'stairs', opaque: false, colHeight: 0.5, icon,
      facing: i, facings, item: baseId, hidden: i > 0,
    });
  }
};
defStairs(B.OAK_STAIRS, 'Oak Stairs', TILE.PLANK, TILE.PLANK, TILE.PLANK, TILE.ICON_STAIR_OAK);
defStairs(B.COBBLE_STAIRS, 'Cobblestone Stairs', TILE.COBBLE, TILE.COBBLE, TILE.COBBLE, TILE.ICON_STAIR_COBBLE);
defStairs(B.STONE_BRICK_STAIRS, 'Stone Brick Stairs', TILE.STONE_BRICK, TILE.STONE_BRICK, TILE.STONE_BRICK, TILE.ICON_STAIR_STONE_BRICK);
defStairs(B.BRICK_STAIRS, 'Brick Stairs', TILE.BRICKS, TILE.BRICKS, TILE.BRICKS, TILE.ICON_STAIR_BRICK);
defStairs(B.STONE_STAIRS, 'Stone Stairs', TILE.SMOOTH_STONE, TILE.SMOOTH_STONE, TILE.SMOOTH_STONE, TILE.ICON_STAIR_STONE);

def(B.DARK_LOG, 'Dark Oak Log', TILE.DARK_LOG_TOP, TILE.DARK_LOG_TOP, TILE.DARK_LOG_SIDE);
def(B.DARK_PLANK, 'Dark Oak Planks', TILE.DARK_PLANK, TILE.DARK_PLANK, TILE.DARK_PLANK);
def(B.IRON_BARS, 'Iron Bars', TILE.IRON_BARS, TILE.IRON_BARS, TILE.IRON_BARS, { shape: 'pane', opaque: false });
def(B.MAGMA, 'Magma Block', TILE.MAGMA, TILE.MAGMA, TILE.MAGMA, { glow: true });
def(B.PACKED_ICE, 'Packed Ice', TILE.PACKED_ICE, TILE.PACKED_ICE, TILE.PACKED_ICE, { slip: 0.96 });
def(B.SEA_LANTERN, 'Sea Lantern', TILE.SEA_LANTERN, TILE.SEA_LANTERN, TILE.SEA_LANTERN, { glow: true });
def(B.CHISELED_BRICKS, 'Chiseled Stone Bricks', TILE.CHISELED_BRICKS, TILE.CHISELED_BRICKS, TILE.CHISELED_BRICKS);
def(B.TINTED_GLASS, 'Tinted Glass', TILE.TINTED_GLASS, TILE.TINTED_GLASS, TILE.TINTED_GLASS, { opaque: false });
def(B.CRYING_OBSIDIAN, 'Crying Obsidian', TILE.CRYING_OBSIDIAN, TILE.CRYING_OBSIDIAN, TILE.CRYING_OBSIDIAN, { glow: true });
def(B.NETHERITE_BLOCK, 'Netherite Block', TILE.NETHERITE_BLOCK, TILE.NETHERITE_BLOCK, TILE.NETHERITE_BLOCK);
def(B.BONE_BLOCK, 'Bone Block', TILE.BONE_TOP, TILE.BONE_TOP, TILE.BONE_SIDE);
def(B.AMETHYST, 'Amethyst Block', TILE.AMETHYST, TILE.AMETHYST, TILE.AMETHYST, { glow: true });

export const WOOL_IDS = [B.WOOL];
WOOL_COLORS.forEach(([wname], i) => {
  def(WOOL_ID0 + i, wname + ' Wool', TILE.WOOL0 + i, TILE.WOOL0 + i, TILE.WOOL0 + i);
  WOOL_IDS.push(WOOL_ID0 + i);
});

// ladders: climbable, attached flat against the wall on side STAIR_DIRS[facing]
{
  const facings = [B.LADDER, B.LADDER + 1, B.LADDER + 2, B.LADDER + 3];
  for (let i = 0; i < 4; i++) {
    def(facings[i], 'Ladder', TILE.LADDER, TILE.LADDER, TILE.LADDER, {
      shape: 'ladder', solid: false, opaque: false, climb: true,
      facing: i, facings, item: B.LADDER, hidden: i > 0,
    });
  }
}

// doors: two blocks tall. Bottom ids encode facing + open state; the top halves
// borrow the bottom's geometry at mesh time (they only carry solidity + texture).
{
  const facings = [B.DOOR, B.DOOR + 1, B.DOOR + 2, B.DOOR + 3];
  for (let i = 0; i < 4; i++) {
    def(B.DOOR + i, 'Oak Door', TILE.DOOR_BOTTOM, TILE.DOOR_BOTTOM, TILE.DOOR_BOTTOM, {
      shape: 'door', opaque: false, doorPart: true, icon: TILE.ICON_DOOR,
      facing: i, facings, item: B.DOOR, hidden: i > 0, toggleId: B.DOOR + 4 + i,
    });
    def(B.DOOR + 4 + i, 'Oak Door', TILE.DOOR_BOTTOM, TILE.DOOR_BOTTOM, TILE.DOOR_BOTTOM, {
      shape: 'door', solid: false, opaque: false, doorPart: true, open: true,
      facing: i, facings, item: B.DOOR, hidden: true, toggleId: B.DOOR + i,
    });
  }
  def(B.DOOR_TOP, 'Oak Door', TILE.DOOR_TOP, TILE.DOOR_TOP, TILE.DOOR_TOP, {
    shape: 'door', opaque: false, doorPart: true, doorTop: true,
    facing: 0, item: B.DOOR, hidden: true, toggleId: B.DOOR_TOP_OPEN,
  });
  def(B.DOOR_TOP_OPEN, 'Oak Door', TILE.DOOR_TOP, TILE.DOOR_TOP, TILE.DOOR_TOP, {
    shape: 'door', solid: false, opaque: false, doorPart: true, doorTop: true, open: true,
    facing: 0, item: B.DOOR, hidden: true, toggleId: B.DOOR_TOP,
  });
}

// --- new blocks --------------------------------------------------------------
def(B.COAL_BLOCK, 'Coal Block', TILE.COAL_BLOCK, TILE.COAL_BLOCK, TILE.COAL_BLOCK);
def(B.JACK_O_LANTERN, "Jack o'Lantern", TILE.PUMPKIN_TOP, TILE.PUMPKIN_TOP, TILE.JACK_SIDE, { glow: true });
def(B.MOSSY_STONE_BRICK, 'Mossy Stone Bricks', TILE.MOSSY_STONE_BRICK, TILE.MOSSY_STONE_BRICK, TILE.MOSSY_STONE_BRICK);
defStairs(B.SPRUCE_STAIRS, 'Spruce Stairs', TILE.SPRUCE_PLANK, TILE.SPRUCE_PLANK, TILE.SPRUCE_PLANK, TILE.ICON_STAIR_SPRUCE);
defStairs(B.SANDSTONE_STAIRS, 'Sandstone Stairs', TILE.SANDSTONE_TOP, TILE.SANDSTONE_TOP, TILE.SANDSTONE_SIDE, TILE.ICON_STAIR_SANDSTONE);
def(B.BLUE_ORCHID, 'Blue Orchid', TILE.BLUE_ORCHID, TILE.BLUE_ORCHID, TILE.BLUE_ORCHID,
  { shape: 'cross', solid: false, opaque: false, needSupport: true });
def(B.ALLIUM, 'Allium', TILE.ALLIUM, TILE.ALLIUM, TILE.ALLIUM,
  { shape: 'cross', solid: false, opaque: false, needSupport: true });
def(B.COBWEB, 'Cobweb', TILE.COBWEB, TILE.COBWEB, TILE.COBWEB, { solid: false, opaque: false });
def(B.ENCHANT_TABLE, 'Enchanting Table', TILE.ENCHANT_TOP, TILE.OBSIDIAN, TILE.ENCHANT_SIDE);
def(B.JUKEBOX, 'Jukebox', TILE.JUKEBOX_TOP, TILE.PLANK, TILE.JUKEBOX_SIDE);
def(B.NOTE_BLOCK, 'Note Block', TILE.NOTE_BLOCK, TILE.NOTE_BLOCK, TILE.NOTE_BLOCK);
defSlab(B.SPRUCE_SLAB, 'Spruce Slab', TILE.SPRUCE_PLANK, TILE.SPRUCE_PLANK, TILE.SPRUCE_PLANK, TILE.ICON_SLAB_SPRUCE);
defSlab(B.BIRCH_SLAB, 'Birch Slab', TILE.BIRCH_PLANK, TILE.BIRCH_PLANK, TILE.BIRCH_PLANK, TILE.ICON_SLAB_BIRCH);

export const isSolid = (id) => !!(BLOCKS[id] && BLOCKS[id].solid);
export const isOpaque = (id) => !!(BLOCKS[id] && BLOCKS[id].opaque);

// ---------------------------------------------------------------------------
// Sub-box geometry for non-cube shapes (shared by the chunk mesher and the
// held-item / dropped-item meshes).

const BOX_FACES = [
  { dir: [1, 0, 0], shade: 0.8, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dir: [-1, 0, 0], shade: 0.8, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dir: [0, 1, 0], shade: 1.0, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], shade: 0.55, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], shade: 0.72, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], shade: 0.72, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

// Boxes for a shaped block, in cell-local 0..1 coords. conn = {px,nx,pz,nz}
// connectivity for fences/panes (null = unconnected, used for item meshes).
export function blockBoxes(id, conn = null) {
  const blk = BLOCKS[id];
  const t = { top: blk.top, bottom: blk.bottom, side: blk.side };
  const bx = (x0, y0, z0, x1, y1, z1) => ({ x0, y0, z0, x1, y1, z1, ...t });
  switch (blk.shape) {
    case 'slab': return [bx(0, 0, 0, 1, 0.5, 1)];
    case 'stairs': {
      const [dx, dz] = STAIR_DIRS[blk.facing];
      return [
        bx(0, 0, 0, 1, 0.5, 1),
        bx(dx > 0 ? 0.5 : 0, 0.5, dz > 0 ? 0.5 : 0, dx < 0 ? 0.5 : 1, 1, dz < 0 ? 0.5 : 1),
      ];
    }
    case 'cactus': return [bx(1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16)];
    case 'dust': { // redstone wire: center pad + arms toward connected dust
      const c = conn || {};
      const h = 2 / 16;
      const boxes = [bx(6 / 16, 0, 6 / 16, 10 / 16, h, 10 / 16)];
      if (c.nx) boxes.push(bx(0, 0, 7 / 16, 6 / 16, h, 9 / 16));
      if (c.px) boxes.push(bx(10 / 16, 0, 7 / 16, 1, h, 9 / 16));
      if (c.nz) boxes.push(bx(7 / 16, 0, 0, 9 / 16, h, 6 / 16));
      if (c.pz) boxes.push(bx(7 / 16, 0, 10 / 16, 9 / 16, h, 1));
      return boxes;
    }
    case 'plate': return [bx(1 / 16, 0, 1 / 16, 15 / 16, blk.plateH || 2 / 16, 15 / 16)];
    case 'repeater': {
      // slab base + torch nubs: input (back), output (front), delay slider / side inputs
      const c = conn || {};
      const f = c.facing || 0;
      const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][f];
      const boxes = [bx(0, 0, 0, 1, 8 / 16, 1)];
      const nub = (ox, oz, h) => boxes.push(bx(ox - 1 / 16, 8 / 16, oz - 1 / 16, ox + 1 / 16, 8 / 16 + h, oz + 1 / 16));
      const cx = 8 / 16, cz = 8 / 16;
      nub(cx - dx * 5 / 16, cz - dz * 5 / 16, 4 / 16); // input torch (back)
      if (blk.comp) {
        nub(cx + dz * 5 / 16, cz + dx * 5 / 16, 4 / 16); // left side input
        nub(cx - dz * 5 / 16, cz - dx * 5 / 16, 4 / 16); // right side input
        nub(cx + dx * 5 / 16, cz + dz * 5 / 16, c.sub ? 7 / 16 : 4 / 16); // output (tall in subtract mode)
      } else {
        const slide = ((c.delay || 1) - 1) * 2 / 16;
        nub(cx - dx * slide, cz - dz * slide, 3 / 16); // delay slider
        nub(cx + dx * 5 / 16, cz + dz * 5 / 16, 4 / 16); // output torch (front)
      }
      return boxes;
    }
    case 'pistonhead': {
      const f = (conn && conn.f) || 0;
      const [dx, dy, dz] = PISTON_DIRS[f];
      const boxes = [];
      if (dx !== 0) boxes.push(bx(0, 6 / 16, 6 / 16, 1, 10 / 16, 10 / 16)); // arm
      else if (dy !== 0) boxes.push(bx(6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16));
      else boxes.push(bx(6 / 16, 6 / 16, 0, 10 / 16, 10 / 16, 1));
      const p = { top: TILE.HEAD_FACE, bottom: TILE.HEAD_FACE, side: TILE.HEAD_FACE };
      if (dx > 0) boxes.push({ x0: 12 / 16, y0: 0, z0: 0, x1: 1, y1: 1, z1: 1, ...p });
      else if (dx < 0) boxes.push({ x0: 0, y0: 0, z0: 0, x1: 4 / 16, y1: 1, z1: 1, ...p });
      else if (dy > 0) boxes.push({ x0: 0, y0: 12 / 16, z0: 0, x1: 1, y1: 1, z1: 1, ...p });
      else if (dy < 0) boxes.push({ x0: 0, y0: 0, z0: 0, x1: 1, y1: 4 / 16, z1: 1, ...p });
      else if (dz > 0) boxes.push({ x0: 0, y0: 0, z0: 12 / 16, x1: 1, y1: 1, z1: 1, ...p });
      else boxes.push({ x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 4 / 16, ...p });
      return boxes;
    }
    case 'frontplate': {
      const f = (conn && conn.f) || 0;
      const boxes = [bx(0, 0, 0, 1, 1, 1)];
      const P = [
        [14 / 16, 5 / 16, 5 / 16, 1, 11 / 16, 11 / 16], [0, 5 / 16, 5 / 16, 2 / 16, 11 / 16, 11 / 16],
        [5 / 16, 14 / 16, 5 / 16, 11 / 16, 1, 11 / 16], [5 / 16, 0, 5 / 16, 11 / 16, 2 / 16, 11 / 16],
        [5 / 16, 5 / 16, 14 / 16, 11 / 16, 11 / 16, 1], [5 / 16, 5 / 16, 0, 11 / 16, 11 / 16, 2 / 16],
      ];
      const q = P[f], qb = P[f ^ 1];
      boxes.push({ x0: q[0], y0: q[1], z0: q[2], x1: q[3], y1: q[4], z1: q[5], top: blk.plate, bottom: blk.plate, side: blk.plate });
      if (blk.back != null) boxes.push({ x0: qb[0], y0: qb[1], z0: qb[2], x1: qb[3], y1: qb[4], z1: qb[5], top: blk.back, bottom: blk.back, side: blk.back });
      return boxes;
    }
    case 'ladder':
    case 'door': {
      // a thin panel flush against one cell wall; open doors swing 90°
      const f = blk.open ? (blk.facing + 1) % 4 : blk.facing;
      const [dx, dz] = STAIR_DIRS[f];
      const t = blk.shape === 'ladder' ? 1 / 16 : 3 / 16;
      if (dx > 0) return [bx(1 - t, 0, 0, 1, 1, 1)];
      if (dx < 0) return [bx(0, 0, 0, t, 1, 1)];
      if (dz > 0) return [bx(0, 0, 1 - t, 1, 1, 1)];
      return [bx(0, 0, 0, 1, 1, t)];
    }
    case 'fence': {
      const c = conn || {};
      const boxes = [bx(6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16)];
      for (const [y0, y1] of [[6 / 16, 9 / 16], [12 / 16, 15 / 16]]) {
        if (c.nx) boxes.push(bx(0, y0, 7 / 16, 6 / 16, y1, 9 / 16));
        if (c.px) boxes.push(bx(10 / 16, y0, 7 / 16, 1, y1, 9 / 16));
        if (c.nz) boxes.push(bx(7 / 16, y0, 0, 9 / 16, y1, 6 / 16));
        if (c.pz) boxes.push(bx(7 / 16, y0, 10 / 16, 9 / 16, y1, 1));
      }
      return boxes;
    }
    case 'pane': {
      const c = conn || {};
      const xConn = c.nx || c.px, zConn = c.nz || c.pz;
      const boxes = [];
      if (xConn || !zConn) boxes.push(bx(c.nx ? 0 : 7 / 16, 0, 7 / 16, c.px ? 1 : 9 / 16, 1, 9 / 16));
      if (zConn || (!xConn && !zConn)) boxes.push(bx(7 / 16, 0, c.nz ? 0 : 7 / 16, 9 / 16, 1, c.pz ? 1 : 9 / 16));
      return boxes;
    }
  }
  return [bx(0, 0, 0, 1, 1, 1)];
}

// Emit one box into buf {pos,nor,uv,col,idx} at cell origin (x,y,z).
// cull: per-face booleans ([+x,-x,+y,-y,+z,-z]) — skip faces flush against an
// opaque neighbor. UVs sample the sub-rect of the tile so patterns line up.
export function emitBox(buf, x, y, z, box, cull = null) {
  const flush = [box.x1 === 1, box.x0 === 0, box.y1 === 1, box.y0 === 0, box.z1 === 1, box.z0 === 0];
  for (let i = 0; i < 6; i++) {
    if (cull && cull[i] && flush[i]) continue;
    const f = BOX_FACES[i];
    const tile = i === 2 ? box.top : i === 3 ? box.bottom : box.side;
    const r = tileUV(tile);
    const base = buf.pos.length / 3;
    for (const c of f.corners) {
      const px = c[0] ? box.x1 : box.x0, py = c[1] ? box.y1 : box.y0, pz = c[2] ? box.z1 : box.z0;
      let uf, vf;
      if (i === 0) { uf = 1 - pz; vf = py; }
      else if (i === 1) { uf = pz; vf = py; }
      else if (i === 2) { uf = px; vf = 1 - pz; }
      else if (i === 3) { uf = px; vf = pz; }
      else if (i === 4) { uf = px; vf = py; }
      else { uf = 1 - px; vf = py; }
      buf.pos.push(x + px, y + py, z + pz);
      buf.nor.push(f.dir[0], f.dir[1], f.dir[2]);
      buf.uv.push(r.u0 + (r.u1 - r.u0) * uf, r.v0 + (r.v1 - r.v0) * vf);
      buf.col.push(f.shade, f.shade, f.shade);
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

// Two crossed quads (flowers, torches), emitted double-sided.
export function emitCross(buf, x, y, z, tile) {
  const r = tileUV(tile);
  const a = 0.15, b = 0.85;
  const quads = [
    [[a, 0, a], [b, 0, b], [b, 1, b], [a, 1, a]],
    [[b, 0, b], [a, 0, a], [a, 1, a], [b, 1, b]],
    [[a, 0, b], [b, 0, a], [b, 1, a], [a, 1, b]],
    [[b, 0, a], [a, 0, b], [a, 1, b], [b, 1, a]],
  ];
  for (const q of quads) {
    const base = buf.pos.length / 3;
    q.forEach((p, i) => {
      buf.pos.push(x + p[0], y + p[1], z + p[2]);
      buf.nor.push(0, 1, 0);
      const uf = (i === 0 || i === 3) ? 0 : 1;
      buf.uv.push(r.u0 + (r.u1 - r.u0) * uf, r.v0 + (r.v1 - r.v0) * p[1]);
      buf.col.push(0.95, 0.95, 0.95);
    });
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

// ---------------------------------------------------------------------------
// Texture atlas: 16x8 grid of 16px tiles -> 256x128 canvas.
const T = 16, COLS = 16, ROWS = 12;
export const ATLAS_COLS = COLS;

const ORE_SPOTS = {
  [TILE.COAL]: { color: [38, 38, 40], spots: [[4, 5], [11, 3], [7, 10], [12, 12], [3, 12]] },
  [TILE.IRON]: { color: [216, 175, 147], spots: [[5, 4], [11, 6], [4, 11], [10, 12]] },
  [TILE.DIAMOND]: { color: [92, 219, 213], spots: [[4, 4], [11, 5], [6, 11], [12, 11]] },
  [TILE.GOLD_ORE]: { color: [250, 214, 80], spots: [[4, 4], [11, 6], [7, 11], [13, 12]] },
  [TILE.REDSTONE_ORE]: { color: [220, 40, 36], spots: [[4, 5], [10, 3], [6, 10], [12, 12], [3, 13]] },
  [TILE.LAPIS_ORE]: { color: [40, 78, 182], spots: [[5, 4], [11, 5], [4, 11], [10, 11], [13, 13]] },
  [TILE.EMERALD_ORE]: { color: [62, 210, 108], spots: [[5, 5], [10, 8], [6, 12]] },
  [TILE.QUARTZ_ORE]: { color: [234, 228, 220], spots: [[4, 4], [11, 6], [6, 11], [12, 12]], base: TILE.NETHERRACK },
};

// TNT label rows (y 6..9)
const TNT_TXT = [
  '.ttt..t..t.ttt..',
  '..t...tt.t..t...',
  '..t...t.tt..t...',
  '..t...t..t..t...',
];

export function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * T; canvas.height = ROWS * T;
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(1337 * 7);

  const jitter = (base, amt) => {
    const o = (rand() - 0.5) * 2 * amt;
    return [base[0] + o, base[1] + o, base[2] + o];
  };

  // painter factories
  const solid = (base, amt = 8) => () => [...jitter(base, amt), 255];
  const bordered = (inner, edge) => (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter(edge, 5), 255];
    return [...jitter(inner, 6), 255];
  };
  const brickP = (brick, mortar) => (x, y) => {
    const row = y >> 2, off = (row % 2) * 4;
    if (y % 4 === 3 || (x + off) % 8 === 7) return [...jitter(mortar, 5), 255];
    const v = (hash2((((x + off) >> 3) + row * 2) | 0, row, 31) - 0.5) * 22; // per-brick tone
    const c = jitter(brick, 5);
    return [c[0] + v, c[1] + v, c[2] + v, 255];
  };
  const plankP = (main, groove) => (x, y) => {
    if (y % 4 === 3) return [...jitter(groove, 6), 255];
    if ((y < 4 && x === 3) || (y >= 4 && y < 8 && x === 11) || (y >= 8 && y < 12 && x === 6) || (y >= 12 && x === 13))
      return [...jitter(groove, 6), 255];
    return [...jitter(main, 8), 255];
  };
  // MC-style clustered tones: NxN tonal cells + fine grain (deterministic per pixel)
  const cluster = (tones, seed, cell = 2, grain = 6) => (x, y) => {
    const h = hash2(Math.floor(x / cell), Math.floor(y / cell), seed);
    const t = tones[Math.min(tones.length - 1, (h * tones.length) | 0)];
    return [...jitter(t, grain), 255];
  };
  // bark: vertical column tones + dark grooves + knots
  const barkP = (tones, groove, seed) => (x, y) => {
    if (x % 4 === 0) return [...jitter(groove, 6), 255];
    if (hash2(x, y, seed + 5) < 0.09) return [...jitter(groove, 8), 255];
    const h = hash2(x >> 1, 1, seed);
    const t = tones[Math.min(tones.length - 1, (h * tones.length) | 0)];
    return [...jitter(t, 7), 255];
  };
  const woolP = (base) => (x, y) => {
    if ((x % 4 === 3 && y % 2 === 0) || (y % 4 === 3 && x % 2 === 1))
      return [...jitter(base.map(c => c * 0.84), 6), 255];
    return [...jitter(base, 7), 255];
  };

  const painters = {
    [TILE.GRASS_TOP]: cluster([[124, 189, 89], [110, 175, 75], [99, 162, 66], [136, 201, 102]], 11),
    [TILE.GRASS_SIDE]: (x, y) => {
      const edge = 3 + hash2(x, 0, 42) * 2.4;
      if (y < edge) return cluster([[124, 189, 89], [110, 175, 75], [99, 162, 66]], 11)(x, y);
      return painters[TILE.DIRT](x, y);
    },
    [TILE.DIRT]: (x, y) => {
      const h = hash2(x, y, 12);
      if (h < 0.05) return [...jitter([125, 125, 128], 6), 255]; // pebble
      if (h < 0.1) return [...jitter([88, 60, 40], 6), 255]; // dark clod
      return cluster([[134, 96, 67], [122, 86, 59], [145, 106, 75]], 13)(x, y);
    },
    [TILE.STONE]: cluster([[128, 128, 128], [117, 117, 117], [139, 139, 139], [107, 107, 107]], 17),
    [TILE.COBBLE]: (x, y) => {
      const lx = x & 3, ly = y & 3;
      if (lx === 0 || ly === 0) return [...jitter([72, 72, 74], 7), 255]; // seams
      const v = (hash2(x >> 2, y >> 2, 21) - 0.5) * 30; // per-stone tone
      const hi = (lx === 1 && ly === 1) ? 14 : 0; // top-left light catch
      const c = jitter([122, 122, 124], 5);
      return [c[0] + v + hi, c[1] + v + hi, c[2] + v + hi, 255];
    },
    [TILE.PLANK]: plankP([158, 128, 79], [106, 84, 51]),
    [TILE.LOG_SIDE]: barkP([[106, 84, 52], [96, 76, 46], [116, 92, 58]], [78, 60, 36], 67),
    [TILE.LOG_TOP]: (x, y) => {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 7) return [...jitter([104, 82, 50], 7), 255]; // bark rim
      const ring = Math.floor(d) % 2 === 0;
      return [...jitter(ring ? [177, 144, 92] : [120, 94, 58], 6), 255];
    },
    [TILE.LEAVES]: (x, y) => {
      const h = hash2(x, y, 83);
      if (h < 0.22) return [...jitter([28, 66, 20], 8), 255]; // deep holes
      if (h < 0.55) return [...jitter([52, 110, 36], 10), 255];
      return [...jitter([70, 136, 50], 10), 255];
    },
    [TILE.SAND]: cluster([[220, 207, 163], [211, 198, 151], [229, 217, 176]], 23),
    [TILE.GLASS]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [208, 228, 235, 255];
      if ((x === 2 && y <= 6) || (y === 2 && x <= 6)) return [235, 245, 250, 200]; // corner streak
      return [0, 0, 0, 0];
    },
    [TILE.WATER]: (x, y) => {
      const w = hash2(x >> 2, y, 89);
      const t = w < 0.3 ? [44, 84, 168] : w < 0.7 ? [52, 96, 182] : [62, 110, 196];
      return [...jitter(t, 6), 178];
    },
    [TILE.SNOW]: cluster([[238, 244, 248], [230, 238, 244], [244, 249, 252]], 101),
    [TILE.SNOW_SIDE]: (x, y) => {
      if (y < 4) return cluster([[238, 244, 248], [230, 238, 244]], 101)(x, y);
      return painters[TILE.DIRT](x, y);
    },
    [TILE.BEDROCK]: cluster([[38, 38, 40], [88, 88, 90], [60, 60, 63]], 43, 3, 10),
    [TILE.WOOL]: (x, y) => {
      if ((x % 4 === 3 && y % 2 === 0) || (y % 4 === 3 && x % 2 === 1)) return [...jitter([205, 205, 205], 6), 255];
      return [...jitter([233, 233, 233], 7), 255];
    },
    [TILE.CRAFTING_TOP]: (x, y) => {
      if (x === 0 || x === 15 || y === 0 || y === 15) return [...jitter([96, 74, 45], 6), 255];
      if (((x === 5 || x === 10) && y > 1 && y < 14) || ((y === 5 || y === 10) && x > 1 && x < 14))
        return [...jitter([118, 93, 56], 6), 255];
      return [...jitter([158, 128, 79], 8), 255];
    },
    [TILE.CRAFTING_SIDE]: (x, y) => {
      if (y < 3) return [...jitter([158, 128, 79], 8), 255];
      if (x > 2 && x < 13 && y > 4 && y < 12) return [...jitter([139, 105, 63], 7), 255];
      return [...jitter([121, 92, 53], 7), 255];
    },
    [TILE.STONE_BRICK]: brickP([138, 138, 141], [86, 86, 88]),
    [TILE.IRON_BLOCK]: bordered([219, 219, 222], [148, 148, 152]),
    [TILE.DIAMOND_BLOCK]: bordered([95, 216, 209], [52, 150, 145]),
    [TILE.ICE]: (x, y) => {
      const d = (x - y + 32) % 7;
      if (d === 0 && rand() < 0.6) return [...jitter([225, 240, 252], 5), 255];
      return [...jitter([155, 195, 232], 8), 255];
    },
    [TILE.FURNACE_TOP]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([70, 70, 72], 6), 255];
      return [...jitter([112, 112, 115], 8), 255];
    },
    [TILE.FURNACE_FRONT]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([70, 70, 72], 6), 255];
      if (x >= 4 && x <= 11 && y >= 8 && y <= 13) {
        if (rand() < 0.3 && y >= 10) return [...jitter([235, 120, 30], 20), 255];
        return [...jitter([28, 26, 24], 8), 255];
      }
      return [...jitter([112, 112, 115], 8), 255];
    },
    [TILE.LAVA]: (x, y) => {
      const h = hash2(x >> 1, y >> 1, 97);
      if (h < 0.25) return [...jitter([252, 196, 52], 14), 255];
      if (h < 0.45) return [...jitter([240, 140, 28], 14), 255];
      return [...jitter([216, 100, 18], 14), 255];
    },
    [TILE.OBSIDIAN]: (x, y) => {
      if (hash2(x >> 1, y >> 1, 47) < 0.16) return [...jitter([88, 44, 138], 12), 255];
      return [...jitter([22, 16, 32], 6), 255];
    },
    [TILE.PORTAL]: (x, y) => {
      if ((x * 2 + y * 3 + ((x + y) % 5)) % 9 < 2) return [...jitter([190, 100, 245], 20), 255];
      return [...jitter([98, 32, 165], 22), 255];
    },
    [TILE.NETHERRACK]: (x, y) => {
      if (hash2(x, y, 54) < 0.08) return [...jitter([60, 26, 26], 8), 255];
      return cluster([[111, 54, 52], [98, 47, 46], [124, 64, 60]], 53)(x, y);
    },
    [TILE.END_FRAME]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([144, 152, 116], 8), 255];
      if (x >= 4 && x <= 11 && y >= 4 && y <= 11) return [...jitter([28, 30, 26], 6), 255];
      return [...jitter([120, 128, 96], 9), 255];
    },
    [TILE.END_FRAME_FILLED]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([144, 152, 116], 8), 255];
      if (x >= 5 && x <= 10 && y >= 5 && y <= 10) return [...jitter([64, 220, 190], 18), 255]; // ender eye
      if (x >= 4 && x <= 11 && y >= 4 && y <= 11) return [...jitter([28, 30, 26], 6), 255];
      return [...jitter([120, 128, 96], 9), 255];
    },
    [TILE.END_PORTAL]: () => {
      const r = rand();
      if (r < 0.04) return [...jitter([120, 230, 200], 30), 255]; // star specks
      if (r < 0.07) return [...jitter([180, 120, 240], 30), 255];
      return [...jitter([8, 10, 16], 5), 255];
    },
    [TILE.END_STONE]: (x, y) => {
      if (hash2(x, y, 59) < 0.12) return [...jitter([198, 201, 156], 7), 255];
      return cluster([[221, 223, 181], [213, 215, 172]], 57)(x, y);
    },
    [TILE.DRAGON_EGG]: () => {
      if (rand() < 0.12) return [...jitter([110, 40, 160], 18), 255];
      return [...jitter([18, 12, 24], 7), 255];
    },
    [TILE.CHEST]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([92, 66, 34], 6), 255];
      if (y === 7 || y === 8) {
        if (x >= 6 && x <= 9) return [...jitter([70, 70, 74], 8), 255]; // latch
        return [...jitter([96, 70, 38], 6), 255];
      }
      return [...jitter([148, 110, 62], 8), 255];
    },
    [TILE.BED_TOP]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([110, 30, 30], 8), 255];
      if (y <= 4) return [...jitter([235, 235, 235], 8), 255]; // pillow
      return [...jitter([178, 44, 44], 10), 255]; // blanket
    },
    [TILE.BED_SIDE]: (x, y) => {
      if (y < 8) return [...jitter([178, 44, 44], 10), 255];
      return [...jitter([158, 128, 79], 8), 255];
    },
    // --- building blocks ----------------------------------------------------
    [TILE.BRICKS]: brickP([168, 92, 74], [188, 180, 172]),
    [TILE.SANDSTONE_TOP]: solid([220, 207, 160], 7),
    [TILE.SANDSTONE_SIDE]: (x, y) => {
      if (y < 2 || y > 13) return [...jitter([226, 213, 166], 6), 255];
      if (y >= 6 && y <= 9) {
        const g = (x >= 3 && x <= 5) || (x >= 10 && x <= 12) || y === 7 || y === 8;
        return [...jitter(g ? [188, 170, 118] : [214, 200, 152], 7), 255];
      }
      if (hash2(x >> 1, y >> 1, 61) < 0.14) return [...jitter([186, 170, 120], 8), 255];
      return [...jitter([214, 200, 152], 8), 255];
    },
    [TILE.SMOOTH_STONE]: solid([162, 162, 164], 5),
    [TILE.MOSSY_COBBLE]: (x, y) => {
      const m = hash2(x >> 1, y >> 1, 515) < 0.45;
      const lx = x & 3, ly = y & 3;
      if (lx === 0 || ly === 0) return [...jitter(m ? [62, 90, 42] : [72, 72, 74], 7), 255];
      const v = (hash2(x >> 2, y >> 2, 21) - 0.5) * 30;
      const c = jitter(m ? [99, 133, 62] : [122, 122, 124], 6);
      return [c[0] + v, c[1] + v, c[2] + v, 255];
    },
    [TILE.GRAVEL]: (x, y) => {
      const tones = [[134, 126, 120], [105, 94, 88], [150, 141, 133], [88, 80, 76], [120, 105, 95]];
      const t = tones[(hash2(x, y, 29) * tones.length) | 0];
      return [...jitter(t, 7), 255];
    },
    [TILE.CLAY]: cluster([[160, 166, 182], [150, 156, 172], [170, 176, 192]], 37),
    [TILE.BOOKSHELF]: (x, y) => {
      if (y < 2 || y > 13 || y === 7 || y === 8 || x === 0 || x === 15)
        return [...jitter([158, 128, 79], 8), 255];
      const shelf = y < 7 ? 0 : 1;
      if (hash2(x, shelf, 41) < 0.1) return [40, 34, 28, 255]; // empty slot
      const spines = [[168, 50, 42], [62, 102, 160], [92, 128, 58], [150, 110, 54], [120, 70, 140], [196, 170, 90]];
      const c = spines[(hash2(x, shelf, 77) * spines.length) | 0];
      const shade = x % 3 === 0 ? 0.72 : 1;
      return [...jitter([c[0] * shade, c[1] * shade, c[2] * shade], 8), 255];
    },
    [TILE.GLOWSTONE]: (x, y) => {
      const g = hash2(x >> 1, y >> 1, 911);
      if (g < 0.22) return [...jitter([252, 232, 150], 8), 255];
      if (g < 0.52) return [...jitter([232, 192, 104], 10), 255];
      return [...jitter([146, 102, 58], 10), 255];
    },
    [TILE.QUARTZ]: bordered([240, 236, 228], [214, 206, 196]),
    [TILE.NETHER_BRICK]: brickP([48, 24, 30], [26, 12, 16]),
    [TILE.GOLD_BLOCK]: bordered([250, 218, 92], [198, 162, 50]),
    [TILE.REDSTONE_BLOCK]: bordered([190, 40, 30], [128, 22, 16]),
    [TILE.LAPIS_BLOCK]: bordered([48, 82, 184], [30, 52, 130]),
    [TILE.EMERALD_BLOCK]: bordered([74, 216, 120], [42, 158, 82]),
    [TILE.BIRCH_LOG]: barkP([[224, 224, 216], [212, 212, 202], [232, 232, 224]], [52, 50, 44], 71),
    [TILE.BIRCH_PLANK]: plankP([198, 180, 134], [156, 138, 96]),
    [TILE.SPRUCE_LOG]: barkP([[72, 54, 32], [64, 47, 28], [80, 60, 36]], [44, 32, 19], 73),
    [TILE.SPRUCE_PLANK]: plankP([116, 86, 50], [82, 60, 34]),
    [TILE.PUMPKIN_TOP]: (x, y) => {
      if (Math.abs(x - 7.5) < 1.6 && Math.abs(y - 7.5) < 1.6) return [...jitter([94, 112, 44], 8), 255];
      if ((x + y) % 5 === 0) return [...jitter([194, 106, 24], 8), 255];
      return [...jitter([224, 130, 36], 9), 255];
    },
    [TILE.PUMPKIN_SIDE]: (x) => {
      if (x % 5 === 4) return [...jitter([190, 100, 22], 8), 255];
      return [...jitter([226, 132, 38], 10), 255];
    },
    [TILE.MELON_SIDE]: (x) =>
      (x % 4 < 2 ? [...jitter([104, 156, 48], 8), 255] : [...jitter([62, 116, 34], 8), 255]),
    [TILE.MELON_TOP]: (x, y) =>
      (((x + y) % 4) < 2 ? [...jitter([104, 156, 48], 8), 255] : [...jitter([62, 116, 34], 8), 255]),
    [TILE.HAY_SIDE]: (x, y) => {
      if (y % 4 === 3) return [...jitter([146, 110, 40], 8), 255];
      if (hash2(x, y, 3) < 0.15) return [...jitter([214, 182, 70], 8), 255];
      return [...jitter([190, 156, 54], 9), 255];
    },
    [TILE.HAY_TOP]: (x, y) => {
      if (x % 5 === 0 || y % 5 === 0) return [...jitter([140, 106, 38], 8), 255];
      return ((((x / 5) | 0) + ((y / 5) | 0)) % 2
        ? [...jitter([198, 166, 62], 8), 255] : [...jitter([172, 138, 48], 8), 255]);
    },
    [TILE.TNT_SIDE]: (x, y) => {
      if (y >= 5 && y <= 10) {
        if (y >= 6 && y <= 9 && TNT_TXT[y - 6][x] === 't') return [42, 38, 34, 255];
        return [...jitter([232, 226, 214], 5), 255];
      }
      return [...jitter([200, 54, 38], 12), 255];
    },
    [TILE.TNT_TOP]: (x, y) => {
      if (x >= 3 && x <= 12 && y >= 3 && y <= 12) {
        if (x >= 7 && x <= 8 && y >= 7 && y <= 8) return [...jitter([60, 50, 40], 6), 255];
        return [...jitter([216, 192, 150], 8), 255];
      }
      return [...jitter([200, 54, 38], 12), 255];
    },
    [TILE.CACTUS_SIDE]: (x, y) => {
      if (x === 0 || x === 15) return [...jitter([40, 96, 24], 6), 255];
      if (x % 4 === 2 && (y + x) % 5 === 0) return [230, 232, 200, 255]; // spines
      if (x % 4 === 0) return [...jitter([48, 110, 28], 6), 255];
      return [...jitter([66, 140, 42], 8), 255];
    },
    [TILE.CACTUS_TOP]: (x, y) => {
      if (x < 2 || x > 13 || y < 2 || y > 13) return [...jitter([48, 110, 28], 6), 255];
      return [...jitter([80, 152, 52], 8), 255];
    },
    [TILE.MUSHROOM_RED]: (x, y) => {
      if (x >= 7 && x <= 8 && y >= 9) return [...jitter([232, 224, 208], 8), 255];
      const fx = x - 7.5, fy = (y - 6.5) * 1.4;
      if (fx * fx + fy * fy <= 14 && y <= 10) {
        if ((x === 5 && y === 5) || (x === 10 && y === 5) || (x === 7 && y === 4)) return [245, 240, 230, 255];
        return [...jitter([200, 40, 32], 12), 255];
      }
      return [0, 0, 0, 0];
    },
    [TILE.MUSHROOM_BROWN]: (x, y) => {
      if (x >= 7 && x <= 8 && y >= 9) return [...jitter([228, 220, 204], 8), 255];
      const fx = x - 7.5, fy = (y - 6.5) * 1.4;
      if (fx * fx + fy * fy <= 14 && y <= 10) return [...jitter([148, 116, 76], 12), 255];
      return [0, 0, 0, 0];
    },
    [TILE.CANE_SIDE]: (x, y) => {
      const stalk = x % 4;
      if (stalk === 3) return [0, 0, 0, 0];
      if (y % 5 === 4) return [...jitter([86, 140, 60], 10), 255];
      return [...jitter(stalk === 0 ? [110, 180, 80] : [96, 165, 70], 10), 255];
    },
    [TILE.CANE_TOP]: (x, y) => {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 6) return [0, 0, 0, 0];
      return [...jitter(d < 2.5 ? [140, 200, 100] : [100, 170, 75], 10), 255];
    },
    [TILE.LANTERN]: (x, y) => {
      if (y < 2 || y > 13 || x < 3 || x > 12) return [...jitter([40, 40, 46], 6), 255];
      if (x >= 6 && x <= 9 && y >= 5 && y <= 10) return [255, 225, 140, 255];
      return [...jitter([240, 180, 90], 12), 255];
    },
    [TILE.SLIME]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([90, 170, 90], 8), 255];
      const blob = (x - 5) * (x - 5) + (y - 6) * (y - 6) < 7 || (x - 11) * (x - 11) + (y - 10) * (y - 10) < 5;
      return [...jitter(blob ? [150, 230, 150] : [110, 200, 110], 10), 255];
    },
    [TILE.DUST_OFF]: (x, y) => {
      const arm = (x >= 6 && x <= 9) || (y >= 6 && y <= 9);
      if (!arm || hash2(x, y, 7) < 0.12) return [0, 0, 0, 0];
      return [...jitter([140, 30, 22], 10), 255];
    },
    [TILE.DUST_ON]: (x, y) => {
      const arm = (x >= 6 && x <= 9) || (y >= 6 && y <= 9);
      if (!arm || hash2(x, y, 7) < 0.12) return [0, 0, 0, 0];
      const hot = x >= 7 && x <= 8 && y >= 7 && y <= 8;
      return [...jitter(hot ? [255, 120, 90] : [235, 50, 35], 12), 255];
    },
    [TILE.RTORCH_ON]: (x, y) => {
      if (x >= 7 && x <= 8 && y >= 6) return [...jitter([120, 90, 60], 6), 255];
      if (x >= 6 && x <= 9 && y >= 2 && y <= 5) {
        if (x >= 7 && x <= 8 && y >= 3 && y <= 4) return [255, 120, 100, 255];
        return [...jitter([220, 50, 40], 14), 255];
      }
      return [0, 0, 0, 0];
    },
    [TILE.RTORCH_OFF]: (x, y) => {
      if (x >= 7 && x <= 8 && y >= 6) return [...jitter([110, 85, 58], 6), 255];
      if (x >= 6 && x <= 9 && y >= 2 && y <= 5) {
        if (x >= 7 && x <= 8 && y >= 3 && y <= 4) return [150, 90, 85, 255];
        return [...jitter([110, 60, 55], 10), 255];
      }
      return [0, 0, 0, 0];
    },
    [TILE.LEVER_OFF]: (x, y) => {
      if (y >= 12 && x >= 5 && x <= 10) return [...jitter([110, 110, 115], 6), 255];
      if (x === 7 && y >= 6 && y < 12) return [...jitter([90, 90, 95], 6), 255];
      if (x >= 5 && x <= 6 && y >= 4 && y <= 5) return [...jitter([200, 50, 40], 8), 255];
      return [0, 0, 0, 0];
    },
    [TILE.LEVER_ON]: (x, y) => {
      if (y >= 12 && x >= 5 && x <= 10) return [...jitter([110, 110, 115], 6), 255];
      if (x === 8 && y >= 6 && y < 12) return [...jitter([90, 90, 95], 6), 255];
      if (x >= 8 && x <= 9 && y >= 4 && y <= 5) return [255, 90, 70, 255];
      return [0, 0, 0, 0];
    },
    [TILE.BUTTON]: (x, y) => {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 4) return [0, 0, 0, 0];
      return [...jitter(d > 3 ? [90, 90, 92] : [140, 140, 144], 8), 255];
    },
    [TILE.PLATE]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([80, 80, 82], 6), 255];
      return [...jitter([128, 128, 132], 8), 255];
    },
    [TILE.LAMP_OFF]: (x, y) => {
      if (x % 4 === 0 || y % 4 === 0) return [...jitter([150, 140, 110], 8), 255];
      return [...jitter([200, 190, 160], 10), 255];
    },
    [TILE.LAMP_ON]: (x, y) => {
      if (x % 4 === 0 || y % 4 === 0) return [...jitter([220, 170, 90], 8), 255];
      return [255, 225, 150, 255];
    },
    [TILE.SENSOR_TOP]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([110, 90, 60], 6), 255];
      if (x % 4 === 0 || y % 4 === 0) return [...jitter([60, 90, 140], 8), 255];
      return [...jitter([90, 140, 200], 10), 255];
    },
    [TILE.SENSOR_SIDE]: (x, y) => {
      if (y >= 6 && y <= 9) return [...jitter([70, 110, 170], 8), 255];
      return [...jitter([158, 128, 79], 8), 255];
    },
    [TILE.SHULKER_SIDE]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([110, 60, 140], 6), 255];
      const seam = x % 8 === 0 || y % 8 === 0;
      return [...jitter(seam ? [130, 75, 160] : [155, 100, 185], 8), 255];
    },
    [TILE.SHULKER_TOP]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([110, 60, 140], 6), 255];
      const cross = (x >= 6 && x <= 9) || (y >= 6 && y <= 9);
      return [...jitter(cross ? [175, 120, 205] : [150, 95, 180], 8), 255];
    },
    [TILE.REP_TOP]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([100, 100, 102], 6), 255];
      if (x >= 7 && x <= 8 || y >= 7 && y <= 8) return [...jitter([160, 40, 35], 10), 255];
      return [...jitter([115, 115, 118], 8), 255];
    },
    [TILE.REP_TOP_ON]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([110, 110, 112], 6), 255];
      if (x >= 7 && x <= 8 || y >= 7 && y <= 8) return [...jitter([255, 80, 60], 12), 255];
      return [...jitter([125, 125, 128], 8), 255];
    },
    [TILE.REP_SIDE]: (x, y) => {
      if (y < 3) return [...jitter([170, 50, 42], 8), 255];
      return [...jitter([110, 110, 112], 8), 255];
    },
    [TILE.COMP_TOP]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([95, 95, 98], 6), 255];
      if (x >= 6 && x <= 9 && y >= 6 && y <= 9) return [...jitter([200, 180, 80], 8), 255];
      if (x >= 7 && x <= 8 || y >= 7 && y <= 8) return [...jitter([160, 40, 35], 10), 255];
      return [...jitter([110, 110, 113], 8), 255];
    },
    [TILE.COMP_TOP_ON]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([105, 105, 108], 6), 255];
      if (x >= 6 && x <= 9 && y >= 6 && y <= 9) return [255, 230, 140, 255];
      if (x >= 7 && x <= 8 || y >= 7 && y <= 8) return [...jitter([255, 80, 60], 12), 255];
      return [...jitter([120, 120, 123], 8), 255];
    },
    [TILE.COMP_SIDE]: (x, y) => {
      if (y < 3) return [...jitter([190, 170, 90], 8), 255];
      return [...jitter([105, 105, 108], 8), 255];
    },
    [TILE.OBSERVER_SIDE]: (x, y) => {
      if (y >= 6 && y <= 9) return [...jitter([160, 40, 35], 10), 255];
      return [...jitter([90, 90, 95], 8), 255];
    },
    [TILE.OBSERVER_FACE]: (x, y) => {
      if (y >= 5 && y <= 6 && ((x >= 4 && x <= 6) || (x >= 9 && x <= 11))) return [220, 50, 40, 255];
      if (y >= 10 && y <= 11 && x >= 6 && x <= 9) return [140, 35, 30, 255];
      return [...jitter([30, 28, 32], 5), 255];
    },
    [TILE.OBSERVER_BACK]: (x, y) => {
      if (x >= 6 && x <= 9 && y >= 6 && y <= 9) return [200, 50, 40, 255];
      return [...jitter([110, 110, 115], 8), 255];
    },
    [TILE.PISTON_SIDE]: (x, y) => {
      if (y < 4) return [...jitter([130, 128, 125], 6), 255];
      if (y % 4 === 3) return [...jitter([110, 85, 50], 6), 255];
      return [...jitter([160, 125, 70], 8), 255];
    },
    [TILE.HEAD_SIDE]: () => [...jitter([150, 115, 65], 8), 255],
    [TILE.HEAD_FACE]: (x, y) => {
      if (x < 2 || y < 2 || x > 13 || y > 13) return [...jitter([120, 90, 55], 6), 255];
      if (x >= 6 && x <= 9 && y >= 6 && y <= 9) return [...jitter([100, 75, 45], 6), 255];
      return [...jitter([175, 140, 85], 8), 255];
    },
    [TILE.DISP_SIDE]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([85, 85, 88], 6), 255];
      return [...jitter([120, 120, 122], 8), 255];
    },
    [TILE.DISP_HOLE]: (x, y) => {
      if (x < 2 || y < 2 || x > 13 || y > 13) return [60, 60, 62, 255];
      return [12, 12, 14, 255];
    },
    [TILE.DROP_SIDE]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([75, 75, 78], 6), 255];
      return [...jitter([110, 110, 112], 8), 255];
    },
    [TILE.DROP_HOLE]: (x, y) => {
      if (x < 2 || y < 2 || x > 13 || y > 13) return [70, 70, 72, 255];
      return [25, 25, 28, 255];
    },
    [TILE.HOPPER_TOP]: (x, y) => {
      if (x < 2 || y < 2 || x > 13 || y > 13) return [...jitter([110, 108, 105], 6), 255];
      return [...jitter([30, 30, 32], 5), 255];
    },
    [TILE.HOPPER_SIDE]: (x, y) => {
      if (y >= 7 && y <= 8) return [...jitter([80, 78, 75], 6), 255];
      return [...jitter([105, 103, 100], 8), 255];
    },
    [TILE.BULB_OFF]: (x, y) => {
      if (x >= 4 && x <= 11 && y >= 4 && y <= 11) return [...jitter([50, 45, 40], 6), 255];
      if (hash2(x, y, 31) < 0.15) return [...jitter([90, 140, 130], 8), 255];
      return [...jitter([170, 105, 65], 8), 255];
    },
    [TILE.BULB_ON]: (x, y) => {
      if (x >= 4 && x <= 11 && y >= 4 && y <= 11) return [255, 220, 150, 255];
      if (hash2(x, y, 31) < 0.15) return [...jitter([90, 140, 130], 8), 255];
      return [...jitter([170, 105, 65], 8), 255];
    },
    [TILE.TARGET_TOP]: (x, y) => {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) | 0;
      if (d <= 1) return [200, 40, 35, 255];
      if (d <= 3) return [235, 230, 220, 255];
      if (d <= 5) return [200, 40, 35, 255];
      return [235, 230, 220, 255];
    },
    [TILE.TARGET_SIDE]: (x, y) => {
      if (y >= 6 && y <= 9) {
        if (x >= 6 && x <= 9) return [200, 40, 35, 255];
        return [235, 230, 220, 255];
      }
      return [...jitter([190, 170, 120], 8), 255];
    },
    [TILE.TORCH]: (x, y) => {
      if (x >= 7 && x <= 8 && y >= 6) return [...jitter(y > 13 ? [116, 88, 46] : [150, 112, 60], 6), 255];
      if (x >= 6 && x <= 9 && y >= 2 && y <= 5) {
        if (x >= 7 && x <= 8 && y >= 3 && y <= 4) return [255, 240, 150, 255];
        return [...jitter([244, 170, 46], 14), 255];
      }
      return [0, 0, 0, 0];
    },
    [TILE.POPPY]: (x, y) => {
      const fx = x - 7.5, fy = y - 4.5;
      if (fx * fx + fy * fy <= 7 && y <= 8) {
        if (x >= 7 && x <= 8 && y >= 4 && y <= 5) return [64, 16, 12, 255];
        return [...jitter([200, 34, 30], 12), 255];
      }
      if (x === 7 && y >= 8) return [...jitter([62, 118, 34], 8), 255];
      if ((x === 5 || x === 6) && y === 11) return [...jitter([70, 130, 40], 8), 255];
      if ((x === 9 || x === 10) && y === 13) return [...jitter([70, 130, 40], 8), 255];
      return [0, 0, 0, 0];
    },
    [TILE.DANDELION]: (x, y) => {
      const fx = x - 7.5, fy = y - 5;
      if (fx * fx + fy * fy <= 5) {
        if (fx * fx + fy * fy <= 1.2) return [252, 232, 130, 255];
        return [...jitter([240, 204, 40], 10), 255];
      }
      if (x === 8 && y >= 7) return [...jitter([62, 118, 34], 8), 255];
      if ((x === 5 || x === 6) && y === 12) return [...jitter([70, 130, 40], 8), 255];
      return [0, 0, 0, 0];
    },
    [TILE.ICON_FENCE]: (x, y) => {
      const post = (x >= 2 && x <= 4) || (x >= 11 && x <= 13);
      const rail = (y >= 4 && y <= 5) || (y >= 9 && y <= 10);
      if (post && y >= 1) return [...jitter([158, 128, 79], 8), 255];
      if (rail) return [...jitter([139, 108, 62], 8), 255];
      return [0, 0, 0, 0];
    },
    [TILE.LADDER]: (x, y) => {
      if ((x >= 2 && x <= 3) || (x >= 12 && x <= 13)) return [...jitter([140, 108, 62], 7), 255];
      if (y % 4 === 2 && x >= 2 && x <= 13) return [...jitter([160, 126, 74], 7), 255];
      return [0, 0, 0, 0];
    },
    [TILE.DOOR_BOTTOM]: (x, y) => {
      if (x === 0 || x === 15 || y === 15) return [...jitter([96, 74, 45], 5), 255];
      if (x >= 12 && x <= 13 && y >= 2 && y <= 3) return [192, 192, 198, 255]; // handle
      if (x === 7 || x === 8 || y === 7 || y === 8) return [...jitter([114, 88, 52], 6), 255];
      return [...jitter([150, 116, 68], 8), 255];
    },
    [TILE.DOOR_TOP]: (x, y) => {
      if (x === 0 || x === 15 || y === 0) return [...jitter([96, 74, 45], 5), 255];
      if (y >= 2 && y <= 5 && ((x >= 2 && x <= 5) || (x >= 10 && x <= 13)))
        return [202, 228, 236, 255]; // window panes
      if (x === 7 || x === 8 || y === 7 || y === 8) return [...jitter([114, 88, 52], 6), 255];
      return [...jitter([150, 116, 68], 8), 255];
    },
    [TILE.ICON_DOOR]: (x, y) => {
      if (x < 3 || x > 12) return [0, 0, 0, 0];
      if (x === 3 || x === 12 || y === 0 || y === 15 || y === 7) return [...jitter([104, 80, 48], 5), 255];
      if (y >= 2 && y <= 5 && x >= 5 && x <= 10) return [202, 228, 236, 255];
      if (x >= 10 && x <= 11 && y >= 9 && y <= 10) return [192, 192, 198, 255]; // knob
      return [...jitter([150, 116, 68], 7), 255];
    },
    // --- new block textures --------------------------------------------------
    [TILE.COAL_BLOCK]: (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([20, 20, 24], 4), 255];
      if (rand() < 0.06) return [...jitter([110, 110, 120], 10), 255]; // glossy specks
      return [...jitter([42, 42, 48], 7), 255];
    },
    [TILE.JACK_SIDE]: (x, y) => {
      const eye = (cx) => Math.abs(x - cx) + Math.abs(y - 5) <= 2 && y <= 6;
      const mouth = y >= 10 && y <= 12 && x >= 3 && x <= 12 && ((x + y) % 2 === 0 || y === 11);
      if (eye(4) || eye(11) || mouth) return [...jitter([255, 196, 70], 12), 255]; // glowing carve
      return painters[TILE.PUMPKIN_SIDE](x, y);
    },
    [TILE.MOSSY_STONE_BRICK]: (x, y) => {
      if (hash2(x >> 1, y >> 1, 777) < 0.38) return [...jitter([96, 132, 60], 10), 255];
      return brickP([138, 138, 141], [86, 86, 88])(x, y);
    },
    [TILE.BLUE_ORCHID]: (x, y) => {
      const fx = x - 7.5, fy = y - 4;
      if (fx * fx + fy * fy <= 6 && y <= 8) {
        if (Math.abs(fx) < 1 && Math.abs(fy) < 1) return [220, 235, 255, 255];
        return [...jitter([70, 130, 225], 12), 255];
      }
      if (x === 7 && y >= 8) return [...jitter([62, 118, 34], 8), 255];
      if ((x === 5 || x === 6) && y === 12) return [...jitter([70, 130, 40], 8), 255];
      return [0, 0, 0, 0];
    },
    [TILE.ALLIUM]: (x, y) => {
      const fx = x - 7.5, fy = y - 3.5;
      const d2 = fx * fx + fy * fy;
      if (d2 <= 6.5 && d2 >= 1 && hash2(x, y, 5) < 0.8) return [...jitter([178, 96, 200], 14), 255];
      if (d2 < 1) return [120, 60, 140, 255];
      if (x === 8 && y >= 6) return [...jitter([62, 118, 34], 8), 255];
      if ((x === 10 || x === 11) && y === 12) return [...jitter([70, 130, 40], 8), 255];
      return [0, 0, 0, 0];
    },
    [TILE.COBWEB]: (x, y) => {
      const dx = Math.abs(x - 7.5), dy = Math.abs(y - 7.5);
      const spoke = x === y || x + y === 15 || x === 7 || x === 8 || y === 7 || y === 8;
      const ring = Math.round(dx + dy) % 4 === 0;
      if (spoke || ring) return [...jitter([222, 224, 228], 8), 235];
      return [0, 0, 0, 0];
    },
    [TILE.ENCHANT_TOP]: (x, y) => {
      if (x < 2 || y < 2 || x > 13 || y > 13) return [...jitter([24, 18, 34], 7), 255]; // obsidian rim
      if (x >= 5 && x <= 10 && y >= 4 && y <= 11) {
        if (x === 7 || x === 8) return [...jitter([240, 235, 220], 6), 255]; // pages seam
        return [...jitter([160, 40, 44], 10), 255]; // book cover
      }
      return [...jitter([30, 22, 40], 7), 255];
    },
    [TILE.ENCHANT_SIDE]: (x, y) => {
      if (y < 3) return [...jitter([80, 220, 210], 10), 255]; // glowing rune strip
      return [...jitter([24, 18, 34], 7), 255];
    },
    [TILE.JUKEBOX_TOP]: (x, y) => {
      const dx = x - 7.5, dy = y - 7.5;
      if (dx * dx + dy * dy <= 9) return [...jitter([40, 34, 30], 6), 255];
      return painters[TILE.PLANK](x, y);
    },
    [TILE.JUKEBOX_SIDE]: (x, y) => {
      if (x >= 4 && x <= 11 && y >= 6 && y <= 11) {
        if (x >= 6 && x <= 9 && y >= 7 && y <= 9) return [...jitter([30, 26, 24], 5), 255];
        return [...jitter([90, 70, 44], 6), 255];
      }
      return painters[TILE.PLANK](x, y);
    },
    [TILE.NOTE_BLOCK]: (x, y) => {
      if (x >= 4 && x <= 11 && y >= 4 && y <= 11) return [...jitter([232, 228, 220], 5), 255];
      return painters[TILE.PLANK](x, y);
    },
  };
  WOOL_COLORS.forEach(([, rgb], i) => { painters[TILE.WOOL0 + i] = woolP(rgb); });

  const oreP = (tile) => (x, y) => {
    const { color, spots, base = TILE.STONE } = ORE_SPOTS[tile];
    for (const [sx, sy] of spots) {
      const dx = x - sx, dy = y - sy, d2 = dx * dx + dy * dy;
      if (d2 <= 2) {
        const k = dx + dy < 0 ? 1.18 : d2 > 1 ? 0.72 : 1; // lit top-left, shaded rim
        return [...jitter([color[0] * k, color[1] * k, color[2] * k], 7), 255];
      }
    }
    return painters[base](x, y);
  };
  for (const t of Object.keys(ORE_SPOTS)) painters[t] = oreP(+t);

  // half-block / step silhouettes of the material painters (palette icons)
  const half = (p) => (x, y) => (y >= 8 ? p(x, y) : [0, 0, 0, 0]);
  const step = (p) => (x, y) => ((y >= 8 || x >= 8) ? p(x, y) : [0, 0, 0, 0]);
  painters[TILE.ICON_SLAB_OAK] = half(painters[TILE.PLANK]);
  painters[TILE.ICON_SLAB_COBBLE] = half(painters[TILE.COBBLE]);
  painters[TILE.ICON_SLAB_STONE] = half(painters[TILE.SMOOTH_STONE]);
  painters[TILE.ICON_SLAB_STONE_BRICK] = half(painters[TILE.STONE_BRICK]);
  painters[TILE.ICON_SLAB_BRICK] = half(painters[TILE.BRICKS]);
  painters[TILE.ICON_SLAB_SANDSTONE] = half(painters[TILE.SANDSTONE_SIDE]);
  painters[TILE.ICON_STAIR_OAK] = step(painters[TILE.PLANK]);
  painters[TILE.ICON_STAIR_COBBLE] = step(painters[TILE.COBBLE]);
  painters[TILE.ICON_STAIR_STONE_BRICK] = step(painters[TILE.STONE_BRICK]);
  painters[TILE.ICON_STAIR_BRICK] = step(painters[TILE.BRICKS]);
  painters[TILE.ICON_STAIR_SPRUCE] = step(painters[TILE.SPRUCE_PLANK]);
  painters[TILE.ICON_STAIR_SANDSTONE] = step(painters[TILE.SANDSTONE_SIDE]);
  painters[TILE.ICON_SLAB_SPRUCE] = half(painters[TILE.SPRUCE_PLANK]);
  painters[TILE.ICON_SLAB_BIRCH] = half(painters[TILE.BIRCH_PLANK]);
  painters[TILE.ICON_STAIR_STONE] = step(painters[TILE.SMOOTH_STONE]);
  painters[TILE.DARK_LOG_SIDE] = barkP([[68, 52, 34], [60, 45, 29], [76, 58, 38]], [44, 32, 20], 79);
  painters[TILE.DARK_LOG_TOP] = (x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 7) return [...jitter([66, 50, 32], 7), 255]; // bark rim
    return [...jitter(Math.floor(d) % 2 === 0 ? [104, 82, 54] : [70, 53, 35], 6), 255];
  };
  painters[TILE.DARK_PLANK] = plankP([76, 57, 34], [50, 37, 22]);
  painters[TILE.IRON_BARS] = (x, y) => {
    const bar = (x >= 3 && x <= 5) || (x >= 10 && x <= 12) || (y >= 7 && y <= 8);
    if (!bar) return [0, 0, 0, 0];
    const edge = x === 3 || x === 5 || x === 10 || x === 12;
    return [...jitter(edge ? [120, 122, 128] : [185, 188, 195], 7), 255];
  };
  painters[TILE.MAGMA] = (x, y) => {
    const h = hash2(x * 3 + 1, y * 3 + 5, 77);
    if (h < 0.14) return [...jitter([255, 140, 30], 25), 255];
    if (h < 0.2) return [...jitter([150, 60, 20], 15), 255];
    return [...jitter([48, 32, 32], 10), 255];
  };
  painters[TILE.PACKED_ICE] = (x, y) => {
    if ((x + y * 3) % 11 === 0) return [...jitter([235, 248, 252], 4), 255];
    return [...jitter([175, 215, 238], 7), 255];
  };
  painters[TILE.SEA_LANTERN] = (x, y) => {
    const dot = x % 4 < 2 && y % 4 < 2;
    if (dot) return [...jitter([240, 252, 246], 6), 255];
    if ((x + y) % 5 === 0) return [...jitter([140, 190, 180], 8), 255];
    return [...jitter([205, 232, 224], 8), 255];
  };
  painters[TILE.CHISELED_BRICKS] = (x, y) => {
    const b = x < 2 || y < 2 || x > 13 || y > 13;
    const dx = Math.abs(x - 7.5), dy = Math.abs(y - 7.5);
    if (b || dx > 5 || dy > 5) return [...jitter([110, 110, 112], 8), 255];
    if (dx < 1.5 && dy < 1.5) return [...jitter([70, 70, 72], 6), 255];
    return [...jitter([135, 135, 137], 7), 255];
  };
  painters[TILE.TINTED_GLASS] = (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return [...jitter([52, 50, 58], 5), 255];
    return [...jitter([24, 22, 30], 4), 255];
  };
  painters[TILE.CRYING_OBSIDIAN] = (x, y) => {
    const h = hash2(x * 2 + 3, y * 2 + 9, 913);
    if (h < 0.12) return [...jitter([200, 70, 230], 25), 255];
    return [...jitter([24, 14, 36], 8), 255];
  };
  painters[TILE.NETHERITE_BLOCK] = (x, y) => {
    const b = x < 2 || y < 2 || x > 13 || y > 13 || x === 7 || x === 8;
    if (b) return [...jitter([95, 92, 98], 7), 255];
    return [...jitter([58, 56, 62], 8), 255];
  };
  painters[TILE.BONE_TOP] = (x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 5.5 || d < 1.5) return [...jitter([200, 193, 175], 8), 255];
    return [...jitter([228, 222, 204], 6), 255];
  };
  painters[TILE.BONE_SIDE] = (x, y) => {
    if (x >= 6 && x <= 9) return [...jitter([198, 190, 170], 9), 255];
    return [...jitter([226, 220, 202], 7), 255];
  };
  painters[TILE.AMETHYST] = (x, y) => {
    const h = hash2(x * 4 + 2, y * 4 + 6, 151);
    if (h < 0.16) return [...jitter([205, 175, 255], 15), 255];
    if (h < 0.3) return [...jitter([150, 110, 200], 12), 255];
    return [...jitter([110, 78, 160], 10), 255];
  };

  for (const [tileStr, painter] of Object.entries(painters)) {
    const tile = +tileStr;
    const col = tile % COLS, row = (tile / COLS) | 0;
    const img = ctx.createImageData(T, T);
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const [r, g, b, a] = painter(x, y);
        const i = (y * T + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
      }
    }
    ctx.putImageData(img, col * T, row * T);
  }
  return canvas;
}

// UV rect of a tile (half-texel inset to prevent bleeding). v1 = top edge.
export function tileUV(tile) {
  const col = tile % COLS, row = (tile / COLS) | 0;
  const pu = 0.5 / (COLS * T), pv = 0.5 / (ROWS * T);
  return {
    u0: col / COLS + pu, u1: (col + 1) / COLS - pu,
    v0: 1 - (row + 1) / ROWS + pv, v1: 1 - row / ROWS - pv,
  };
}

// Average color of each block's side tile (for break particles / icons).
export function computeAvgColors(atlasCanvas) {
  const ctx = atlasCanvas.getContext('2d');
  const colors = {};
  for (let id = 1; id < BLOCKS.length; id++) {
    const blk = BLOCKS[id];
    if (!blk) continue;
    const tile = blk.side;
    const col = tile % COLS, row = (tile / COLS) | 0;
    const d = ctx.getImageData(col * T, row * T, T, T).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 40) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    n = n || 1;
    colors[id] = [r / n / 255, g / n / 255, b / n / 255];
  }
  return colors;
}
