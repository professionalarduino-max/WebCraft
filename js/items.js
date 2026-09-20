// Items, tools, mining rules (hardness / tool gating / drops), recipes,
// and procedural pixel-art item icons.

import { B, BLOCKS, WOOL_IDS, ATLAS_COLS } from './blocks.js';

// Non-block item ids start at 200 (block items reuse their block id; block ids
// stay below 200).
export const I = {
  STICK: 200, COAL: 201, IRON_INGOT: 202, DIAMOND: 203,
  APPLE: 204, PORKCHOP: 205, BEEF: 206, MUTTON: 207, FLESH: 208,
  WOOD_PICK: 210, STONE_PICK: 211, IRON_PICK: 212, DIAMOND_PICK: 213,
  WOOD_AXE: 214, STONE_AXE: 215, IRON_AXE: 216, DIAMOND_AXE: 217,
  WOOD_SHOVEL: 218, STONE_SHOVEL: 219, IRON_SHOVEL: 220, DIAMOND_SHOVEL: 221,
  WOOD_SWORD: 222, STONE_SWORD: 223, IRON_SWORD: 224, DIAMOND_SWORD: 225,
  RAW_IRON: 226, CHARCOAL: 227,
  COOKED_PORKCHOP: 228, STEAK: 229, COOKED_MUTTON: 230,
  BUCKET: 231, WATER_BUCKET: 232, LAVA_BUCKET: 233,
  IRON_HELMET: 234, IRON_CHEST: 235, IRON_LEGS: 236, IRON_BOOTS: 237,
  DIAMOND_HELMET: 238, DIAMOND_CHEST: 239, DIAMOND_LEGS: 240, DIAMOND_BOOTS: 241,
  FLINT_STEEL: 242, BLAZE_ROD: 243, ENDER_PEARL: 244,
  BLAZE_POWDER: 245, EYE_OF_ENDER: 246,
  STRING: 247, BOW: 248, ARROW: 249,
  GOLD_INGOT: 250, RAW_GOLD: 251, REDSTONE: 252, LAPIS: 253, EMERALD: 254, QUARTZ: 255,
  GUNPOWDER: 256,
  GOLD_PICK: 257, GOLD_AXE: 258, GOLD_SHOVEL: 259, GOLD_SWORD: 260,
  GOLD_HELMET: 261, GOLD_CHEST: 262, GOLD_LEGS: 263, GOLD_BOOTS: 264,
  STRUCT_HOUSE: 265, STRUCT_CASTLE: 266, STRUCT_WELL: 267, STRUCT_PORTAL: 268, STRUCT_VILLA: 269, STRUCT_CITY: 270,
  RAW_CHICKEN: 271, COOKED_CHICKEN: 272, EGG: 273, BOWL: 274, MUSHROOM_STEW: 275,
  GOLDEN_APPLE: 276, MELON_SLICE: 277, SUGAR: 278, PUMPKIN_PIE: 279, BONE: 280, SLIMEBALL: 281,
};

export const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet'];

export const TIER_NAMES = ['', 'wooden', 'stone', 'iron', 'diamond'];

// id -> {name, kind:'block'|'tool'|'food'|'material', toolType?, tier?, mult?, damage?, heal?}
export const ITEMS = {};

// every real block is also an inventory item (stair facing variants are
// hidden — their base id is the item)
for (let id = 1; id < BLOCKS.length; id++) {
  if (!BLOCKS[id] || BLOCKS[id].hidden || id === B.WATER || id === B.BEDROCK) continue;
  ITEMS[id] = { name: BLOCKS[id].name, kind: 'block' };
}
// water & bedrock are unobtainable in survival but placeable from the
// creative palette
ITEMS[B.WATER] = { name: BLOCKS[B.WATER].name, kind: 'block' };
ITEMS[B.BEDROCK] = { name: BLOCKS[B.BEDROCK].name, kind: 'block' };
ITEMS[B.SHULKER_BOX] = { name: 'Shulker Box', kind: 'block', stack: 1 }; // keeps contents, never merges

const mat = (name, kind, extra = {}) => ({ name, kind, ...extra });
ITEMS[I.STICK] = mat('Stick', 'material');
ITEMS[I.COAL] = mat('Coal', 'material');
ITEMS[I.IRON_INGOT] = mat('Iron Ingot', 'material');
ITEMS[I.DIAMOND] = mat('Diamond', 'material');
ITEMS[I.RAW_IRON] = mat('Raw Iron', 'material');
ITEMS[I.CHARCOAL] = mat('Charcoal', 'material');
ITEMS[I.GOLD_INGOT] = mat('Gold Ingot', 'material');
ITEMS[I.RAW_GOLD] = mat('Raw Gold', 'material');
ITEMS[I.REDSTONE] = mat('Redstone Dust', 'material');
ITEMS[I.LAPIS] = mat('Lapis Lazuli', 'material');
ITEMS[I.EMERALD] = mat('Emerald', 'material');
ITEMS[I.QUARTZ] = mat('Nether Quartz', 'material');
// food: hunger points restored + saturation
ITEMS[I.APPLE] = mat('Apple', 'food', { hunger: 4, sat: 2.4 });
ITEMS[I.PORKCHOP] = mat('Raw Porkchop', 'food', { hunger: 3, sat: 1.8 });
ITEMS[I.BEEF] = mat('Raw Beef', 'food', { hunger: 3, sat: 1.8 });
ITEMS[I.MUTTON] = mat('Raw Mutton', 'food', { hunger: 2, sat: 1.2 });
ITEMS[I.FLESH] = mat('Rotten Flesh', 'food', { hunger: 4, sat: 0.8 });
ITEMS[I.COOKED_PORKCHOP] = mat('Cooked Porkchop', 'food', { hunger: 8, sat: 12.8 });
ITEMS[I.STEAK] = mat('Steak', 'food', { hunger: 8, sat: 12.8 });
ITEMS[I.COOKED_MUTTON] = mat('Cooked Mutton', 'food', { hunger: 6, sat: 9.6 });
ITEMS[I.RAW_CHICKEN] = mat('Raw Chicken', 'food', { hunger: 2, sat: 1.2 });
ITEMS[I.COOKED_CHICKEN] = mat('Cooked Chicken', 'food', { hunger: 6, sat: 7.2 });
ITEMS[I.EGG] = mat('Egg', 'material', { stack: 16 });
ITEMS[I.BOWL] = mat('Bowl', 'material');
ITEMS[I.MUSHROOM_STEW] = mat('Mushroom Stew', 'food', { hunger: 6, sat: 7.2, stack: 1, returns: I.BOWL });
ITEMS[I.GOLDEN_APPLE] = mat('Golden Apple', 'food', { hunger: 4, sat: 9.6, heal: 8 });
ITEMS[I.MELON_SLICE] = mat('Melon Slice', 'food', { hunger: 2, sat: 1.2 });
ITEMS[I.SUGAR] = mat('Sugar', 'material');
ITEMS[I.PUMPKIN_PIE] = mat('Pumpkin Pie', 'food', { hunger: 8, sat: 4.8 });
ITEMS[I.BONE] = mat('Bone', 'material');
ITEMS[I.SLIMEBALL] = mat('Slimeball', 'material');
ITEMS[I.FLINT_STEEL] = mat('Flint and Steel', 'lighter', { stack: 1 });
ITEMS[I.BLAZE_ROD] = mat('Blaze Rod', 'material');
ITEMS[I.ENDER_PEARL] = mat('Ender Pearl', 'pearl', { stack: 16 }); // right-click to throw & teleport
ITEMS[I.BLAZE_POWDER] = mat('Blaze Powder', 'material');
ITEMS[I.EYE_OF_ENDER] = mat('Eye of Ender', 'eye'); // sockets into End portal frames
ITEMS[I.STRING] = mat('String', 'material'); // dropped by spiders
ITEMS[I.GUNPOWDER] = mat('Gunpowder', 'material'); // dropped by creepers
ITEMS[I.BOW] = mat('Bow', 'bow', { stack: 1 }); // right-click to shoot arrows
ITEMS[I.ARROW] = mat('Arrow', 'material');
ITEMS[I.BUCKET] = mat('Bucket', 'bucket', { liquid: null, stack: 1 });
ITEMS[I.WATER_BUCKET] = mat('Water Bucket', 'bucket', { liquid: 'water', stack: 1 });
ITEMS[I.LAVA_BUCKET] = mat('Lava Bucket', 'bucket', { liquid: 'lava', stack: 1 });
// armor: slot + defense points (reduction = points * 4%, capped 80%)
{
  const armorDefs = {
    iron: { label: 'Iron', def: [2, 6, 5, 2] },
    diamond: { label: 'Diamond', def: [3, 8, 6, 3] },
    gold: { label: 'Golden', def: [2, 5, 3, 1] },
  };
  const pieces = ['Helmet', 'Chestplate', 'Leggings', 'Boots'];
  const ids = {
    iron: [I.IRON_HELMET, I.IRON_CHEST, I.IRON_LEGS, I.IRON_BOOTS],
    diamond: [I.DIAMOND_HELMET, I.DIAMOND_CHEST, I.DIAMOND_LEGS, I.DIAMOND_BOOTS],
    gold: [I.GOLD_HELMET, I.GOLD_CHEST, I.GOLD_LEGS, I.GOLD_BOOTS],
  };
  for (const m of ['iron', 'diamond', 'gold']) {
    pieces.forEach((p, i) => {
      ITEMS[ids[m][i]] = mat(`${armorDefs[m].label} ${p}`, 'armor', {
        slot: ARMOR_SLOTS[i], defense: armorDefs[m].def[i], matKey: m, stack: 1,
      });
    });
  }
}

const MATS = {
  wood: { tier: 1, mult: 4, damage: 4, m: '#9e7145', d: '#77542f' },
  stone: { tier: 2, mult: 8, damage: 5, m: '#8f8f8f', d: '#6a6a6a' },
  iron: { tier: 3, mult: 12, damage: 6, m: '#dcdcdc', d: '#a8a8a8' },
  diamond: { tier: 4, mult: 16, damage: 7, m: '#4adfd9', d: '#2fb3ae' },
  gold: { tier: 1, mult: 20, damage: 4, m: '#f2cf5a', d: '#bd9430' }, // fastest, harvests like wood
};
const TOOL_IDS = {
  pickaxe: [I.WOOD_PICK, I.STONE_PICK, I.IRON_PICK, I.DIAMOND_PICK, I.GOLD_PICK],
  axe: [I.WOOD_AXE, I.STONE_AXE, I.IRON_AXE, I.DIAMOND_AXE, I.GOLD_AXE],
  shovel: [I.WOOD_SHOVEL, I.STONE_SHOVEL, I.IRON_SHOVEL, I.DIAMOND_SHOVEL, I.GOLD_SHOVEL],
  sword: [I.WOOD_SWORD, I.STONE_SWORD, I.IRON_SWORD, I.DIAMOND_SWORD, I.GOLD_SWORD],
};
{
  const matNames = ['wood', 'stone', 'iron', 'diamond', 'gold'];
  const label = { wood: 'Wooden', stone: 'Stone', iron: 'Iron', diamond: 'Diamond', gold: 'Golden' };
  const toolLabel = { pickaxe: 'Pickaxe', axe: 'Axe', shovel: 'Shovel', sword: 'Sword' };
  for (const [tool, ids] of Object.entries(TOOL_IDS)) {
    matNames.forEach((mn, i) => {
      const m = MATS[mn];
      ITEMS[ids[i]] = {
        name: `${label[mn]} ${toolLabel[tool]}`, kind: 'tool', toolType: tool,
        tier: m.tier, mult: m.mult, damage: tool === 'sword' ? m.damage : 3, matKey: mn,
        stack: 1,
      };
    });
  }
}

export const HAND_DAMAGE = 2;
export function itemDamage(id) {
  const it = ITEMS[id];
  return (it && it.kind === 'tool') ? it.damage : HAND_DAMAGE;
}

// Max stack size for an item (tools 1, everything else 64).
export function maxStack(id) {
  return (ITEMS[id] && ITEMS[id].stack) || 64;
}

// ---------------------------------------------------------------------------
// Smelting: input item -> output item. One smelt takes SMELT_TIME seconds.

export const SMELT_TIME = 10;

export const SMELTING = {
  [I.RAW_IRON]: I.IRON_INGOT,
  [I.RAW_GOLD]: I.GOLD_INGOT,
  [B.SAND]: B.GLASS,
  [B.COBBLE]: B.STONE,
  [B.STONE]: B.SMOOTH_STONE,
  [B.CLAY]: B.BRICKS,
  [B.NETHERRACK]: B.NETHER_BRICK,
  [B.CLAY]: B.TERRACOTTA,
  [B.SANDSTONE]: B.SMOOTH_SANDSTONE,
  [B.QUARTZ_BLOCK]: B.SMOOTH_QUARTZ,
  [B.STONE_BRICK]: B.CRACKED_STONE_BRICK,
  [B.LOG]: I.CHARCOAL,
  [B.BIRCH_LOG]: I.CHARCOAL,
  [B.SPRUCE_LOG]: I.CHARCOAL,
  [I.PORKCHOP]: I.COOKED_PORKCHOP,
  [I.BEEF]: I.STEAK,
  [I.MUTTON]: I.COOKED_MUTTON,
  [I.RAW_CHICKEN]: I.COOKED_CHICKEN,
};

// Fuel burn time in seconds (coal = 8 smelts, like Minecraft).
export const FUEL = {
  [I.COAL]: 80,
  [I.CHARCOAL]: 80,
  [B.LOG]: 15,
  [B.BIRCH_LOG]: 15,
  [B.SPRUCE_LOG]: 15,
  [B.PLANK]: 15,
  [B.BIRCH_PLANK]: 15,
  [B.SPRUCE_PLANK]: 15,
  [B.CRAFTING_TABLE]: 15,
  [B.BOOKSHELF]: 15,
  [B.FENCE]: 15,
  [B.OAK_SLAB]: 7,
  [B.SPRUCE_SLAB]: 7,
  [B.BIRCH_SLAB]: 7,
  [B.OAK_STAIRS]: 15,
  [B.SPRUCE_STAIRS]: 15,
  [B.SANDSTONE_STAIRS]: 15,
  [B.COAL_BLOCK]: 800,
  [B.LADDER]: 5,
  [B.DOOR]: 10,
  [I.STICK]: 5,
  [I.BLAZE_ROD]: 60,
  [I.LAVA_BUCKET]: 1000,
};

// ---------------------------------------------------------------------------
// Mining rules. hand = seconds to break bare-handed. tier = minimum tool tier
// required for the block to DROP anything. drop(rand) -> [itemId, count] | null.

export const MINING = {
  [B.GRASS]: { hand: 0.9, tool: 'shovel', tier: 0, drop: () => [B.DIRT, 1] },
  [B.DIRT]: { hand: 0.75, tool: 'shovel', tier: 0, drop: () => [B.DIRT, 1] },
  [B.SAND]: { hand: 0.75, tool: 'shovel', tier: 0, drop: () => [B.SAND, 1] },
  [B.SNOW]: { hand: 0.75, tool: 'shovel', tier: 0, drop: () => [B.SNOW, 1] },
  [B.STONE]: { hand: 7.5, tool: 'pickaxe', tier: 1, drop: () => [B.COBBLE, 1] },
  [B.COBBLE]: { hand: 10, tool: 'pickaxe', tier: 1, drop: () => [B.COBBLE, 1] },
  [B.COAL_ORE]: { hand: 15, tool: 'pickaxe', tier: 1, drop: () => [I.COAL, 1] },
  [B.IRON_ORE]: { hand: 15, tool: 'pickaxe', tier: 2, drop: () => [I.RAW_IRON, 1] },
  [B.DIAMOND_ORE]: { hand: 15, tool: 'pickaxe', tier: 3, drop: () => [I.DIAMOND, 1] },
  [B.FURNACE]: { hand: 10, tool: 'pickaxe', tier: 1, drop: () => [B.FURNACE, 1] },
  [B.LOG]: { hand: 3, tool: 'axe', tier: 0, drop: () => [B.LOG, 1] },
  [B.PLANK]: { hand: 3, tool: 'axe', tier: 0, drop: () => [B.PLANK, 1] },
  [B.LEAVES]: { hand: 0.35, tool: null, tier: 0, drop: (r) => r < 0.08 ? [I.APPLE, 1] : null },
  [B.GLASS]: { hand: 0.45, tool: null, tier: 0, drop: () => null },
  [B.WOOL]: { hand: 1.1, tool: null, tier: 0, drop: () => [B.WOOL, 1] },
  [B.CRAFTING_TABLE]: { hand: 2.5, tool: 'axe', tier: 0, drop: () => [B.CRAFTING_TABLE, 1] },
  [B.ICE]: { hand: 1.0, tool: 'pickaxe', tier: 0, drop: () => null },
  [B.OBSIDIAN]: { hand: 150, tool: 'pickaxe', tier: 4, drop: () => [B.OBSIDIAN, 1] }, // diamond pick: ~9.4s
  [B.NETHERRACK]: { hand: 2, tool: 'pickaxe', tier: 1, drop: () => [B.NETHERRACK, 1] },
  [B.END_STONE]: { hand: 5, tool: 'pickaxe', tier: 1, drop: () => [B.END_STONE, 1] },
  // End portal frames are indestructible — they generate in the stronghold
  [B.DRAGON_EGG]: { hand: 1.5, tool: null, tier: 0, drop: () => [B.DRAGON_EGG, 1] },
  [B.CHEST]: { hand: 2.5, tool: 'axe', tier: 0, drop: () => [B.CHEST, 1] },
  [B.BED]: { hand: 1.0, tool: null, tier: 0, drop: () => [B.BED, 1] },
  [B.STONE_BRICK]: { hand: 7.5, tool: 'pickaxe', tier: 1, drop: () => [B.STONE_BRICK, 1] },
  [B.STONE_STAIRS]: { hand: 7.5, tool: 'pickaxe', tier: 1, drop: () => [B.STONE_STAIRS, 1] },
  [B.DARK_LOG]: { hand: 3, tool: 'axe', tier: 0, drop: () => [B.DARK_LOG, 1] },
  [B.DARK_PLANK]: { hand: 3, tool: 'axe', tier: 0, drop: () => [B.DARK_PLANK, 1] },
  [B.IRON_BARS]: { hand: 8, tool: 'pickaxe', tier: 1, drop: () => [B.IRON_BARS, 1] },
  [B.MAGMA]: { hand: 6, tool: 'pickaxe', tier: 1, drop: () => [B.MAGMA, 1] },
  [B.PACKED_ICE]: { hand: 1.2, tool: 'pickaxe', tier: 0, drop: () => [B.PACKED_ICE, 1] },
  [B.SEA_LANTERN]: { hand: 0.8, tool: null, tier: 0, drop: () => [B.SEA_LANTERN, 1] },
  [B.CHISELED_BRICKS]: { hand: 7.5, tool: 'pickaxe', tier: 1, drop: () => [B.CHISELED_BRICKS, 1] },
  [B.TINTED_GLASS]: { hand: 0.45, tool: null, tier: 0, drop: () => [B.TINTED_GLASS, 1] },
  [B.CRYING_OBSIDIAN]: { hand: 60, tool: 'pickaxe', tier: 3, drop: () => [B.CRYING_OBSIDIAN, 1] },
  [B.NETHERITE_BLOCK]: { hand: 30, tool: 'pickaxe', tier: 3, drop: () => [B.NETHERITE_BLOCK, 1] },
  [B.BONE_BLOCK]: { hand: 4, tool: 'pickaxe', tier: 1, drop: () => [B.BONE_BLOCK, 1] },
  [B.AMETHYST]: { hand: 6, tool: 'pickaxe', tier: 1, drop: () => [B.AMETHYST, 1] },
  [B.IRON_BLOCK]: { hand: 15, tool: 'pickaxe', tier: 2, drop: () => [B.IRON_BLOCK, 1] },
  [B.DIAMOND_BLOCK]: { hand: 15, tool: 'pickaxe', tier: 3, drop: () => [B.DIAMOND_BLOCK, 1] },
  // building blocks
  [B.BRICKS]: { hand: 10, tool: 'pickaxe', tier: 1, drop: () => [B.BRICKS, 1] },
  [B.SANDSTONE]: { hand: 4, tool: 'pickaxe', tier: 1, drop: () => [B.SANDSTONE, 1] },
  [B.SMOOTH_STONE]: { hand: 7.5, tool: 'pickaxe', tier: 1, drop: () => [B.SMOOTH_STONE, 1] },
  [B.MOSSY_COBBLE]: { hand: 10, tool: 'pickaxe', tier: 1, drop: () => [B.MOSSY_COBBLE, 1] },
  [B.GRAVEL]: { hand: 0.9, tool: 'shovel', tier: 0, drop: () => [B.GRAVEL, 1] },
  [B.CLAY]: { hand: 0.9, tool: 'shovel', tier: 0, drop: () => [B.CLAY, 1] },
  [B.BOOKSHELF]: { hand: 2.5, tool: 'axe', tier: 0, drop: () => [B.BOOKSHELF, 1] },
  [B.GLOWSTONE]: { hand: 0.6, tool: null, tier: 0, drop: () => [B.GLOWSTONE, 1] },
  [B.QUARTZ_BLOCK]: { hand: 4, tool: 'pickaxe', tier: 1, drop: () => [B.QUARTZ_BLOCK, 1] },
  [B.NETHER_BRICK]: { hand: 10, tool: 'pickaxe', tier: 1, drop: () => [B.NETHER_BRICK, 1] },
  [B.GOLD_ORE]: { hand: 15, tool: 'pickaxe', tier: 3, drop: () => [I.RAW_GOLD, 1] },
  [B.REDSTONE_ORE]: { hand: 15, tool: 'pickaxe', tier: 3, drop: (r) => [I.REDSTONE, 4 + (r < 0.5 ? 0 : 1)] },
  [B.LAPIS_ORE]: { hand: 15, tool: 'pickaxe', tier: 2, drop: (r) => [I.LAPIS, 4 + ((r * 5) | 0)] },
  [B.EMERALD_ORE]: { hand: 15, tool: 'pickaxe', tier: 3, drop: () => [I.EMERALD, 1] },
  [B.QUARTZ_ORE]: { hand: 10, tool: 'pickaxe', tier: 1, drop: () => [I.QUARTZ, 1] },
  [B.GOLD_BLOCK]: { hand: 15, tool: 'pickaxe', tier: 3, drop: () => [B.GOLD_BLOCK, 1] },
  [B.REDSTONE_BLOCK]: { hand: 15, tool: 'pickaxe', tier: 1, drop: () => [B.REDSTONE_BLOCK, 1] },
  [B.LAPIS_BLOCK]: { hand: 15, tool: 'pickaxe', tier: 2, drop: () => [B.LAPIS_BLOCK, 1] },
  [B.EMERALD_BLOCK]: { hand: 15, tool: 'pickaxe', tier: 3, drop: () => [B.EMERALD_BLOCK, 1] },
  [B.BIRCH_LOG]: { hand: 3, tool: 'axe', tier: 0, drop: () => [B.BIRCH_LOG, 1] },
  [B.BIRCH_PLANK]: { hand: 3, tool: 'axe', tier: 0, drop: () => [B.BIRCH_PLANK, 1] },
  [B.SPRUCE_LOG]: { hand: 3, tool: 'axe', tier: 0, drop: () => [B.SPRUCE_LOG, 1] },
  [B.SPRUCE_PLANK]: { hand: 3, tool: 'axe', tier: 0, drop: () => [B.SPRUCE_PLANK, 1] },
  [B.PUMPKIN]: { hand: 1.4, tool: 'axe', tier: 0, drop: () => [B.PUMPKIN, 1] },
  [B.MELON]: { hand: 1.4, tool: 'axe', tier: 0, drop: () => [B.MELON, 1] },
  [B.HAY]: { hand: 0.75, tool: null, tier: 0, drop: () => [B.HAY, 1] },
  [B.SNOW_BLOCK]: { hand: 0.75, tool: 'shovel', tier: 0, drop: () => [B.SNOW_BLOCK, 1] },
  [B.TNT]: { hand: 0.3, tool: null, tier: 0, drop: () => [B.TNT, 1] },
  [B.CACTUS]: { hand: 0.6, tool: null, tier: 0, drop: () => [B.CACTUS, 1] },
  [B.TORCH]: { hand: 0.05, tool: null, tier: 0, drop: () => [B.TORCH, 1] },
  [B.FENCE]: { hand: 3, tool: 'axe', tier: 0, drop: () => [B.FENCE, 1] },
  [B.GLASS_PANE]: { hand: 0.45, tool: null, tier: 0, drop: () => null },
  [B.POPPY]: { hand: 0.05, tool: null, tier: 0, drop: () => [B.POPPY, 1] },
  [B.DANDELION]: { hand: 0.05, tool: null, tier: 0, drop: () => [B.DANDELION, 1] },
  [B.OAK_SLAB]: { hand: 3, tool: 'axe', tier: 0, drop: () => [B.OAK_SLAB, 1] },
  [B.COBBLE_SLAB]: { hand: 10, tool: 'pickaxe', tier: 1, drop: () => [B.COBBLE_SLAB, 1] },
  [B.STONE_SLAB]: { hand: 7.5, tool: 'pickaxe', tier: 1, drop: () => [B.STONE_SLAB, 1] },
  [B.STONE_BRICK_SLAB]: { hand: 7.5, tool: 'pickaxe', tier: 1, drop: () => [B.STONE_BRICK_SLAB, 1] },
  [B.BRICK_SLAB]: { hand: 10, tool: 'pickaxe', tier: 1, drop: () => [B.BRICK_SLAB, 1] },
  [B.SANDSTONE_SLAB]: { hand: 4, tool: 'pickaxe', tier: 1, drop: () => [B.SANDSTONE_SLAB, 1] },
  [B.OAK_STAIRS]: { hand: 3, tool: 'axe', tier: 0, drop: () => [B.OAK_STAIRS, 1] },
  [B.COBBLE_STAIRS]: { hand: 10, tool: 'pickaxe', tier: 1, drop: () => [B.COBBLE_STAIRS, 1] },
  [B.STONE_BRICK_STAIRS]: { hand: 7.5, tool: 'pickaxe', tier: 1, drop: () => [B.STONE_BRICK_STAIRS, 1] },
  [B.BRICK_STAIRS]: { hand: 10, tool: 'pickaxe', tier: 1, drop: () => [B.BRICK_STAIRS, 1] },
  [B.LADDER]: { hand: 0.6, tool: 'axe', tier: 0, drop: () => [B.LADDER, 1] },
  [B.DOOR]: { hand: 4.5, tool: 'axe', tier: 0, drop: () => [B.DOOR, 1] },
  // new blocks
  [B.COAL_BLOCK]: { hand: 15, tool: 'pickaxe', tier: 1, drop: () => [B.COAL_BLOCK, 1] },
  [B.JACK_O_LANTERN]: { hand: 1.4, tool: 'axe', tier: 0, drop: () => [B.JACK_O_LANTERN, 1] },
  [B.MOSSY_STONE_BRICK]: { hand: 7.5, tool: 'pickaxe', tier: 1, drop: () => [B.MOSSY_STONE_BRICK, 1] },
  [B.SPRUCE_STAIRS]: { hand: 3, tool: 'axe', tier: 0, drop: () => [B.SPRUCE_STAIRS, 1] },
  [B.SANDSTONE_STAIRS]: { hand: 4, tool: 'pickaxe', tier: 1, drop: () => [B.SANDSTONE_STAIRS, 1] },
  [B.BLUE_ORCHID]: { hand: 0.05, tool: null, tier: 0, drop: () => [B.BLUE_ORCHID, 1] },
  [B.ALLIUM]: { hand: 0.05, tool: null, tier: 0, drop: () => [B.ALLIUM, 1] },
  [B.COBWEB]: { hand: 4, tool: 'sword', tier: 0, drop: () => [I.STRING, 1] },
  [B.ENCHANT_TABLE]: { hand: 15, tool: 'pickaxe', tier: 1, drop: () => [B.ENCHANT_TABLE, 1] },
  [B.JUKEBOX]: { hand: 3, tool: 'axe', tier: 0, drop: () => [B.JUKEBOX, 1] },
  [B.NOTE_BLOCK]: { hand: 2, tool: 'axe', tier: 0, drop: () => [B.NOTE_BLOCK, 1] },
  [B.SPRUCE_SLAB]: { hand: 3, tool: 'axe', tier: 0, drop: () => [B.SPRUCE_SLAB, 1] },
  [B.BIRCH_SLAB]: { hand: 3, tool: 'axe', tier: 0, drop: () => [B.BIRCH_SLAB, 1] },
  [B.RED_MUSHROOM]: { hand: 0.05, tool: null, tier: 0, drop: () => [B.RED_MUSHROOM, 1] },
  [B.BROWN_MUSHROOM]: { hand: 0.05, tool: null, tier: 0, drop: () => [B.BROWN_MUSHROOM, 1] },
  [B.SUGAR_CANE]: { hand: 0.1, tool: null, tier: 0, drop: () => [B.SUGAR_CANE, 1] },
  [B.LANTERN]: { hand: 1.2, tool: 'pickaxe', tier: 0, drop: () => [B.LANTERN, 1] },
  [B.SLIME_BLOCK]: { hand: 0.8, tool: null, tier: 0, drop: () => [B.SLIME_BLOCK, 1] },
  [B.REDSTONE_DUST]: { hand: 0.05, tool: null, tier: 0, drop: () => [I.REDSTONE, 1] },
  [B.RTORCH]: { hand: 0.05, tool: null, tier: 0, drop: () => [B.RTORCH, 1] },
  [B.LEVER]: { hand: 0.4, tool: null, tier: 0, drop: () => [B.LEVER, 1] },
  [B.BUTTON]: { hand: 0.4, tool: 'pickaxe', tier: 0, drop: () => [B.BUTTON, 1] },
  [B.PLATE]: { hand: 0.4, tool: 'pickaxe', tier: 0, drop: () => [B.PLATE, 1] },
  [B.LAMP]: { hand: 0.6, tool: null, tier: 0, drop: () => [B.LAMP, 1] },
  [B.SENSOR]: { hand: 0.6, tool: null, tier: 0, drop: () => [B.SENSOR, 1] },
  [B.SHULKER_BOX]: { hand: 3, tool: 'pickaxe', tier: 0, drop: () => null }, // custom: drops with contents
  [B.REPEATER]: { hand: 0.4, tool: 'pickaxe', tier: 0, drop: () => [B.REPEATER, 1] },
  [B.COMPARATOR]: { hand: 0.4, tool: 'pickaxe', tier: 0, drop: () => [B.COMPARATOR, 1] },
  [B.OBSERVER]: { hand: 3, tool: 'pickaxe', tier: 0, drop: () => [B.OBSERVER, 1] },
  [B.PISTON]: { hand: 2.5, tool: 'pickaxe', tier: 0, drop: () => [B.PISTON, 1] },
  [B.STICKY_PISTON]: { hand: 2.5, tool: 'pickaxe', tier: 0, drop: () => [B.STICKY_PISTON, 1] },
  [B.PISTON_HEAD]: { hand: 2.5, tool: 'pickaxe', tier: 0, drop: () => null },
  [B.DISPENSER]: { hand: 4, tool: 'pickaxe', tier: 0, drop: () => [B.DISPENSER, 1] },
  [B.DROPPER]: { hand: 4, tool: 'pickaxe', tier: 0, drop: () => [B.DROPPER, 1] },
  [B.HOPPER]: { hand: 4, tool: 'pickaxe', tier: 0, drop: () => [B.HOPPER, 1] },
  [B.BULB]: { hand: 0.6, tool: 'pickaxe', tier: 0, drop: () => [B.BULB, 1] },
  [B.TARGET]: { hand: 0.75, tool: null, tier: 0, drop: () => [B.TARGET, 1] },
};

// stair facing variants break like their base block; colored wool like wool
for (let id = 1; id < BLOCKS.length; id++) {
  const blk = BLOCKS[id];
  if (blk && blk.hidden && blk.item && MINING[blk.item]) MINING[id] = MINING[blk.item];
}
for (const id of WOOL_IDS) {
  MINING[id] = { hand: 1.1, tool: null, tier: 0, drop: () => [id, 1] };
}

// What happens if `heldId` mines `blockId`. null = unbreakable.
export function breakInfo(blockId, heldId) {
  const m = MINING[blockId];
  if (!m) return null;
  const it = ITEMS[heldId];
  let time = m.hand;
  let canHarvest = m.tier === 0;
  if (it && it.kind === 'tool' && it.toolType === m.tool) {
    time = m.hand / it.mult;
    if (it.tier >= m.tier) canHarvest = true;
  }
  return { time: Math.max(0.05, time), canHarvest, drop: m.drop, needTool: m.tool, needTier: m.tier };
}

// ---------------------------------------------------------------------------
// Recipes (Minecraft-style grid crafting)
// Shaped recipes have a pattern laid out in the grid; shapeless just need the
// items anywhere. Recipes taller/wider than 2 need a crafting table (3x3).

function shaped(out, n, shape, key) {
  const pattern = shape.map(row => [...row].map(ch => (ch === '.' ? null : key[ch])));
  const counts = new Map();
  for (const row of pattern) for (const c of row) if (c != null) counts.set(c, (counts.get(c) || 0) + 1);
  const h = pattern.length, w = pattern[0].length;
  return { out, n, pattern, in: [...counts], needsTable: h > 2 || w > 2 };
}

function shapeless(out, n, items) {
  const counts = new Map();
  for (const id of items) counts.set(id, (counts.get(id) || 0) + 1);
  return { out, n, shapeless: [...items].sort((a, b) => a - b), in: [...counts], needsTable: items.length > 4 };
}

const toolRecipes = [];
{
  const heads = { wood: B.PLANK, stone: B.COBBLE, iron: I.IRON_INGOT, diamond: I.DIAMOND, gold: I.GOLD_INGOT };
  const shapes = {
    pickaxe: ['MMM', '.S.', '.S.'],
    axe: ['MM', 'MS', '.S'],
    shovel: ['M', 'S', 'S'],
    sword: ['M', 'M', 'S'],
  };
  ['wood', 'stone', 'iron', 'diamond', 'gold'].forEach((mn, i) => {
    for (const [tool, ids] of Object.entries(TOOL_IDS)) {
      toolRecipes.push(shaped(ids[i], 1, shapes[tool], { M: heads[mn], S: I.STICK }));
    }
  });
}

const armorRecipes = [];
{
  const mats = { iron: I.IRON_INGOT, diamond: I.DIAMOND, gold: I.GOLD_INGOT };
  const ids = {
    iron: [I.IRON_HELMET, I.IRON_CHEST, I.IRON_LEGS, I.IRON_BOOTS],
    diamond: [I.DIAMOND_HELMET, I.DIAMOND_CHEST, I.DIAMOND_LEGS, I.DIAMOND_BOOTS],
    gold: [I.GOLD_HELMET, I.GOLD_CHEST, I.GOLD_LEGS, I.GOLD_BOOTS],
  };
  const shapes = [['MMM', 'M.M'], ['M.M', 'MMM', 'MMM'], ['MMM', 'M.M', 'M.M'], ['M.M', 'M.M']];
  for (const m of ['iron', 'diamond', 'gold']) {
    shapes.forEach((sh, i) => armorRecipes.push(shaped(ids[m][i], 1, sh, { M: mats[m] })));
  }
}

// slabs & stairs: 3 in a row -> 6 slabs; step shape -> 4 stairs
const slabRecipes = [
  [B.OAK_SLAB, B.PLANK], [B.COBBLE_SLAB, B.COBBLE], [B.STONE_SLAB, B.SMOOTH_STONE],
  [B.STONE_BRICK_SLAB, B.STONE_BRICK], [B.BRICK_SLAB, B.BRICKS], [B.SANDSTONE_SLAB, B.SANDSTONE],
  [B.SPRUCE_SLAB, B.SPRUCE_PLANK], [B.BIRCH_SLAB, B.BIRCH_PLANK],
  [B.QUARTZ_SLAB, B.SMOOTH_QUARTZ], [B.DEEPSLATE_BRICK_SLAB, B.DEEPSLATE_BRICK],
  [B.BLACKSTONE_SLAB, B.POLISHED_BLACKSTONE], [B.PURPUR_SLAB, B.PURPUR],
  [B.PRISMARINE_SLAB, B.PRISMARINE],
].map(([out, m]) => shaped(out, 6, ['MMM'], { M: m }));
const stairRecipes = [
  [B.OAK_STAIRS, B.PLANK], [B.COBBLE_STAIRS, B.COBBLE],
  [B.STONE_BRICK_STAIRS, B.STONE_BRICK], [B.BRICK_STAIRS, B.BRICKS],
  [B.SPRUCE_STAIRS, B.SPRUCE_PLANK], [B.SANDSTONE_STAIRS, B.SANDSTONE],
  [B.QUARTZ_STAIRS, B.SMOOTH_QUARTZ], [B.DEEPSLATE_BRICK_STAIRS, B.DEEPSLATE_BRICK],
  [B.BLACKSTONE_STAIRS, B.POLISHED_BLACKSTONE], [B.PURPUR_STAIRS, B.PURPUR],
  [B.PRISMARINE_STAIRS, B.PRISMARINE],
].map(([out, m]) => shaped(out, 4, ['M..', 'MM.', 'MMM'], { M: m }));

export const RECIPES = [
  shaped(B.PLANK, 4, ['L'], { L: B.LOG }),
  shaped(B.BIRCH_PLANK, 4, ['L'], { L: B.BIRCH_LOG }),
  shaped(B.SPRUCE_PLANK, 4, ['L'], { L: B.SPRUCE_LOG }),
  shaped(I.STICK, 4, ['P', 'P'], { P: B.PLANK }),
  shaped(I.STICK, 4, ['P', 'P'], { P: B.BIRCH_PLANK }),
  shaped(I.STICK, 4, ['P', 'P'], { P: B.SPRUCE_PLANK }),
  shaped(B.CRAFTING_TABLE, 1, ['PP', 'PP'], { P: B.PLANK }),
  shaped(B.FURNACE, 1, ['CCC', 'C.C', 'CCC'], { C: B.COBBLE }),
  shaped(B.TORCH, 4, ['C', 'S'], { C: I.COAL, S: I.STICK }),
  shaped(B.TORCH, 4, ['C', 'S'], { C: I.CHARCOAL, S: I.STICK }),
  ...toolRecipes,
  shaped(I.BUCKET, 1, ['I.I', '.I.'], { I: I.IRON_INGOT }),
  shapeless(I.FLINT_STEEL, 1, [I.IRON_INGOT, I.COAL]),
  shaped(I.BOW, 1, ['.ST', 'S.T', '.ST'], { S: I.STICK, T: I.STRING }),
  shaped(I.ARROW, 4, ['..S', '.S.', 'S..'], { S: I.STICK }),
  shaped(B.CHEST, 1, ['PPP', 'P.P', 'PPP'], { P: B.PLANK }),
  shaped(B.BED, 1, ['WWW', 'PPP'], { W: B.WOOL, P: B.PLANK }),
  shapeless(I.BLAZE_POWDER, 2, [I.BLAZE_ROD]),
  shapeless(I.EYE_OF_ENDER, 1, [I.ENDER_PEARL, I.BLAZE_POWDER]),
  ...armorRecipes,
  shaped(B.STONE_BRICK, 4, ['SS', 'SS'], { S: B.STONE }),
  shaped(B.SANDSTONE, 1, ['SS', 'SS'], { S: B.SAND }),
  shaped(B.QUARTZ_BLOCK, 1, ['QQ', 'QQ'], { Q: I.QUARTZ }),
  ...slabRecipes,
  ...stairRecipes,
  shaped(B.FENCE, 3, ['PSP', 'PSP'], { P: B.PLANK, S: I.STICK }),
  shaped(B.GLASS_PANE, 16, ['GGG', 'GGG'], { G: B.GLASS }),
  shaped(B.LADDER, 3, ['S.S', 'SSS', 'S.S'], { S: I.STICK }),
  shaped(B.DOOR, 3, ['PP', 'PP', 'PP'], { P: B.PLANK }),
  shaped(B.BOOKSHELF, 1, ['PPP', '...', 'PPP'], { P: B.PLANK }),
  shaped(B.TNT, 1, ['CSC', 'SCS', 'CSC'], { C: I.COAL, S: B.SAND }),
  shaped(B.IRON_BLOCK, 1, ['III', 'III', 'III'], { I: I.IRON_INGOT }),
  shapeless(I.IRON_INGOT, 9, [B.IRON_BLOCK]),
  shaped(B.GOLD_BLOCK, 1, ['GGG', 'GGG', 'GGG'], { G: I.GOLD_INGOT }),
  shapeless(I.GOLD_INGOT, 9, [B.GOLD_BLOCK]),
  shaped(B.DIAMOND_BLOCK, 1, ['DDD', 'DDD', 'DDD'], { D: I.DIAMOND }),
  shapeless(I.DIAMOND, 9, [B.DIAMOND_BLOCK]),
  shaped(B.REDSTONE_BLOCK, 1, ['RRR', 'RRR', 'RRR'], { R: I.REDSTONE }),
  shapeless(I.REDSTONE, 9, [B.REDSTONE_BLOCK]),
  shaped(B.LAPIS_BLOCK, 1, ['LLL', 'LLL', 'LLL'], { L: I.LAPIS }),
  shapeless(I.LAPIS, 9, [B.LAPIS_BLOCK]),
  shaped(B.EMERALD_BLOCK, 1, ['EEE', 'EEE', 'EEE'], { E: I.EMERALD }),
  shapeless(I.EMERALD, 9, [B.EMERALD_BLOCK]),
  shaped(B.COAL_BLOCK, 1, ['CCC', 'CCC', 'CCC'], { C: I.COAL }),
  shapeless(I.COAL, 9, [B.COAL_BLOCK]),
  shaped(B.JACK_O_LANTERN, 1, ['P', 'T'], { P: B.PUMPKIN, T: B.TORCH }),
  shapeless(B.MOSSY_STONE_BRICK, 1, [B.STONE_BRICK, B.LEAVES]),
  shaped(B.ENCHANT_TABLE, 1, ['.B.', 'DOD', 'OOO'], { B: B.BOOKSHELF, D: I.DIAMOND, O: B.OBSIDIAN }),
  shaped(B.JUKEBOX, 1, ['PPP', 'PDP', 'PPP'], { P: B.PLANK, D: I.DIAMOND }),
  shaped(B.NOTE_BLOCK, 1, ['PPP', 'PRP', 'PPP'], { P: B.PLANK, R: I.REDSTONE }),
  shaped(I.BOWL, 4, ['P.P', '.P.'], { P: B.PLANK }),
  shapeless(I.MUSHROOM_STEW, 1, [B.RED_MUSHROOM, B.BROWN_MUSHROOM, I.BOWL]),
  shaped(I.GOLDEN_APPLE, 1, ['GGG', 'GAG', 'GGG'], { G: I.GOLD_INGOT, A: I.APPLE }),
  shapeless(I.SUGAR, 1, [B.SUGAR_CANE]),
  shapeless(I.PUMPKIN_PIE, 1, [B.PUMPKIN, I.SUGAR, I.EGG]),
  shapeless(I.MELON_SLICE, 5, [B.MELON]),
  shaped(B.LANTERN, 1, ['I', 'T', 'I'], { I: I.IRON_INGOT, T: B.TORCH }),
  shaped(B.SLIME_BLOCK, 1, ['SSS', 'SSS', 'SSS'], { S: I.SLIMEBALL }),
  shapeless(I.SLIMEBALL, 9, [B.SLIME_BLOCK]),
  shaped(B.BONE_BLOCK, 1, ['BBB', 'BBB', 'BBB'], { B: I.BONE }),
  shapeless(I.BONE, 9, [B.BONE_BLOCK]),
  shapeless(B.REDSTONE_DUST, 1, [I.REDSTONE]),
  shaped(B.RTORCH, 1, ['R', 'S'], { R: I.REDSTONE, S: I.STICK }),
  shaped(B.LEVER, 1, ['S', 'C'], { S: I.STICK, C: B.COBBLE }),
  shapeless(B.BUTTON, 1, [B.STONE]),
  shaped(B.PLATE, 1, ['SS'], { S: B.STONE }),
  shaped(B.LAMP, 1, ['RRR', 'RGR', 'RRR'], { R: I.REDSTONE, G: B.GLOWSTONE }),
  shaped(B.SENSOR, 1, ['GGG', 'QQQ', 'SSS'], { G: B.GLASS, Q: I.QUARTZ, S: B.OAK_SLAB }),
  shaped(B.SHULKER_BOX, 1, ['P.P', 'PCP', 'P.P'], { P: I.ENDER_PEARL, C: B.CHEST }),
  shaped(B.REPEATER, 1, ['TRT', 'SSS'], { T: B.RTORCH, R: I.REDSTONE, S: B.STONE_SLAB }),
  shaped(B.COMPARATOR, 1, ['.T.', 'TQT', 'SSS'], { T: B.RTORCH, Q: I.QUARTZ, S: B.STONE_SLAB }),
  shaped(B.OBSERVER, 1, ['CCC', 'RQC', 'CCC'], { C: B.COBBLE, R: I.REDSTONE, Q: I.QUARTZ }),
  shaped(B.PISTON, 1, ['PPP', 'CIC', 'CRC'], { P: B.PLANK, C: B.COBBLE, I: I.IRON_INGOT, R: I.REDSTONE }),
  shapeless(B.STICKY_PISTON, 1, [B.PISTON, I.SLIMEBALL]),
  shaped(B.DISPENSER, 1, ['CCC', 'CBC', 'CRC'], { C: B.COBBLE, B: I.BOW, R: I.REDSTONE }),
  shaped(B.DROPPER, 1, ['CCC', 'C.C', 'CRC'], { C: B.COBBLE, R: I.REDSTONE }),
  shaped(B.HOPPER, 1, ['I.I', 'ICI', '.I.'], { I: I.IRON_INGOT, C: B.CHEST }),
  shaped(B.BULB, 1, ['GAG', 'ARA', 'GAG'], { G: B.GLASS, A: B.AMETHYST, R: I.REDSTONE }),
  shaped(B.TARGET, 1, ['R.R', 'RHR', 'R.R'], { R: I.REDSTONE, H: B.HAY }),

  // --- building set ---------------------------------------------------------
  shapeless(B.DEEPSLATE, 1, [B.STONE, I.COAL]),
  shapeless(B.COBBLED_DEEPSLATE, 1, [B.DEEPSLATE, B.COBBLE]),
  shaped(B.POLISHED_DEEPSLATE, 4, ['DD', 'DD'], { D: B.DEEPSLATE }),
  shaped(B.DEEPSLATE_BRICK, 4, ['DD', 'DD'], { D: B.POLISHED_DEEPSLATE }),
  shapeless(B.CHISELED_DEEPSLATE, 1, [B.DEEPSLATE_BRICK_SLAB, B.DEEPSLATE_BRICK_SLAB]),
  shapeless(B.DIORITE, 2, [B.STONE, I.QUARTZ]),
  shaped(B.POLISHED_DIORITE, 4, ['DD', 'DD'], { D: B.DIORITE }),
  shapeless(B.GRANITE, 1, [B.DIORITE, I.REDSTONE]),
  shaped(B.POLISHED_GRANITE, 4, ['GG', 'GG'], { G: B.GRANITE }),
  shapeless(B.ANDESITE, 1, [B.DIORITE, B.COBBLE]),
  shaped(B.POLISHED_ANDESITE, 4, ['AA', 'AA'], { A: B.ANDESITE }),
  shaped(B.QUARTZ_PILLAR, 2, ['Q', 'Q'], { Q: B.QUARTZ_BLOCK }),
  shapeless(B.CHISELED_QUARTZ, 1, [B.QUARTZ_SLAB, B.QUARTZ_SLAB]),
  shaped(B.CUT_SANDSTONE, 4, ['SS', 'SS'], { S: B.SANDSTONE }),
  shapeless(B.PRISMARINE, 1, [B.SAND, I.LAPIS]),
  shaped(B.PRISMARINE_BRICK, 4, ['PP', 'PP'], { P: B.PRISMARINE }),
  shapeless(B.DARK_PRISMARINE, 1, [B.PRISMARINE_BRICK, I.COAL]),
  shaped(B.NETHER_BRICK_FENCE, 6, ['NNN', 'NNN'], { N: B.NETHER_BRICK }),

  // --- Nether set -----------------------------------------------------------
  shapeless(B.SOUL_SAND, 2, [B.SAND, I.GUNPOWDER]),
  shapeless(B.BASALT, 2, [B.NETHERRACK, I.COAL]),
  shaped(B.POLISHED_BASALT, 4, ['BB', 'BB'], { B: B.BASALT }),
  shapeless(B.BLACKSTONE, 2, [B.NETHERRACK, B.COBBLE]),
  shaped(B.POLISHED_BLACKSTONE, 4, ['BB', 'BB'], { B: B.BLACKSTONE }),
  shaped(B.POLISHED_BLACKSTONE_BRICK, 4, ['BB', 'BB'], { B: B.POLISHED_BLACKSTONE }),
  shapeless(B.CHISELED_BLACKSTONE, 1, [B.BLACKSTONE_SLAB, B.BLACKSTONE_SLAB]),
  shapeless(B.NETHER_WART_BLOCK, 1, [B.NETHERRACK, I.REDSTONE]),
  shapeless(B.SHROOMLIGHT, 1, [B.GLOWSTONE, B.RED_MUSHROOM]),
  shapeless(B.NETHER_GOLD_ORE, 1, [B.NETHERRACK, I.GOLD_INGOT]),
  shapeless(B.ANCIENT_DEBRIS, 1, [B.NETHERRACK, I.GOLD_INGOT, I.GOLD_INGOT]),
  shapeless(B.CRIMSON_STEM, 1, [B.LOG, I.REDSTONE]),
  shaped(B.CRIMSON_PLANK, 4, ['L'], { L: B.CRIMSON_STEM }),
  shapeless(B.WARPED_STEM, 1, [B.LOG, I.LAPIS]),
  shaped(B.WARPED_PLANK, 4, ['L'], { L: B.WARPED_STEM }),

  // --- End set --------------------------------------------------------------
  shaped(B.END_STONE_BRICK, 4, ['EE', 'EE'], { E: B.END_STONE }),
  shapeless(B.PURPUR, 1, [B.END_STONE, I.ENDER_PEARL]),
  shaped(B.PURPUR_PILLAR, 2, ['P', 'P'], { P: B.PURPUR }),
  shaped(B.END_ROD, 2, ['B', 'E'], { B: I.BLAZE_ROD, E: B.END_STONE }),
];

// Match the crafting grid (row-major array of itemId|null, always 3x3)
// against all recipes. Returns the recipe or null.
export function matchGrid(cells, size = 3) {
  let minR = size, maxR = -1, minC = size, maxC = -1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (cells[r * size + c] != null) {
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
      }
    }
  }
  if (maxR === -1) return null;
  const h = maxR - minR + 1, w = maxC - minC + 1;

  const placed = cells.filter(c => c != null).sort((a, b) => a - b);

  for (const r of RECIPES) {
    if (r.shapeless) {
      if (placed.length === r.shapeless.length && placed.every((id, i) => id === r.shapeless[i])) return r;
      continue;
    }
    const pat = r.pattern;
    if (pat.length !== h || pat[0].length !== w) continue;
    let ok = true, okMirror = true;
    for (let rr = 0; rr < h && (ok || okMirror); rr++) {
      for (let cc = 0; cc < w; cc++) {
        const cell = cells[(minR + rr) * size + (minC + cc)];
        if (cell !== pat[rr][cc]) ok = false;
        if (cell !== pat[rr][w - 1 - cc]) okMirror = false;
      }
    }
    if (ok || okMirror) return r;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pixel-art icons (12x12 stencils rendered onto 16x16 canvases)

const TOOL_STENCILS = {
  pickaxe: [
    '..dmmmmmd...',
    '.md.....dm..',
    'md.......dm.',
    'm.....hh..m.',
    '......hh....',
    '.....hh.....',
    '....hh......',
    '...hh.......',
    '..hh........',
    '.hh.........',
    'hh..........',
    '............',
  ],
  axe: [
    '..dmmm......',
    '.dmmmmm.....',
    '.mmd.hh.....',
    '.mm.hh......',
    '....hh......',
    '...hh.......',
    '..hh........',
    '.hh.........',
    'hh..........',
    '............',
    '............',
    '............',
  ],
  shovel: [
    '.......dmm..',
    '......dmmm..',
    '......mmmm..',
    '.....h.mm...',
    '....hh......',
    '...hh.......',
    '..hh........',
    '.hh.........',
    'hh..........',
    '............',
    '............',
    '............',
  ],
  sword: [
    '.........mm.',
    '........mmd.',
    '.......mmd..',
    '......mmd...',
    '.....mmd....',
    '.g..mmd.....',
    '..gmmd......',
    '..gg........',
    '.hhg........',
    'hh..........',
    '............',
    '............',
  ],
};

const MEAT = [
  '............',
  '....pppp....',
  '..pPPppppp..',
  '.pPPpppppp..',
  '.ppppppppp..',
  '..ppppppp...',
  '...wwpp.....',
  '...ww.......',
  '..ww........',
  '............',
  '............',
  '............',
];

const ITEM_STENCILS = {
  [I.STICK]: {
    rows: [
      '............', '.......hh...', '......hhh...', '.....hhh....',
      '....hhh.....', '...hhh......', '..hhh.......', '.hhh........',
      '.hh.........', '............', '............', '............',
    ],
    pal: { h: '#8a5d2e' },
  },
  [I.COAL]: {
    rows: [
      '............', '............', '...cccc.....', '..cccccc....',
      '.ccclcccc...', '.cccccccc...', '.ccccccdc...', '..cccccc....',
      '...cccc.....', '............', '............', '............',
    ],
    pal: { c: '#2e2e32', l: '#54545a', d: '#1a1a1e' },
  },
  [I.IRON_INGOT]: {
    rows: [
      '............', '............', '............', '...dddddd...',
      '..dmmmmmmd..', '.dmmlmmmmmd.', '.mmmmmmmmm..', '.dddddddddd.',
      '............', '............', '............', '............',
    ],
    pal: { m: '#d8d8d8', d: '#9a9a9a', l: '#f4f4f4' },
  },
  [I.DIAMOND]: {
    rows: [
      '............', '............', '....dmmd....', '...dmlmmd...',
      '..dmlmmmmd..', '...mmmmmm...', '....mmmm....', '.....mm.....',
      '............', '............', '............', '............',
    ],
    pal: { m: '#4adfd9', d: '#2fb3ae', l: '#b8fffb' },
  },
  [I.APPLE]: {
    rows: [
      '......g.....', '.....g......', '..rrr.rrr...', '.rrrrrrrrr..',
      '.rlrrrrrrr..', '.rlrrrrrrr..', '.rrrrrrrrr..', '..rrrrrrr...',
      '...rr.rr....', '............', '............', '............',
    ],
    pal: { r: '#c62828', g: '#3f7d2c', l: '#e57373' },
  },
  [I.PORKCHOP]: { rows: MEAT, pal: { p: '#f2a0a0', P: '#f8caca', w: '#efe6d6' } },
  [I.BEEF]: { rows: MEAT, pal: { p: '#9e4a3a', P: '#c96f5b', w: '#efe6d6' } },
  [I.MUTTON]: { rows: MEAT, pal: { p: '#d67e6e', P: '#eba99c', w: '#efe6d6' } },
  [I.FLESH]: { rows: MEAT, pal: { p: '#7a8a4a', P: '#9aa86a', w: '#5a6a3a' } },
  [I.COOKED_PORKCHOP]: { rows: MEAT, pal: { p: '#d98850', P: '#f0b070', w: '#efe6d6' } },
  [I.STEAK]: { rows: MEAT, pal: { p: '#8a4a2a', P: '#b06a40', w: '#efe6d6' } },
  [I.COOKED_MUTTON]: { rows: MEAT, pal: { p: '#c07038', P: '#e09858', w: '#efe6d6' } },
  [I.RAW_IRON]: {
    rows: [
      '............', '............', '...mmmm.....', '..mmmdmm....',
      '.mmlmmmmm...', '.mmmmmdmm...', '.mlmmmmmm...', '..mmmmmm....',
      '...mmmm.....', '............', '............', '............',
    ],
    pal: { m: '#dcae8e', d: '#b58465', l: '#f2d2ba' },
  },
  [I.CHARCOAL]: {
    rows: [
      '............', '............', '...cccc.....', '..cccccc....',
      '.ccclcccc...', '.cccccccc...', '.ccccccdc...', '..cccccc....',
      '...cccc.....', '............', '............', '............',
    ],
    pal: { c: '#3a3028', l: '#5c5044', d: '#241d16' },
  },
};

const BUCKET_ROWS = [
  '............',
  '...h....h...',
  '....h..h....',
  '....hhhh....',
  '...LLLLLL...',
  '..mLLLLLLm..',
  '..dmmmmmmd..',
  '...dmmmmd...',
  '...dmmmmd...',
  '....dmmd....',
  '....dddd....',
  '............',
];
const BUCKET_PAL = { m: '#c8c8cc', d: '#8e8e94', h: '#a0a0a6' };
ITEM_STENCILS[I.FLINT_STEEL] = {
  rows: [
    '............', '....mmm.....', '...m...m....', '..m......f..',
    '..m.....ff..', '...m...fff..', '....m..ff...', '......fff...',
    '.....fff....', '....ff......', '............', '............',
  ],
  pal: { m: '#b8b8be', f: '#4a4a52' },
};
ITEM_STENCILS[I.ENDER_PEARL] = {
  rows: [
    '............', '............', '....dmmd....', '...dmlmmd...',
    '..dmllmmmd..', '..mmlmmmmm..', '..mmmmmmdm..', '..dmmmmmdd..',
    '...dmmmdd...', '....dddd....', '............', '............',
  ],
  pal: { m: '#1f7a6e', d: '#124b44', l: '#7de8d4' },
};
ITEM_STENCILS[I.BLAZE_POWDER] = {
  rows: [
    '............', '.....g......', '..g.....G...', '....G.g.....',
    '.g...gg...g.', '...gggGg....', '..gGgggggG..', '.gggGggggg..',
    '..gggggGg...', '............', '............', '............',
  ],
  pal: { g: '#f0921e', G: '#ffd050' },
};
ITEM_STENCILS[I.EYE_OF_ENDER] = {
  rows: [
    '............', '............', '....dmmd....', '...dmmmmd...',
    '..dmmggmmd..', '..mmgGGgmm..', '..mmgGGgmm..', '..dmmggmmd..',
    '...dmmmmd...', '....dddd....', '............', '............',
  ],
  pal: { m: '#3a8a5e', d: '#1e4a34', g: '#84e8b8', G: '#0a1410' },
};
ITEM_STENCILS[I.STRING] = {
  rows: [
    '............', '...ssss.....', '..s....s....', '.s......s...',
    '.s......s...', '.d......s...', '.d.....s....', '..d...s.....',
    '...ddd......', '......s.....', '.......s....', '............',
  ],
  pal: { s: '#e8e8e8', d: '#c2c2c2' },
};
ITEM_STENCILS[I.BOW] = {
  rows: [
    '.....mmms...', '...mm...s...', '..m.....s...', '.m......s...',
    '.m......s...', '.d......s...', '.d......s...', '.m......s...',
    '.m......s...', '..m.....s...', '...mm...s...', '.....mmms...',
  ],
  pal: { m: '#8a5d2e', d: '#6e4a24', s: '#e8e8e8' },
};
ITEM_STENCILS[I.ARROW] = {
  rows: [
    '.........tt.', '........ttt.', '.......htt..', '......hh....',
    '.....hh.....', '....hh......', '...hh.......', '..hh........',
    '.fhf........', '.ff.........', 'f.f.........', '............',
  ],
  pal: { t: '#c8c8c8', h: '#8a5d2e', f: '#f0f0f0' },
};
ITEM_STENCILS[I.BLAZE_ROD] = {
  rows: [
    '............', '........gG..', '.......gg...', '......gG....',
    '.....gg.....', '....gG......', '...gg.......', '..gG........',
    '.gg.........', '............', '............', '............',
  ],
  pal: { g: '#e8a820', G: '#ffd868' },
};
ITEM_STENCILS[I.BUCKET] = { rows: BUCKET_ROWS, pal: { ...BUCKET_PAL, L: '#c8c8cc' } };
ITEM_STENCILS[I.WATER_BUCKET] = { rows: BUCKET_ROWS, pal: { ...BUCKET_PAL, L: '#3d6fd9' } };
ITEM_STENCILS[I.LAVA_BUCKET] = { rows: BUCKET_ROWS, pal: { ...BUCKET_PAL, L: '#e8702a' } };
// new ores/materials reuse existing stencil rows with their own palettes
ITEM_STENCILS[I.GOLD_INGOT] = { rows: ITEM_STENCILS[I.IRON_INGOT].rows, pal: { m: '#f2cf5a', d: '#bd9430', l: '#ffefa8' } };
ITEM_STENCILS[I.RAW_GOLD] = { rows: ITEM_STENCILS[I.RAW_IRON].rows, pal: { m: '#e8c25c', d: '#b08a32', l: '#f8e8a8' } };
ITEM_STENCILS[I.REDSTONE] = { rows: ITEM_STENCILS[I.BLAZE_POWDER].rows, pal: { g: '#c62f22', G: '#ff6a55' } };
ITEM_STENCILS[I.LAPIS] = { rows: ITEM_STENCILS[I.COAL].rows, pal: { c: '#2e52b4', l: '#5e86e0', d: '#1e3680' } };
ITEM_STENCILS[I.EMERALD] = { rows: ITEM_STENCILS[I.DIAMOND].rows, pal: { m: '#3ecf6e', d: '#2a9a4e', l: '#b0ffcc' } };
ITEM_STENCILS[I.QUARTZ] = { rows: ITEM_STENCILS[I.DIAMOND].rows, pal: { m: '#ece8e0', d: '#c0b8ac', l: '#ffffff' } };
ITEM_STENCILS[I.GUNPOWDER] = { rows: ITEM_STENCILS[I.COAL].rows, pal: { c: '#5a5a52', l: '#7c7c70', d: '#3c3c36' } };
ITEM_STENCILS[I.RAW_CHICKEN] = { rows: MEAT, pal: { p: '#e8a0a8', P: '#f2c4c8', w: '#efe6d6' } };
ITEM_STENCILS[I.COOKED_CHICKEN] = { rows: MEAT, pal: { p: '#c08040', P: '#e0a860', w: '#efe6d6' } };
ITEM_STENCILS[I.EGG] = { rows: ['............', '............', '.....oo.....', '....oooo....', '...oolloo...', '...oolloo...', '...oooooo...', '....oooo....', '.....oo.....', '............', '............', '............'], pal: { o: '#efe8da', l: '#ffffff' } };
ITEM_STENCILS[I.BOWL] = { rows: ['............', '............', '............', '............', '............', '..w......w..', '..ww....ww..', '...wwwwww...', '....wwww....', '............', '............', '............'], pal: { w: '#9e7145' } };
ITEM_STENCILS[I.MUSHROOM_STEW] = { rows: ['............', '............', '............', '............', '...ssssss...', '..wssssssw..', '..wwssssww..', '...wwwwww...', '....wwww....', '............', '............', '............'], pal: { w: '#9e7145', s: '#c98d5e' } };
ITEM_STENCILS[I.GOLDEN_APPLE] = { rows: ITEM_STENCILS[I.APPLE].rows, pal: { r: '#f2c230', g: '#8a6a1e', l: '#ffe89a' } };
ITEM_STENCILS[I.MELON_SLICE] = { rows: ['............', '............', '..gg........', '..grg.......', '..grrg......', '..grrrg.....', '..grdrrg....', '..grrrrg....', '...ggggg....', '............', '............', '............'], pal: { g: '#3f8f3a', r: '#e85454', d: '#2a2a2a' } };
ITEM_STENCILS[I.SUGAR] = { rows: ITEM_STENCILS[I.BLAZE_POWDER].rows, pal: { g: '#e8e8e8', G: '#ffffff' } };
ITEM_STENCILS[I.PUMPKIN_PIE] = { rows: ['............', '............', '............', '............', '...cccccccc.', '..cfffffff..', '..cfffffff..', '..cccccccc..', '............', '............', '............', '............'], pal: { c: '#c98d4e', f: '#e8a84e' } };
ITEM_STENCILS[I.BONE] = { rows: ['............', '...bb.......', '..bbbb......', '..bbbb......', '...bb.......', '....bb......', '.....bb.....', '......bb....', '.....bbbb...', '.....bbbb...', '......bb....', '............'], pal: { b: '#e8e4d8' } };
ITEM_STENCILS[I.SLIMEBALL] = { rows: ['............', '............', '....gggg....', '..gggggggg..', '..gglggggg..', '..gglggggg..', '..gggggggg..', '..gggggggg..', '....gggg....', '............', '............', '............'], pal: { g: '#7ed67e', l: '#d0ffd0' } };
const ARMOR_STENCILS = {
  head: [
    '............', '............', '...dmmmmd...', '..dmmmmmmd..',
    '..mmmmmmmm..', '..mmmmmmmm..', '..mm....mm..', '..mm....mm..',
    '............', '............', '............', '............',
  ],
  chest: [
    '............', '.mm......mm.', '.mmm....mmm.', '.mmmmmmmmmm.',
    '..mmmmmmmm..', '..mmmmmmmm..', '..mmmmmmmm..', '..mmmmmmmm..',
    '..dmmmmmmd..', '............', '............', '............',
  ],
  legs: [
    '............', '..mmmmmmmm..', '..mmmmmmmm..', '..mm.dd.mm..',
    '..mm....mm..', '..mm....mm..', '..mm....mm..', '..mm....mm..',
    '..dd....dd..', '............', '............', '............',
  ],
  feet: [
    '............', '............', '............', '..mm....mm..',
    '..mm....mm..', '..mm....mm..', '.dmmm..dmmm.', '.mmmm..mmmm.',
    '.dddd..dddd.', '............', '............', '............',
  ],
};
const ARMOR_COLORS = {
  iron: { m: '#d8d8d8', d: '#9a9a9a' },
  diamond: { m: '#4adfd9', d: '#2fb3ae' },
  gold: { m: '#f2cf5a', d: '#bd9430' },
};

// --- durability (Minecraft values): tools wear out, then break -------------
export const DURABILITY = {};
{
  const toolMax = { wood: 59, stone: 131, iron: 250, diamond: 1561, gold: 32 };
  const mats = ['wood', 'stone', 'iron', 'diamond', 'gold'];
  for (const ids of Object.values(TOOL_IDS)) ids.forEach((id, i) => { DURABILITY[id] = toolMax[mats[i]]; });
  const armorMax = { iron: [165, 240, 225, 195], diamond: [363, 528, 495, 429], gold: [77, 112, 105, 91] };
  const armorIds = {
    iron: [I.IRON_HELMET, I.IRON_CHEST, I.IRON_LEGS, I.IRON_BOOTS],
    diamond: [I.DIAMOND_HELMET, I.DIAMOND_CHEST, I.DIAMOND_LEGS, I.DIAMOND_BOOTS],
    gold: [I.GOLD_HELMET, I.GOLD_CHEST, I.GOLD_LEGS, I.GOLD_BOOTS],
  };
  for (const [m, ids] of Object.entries(armorIds)) ids.forEach((id, i) => { DURABILITY[id] = armorMax[m][i]; });
  DURABILITY[I.BOW] = 384;
}
export const maxDamage = (id) => DURABILITY[id] || 0;

// display-name -> id for /give and /setblock ("diamond_pickaxe" style)
// instant structures: used from the hotbar, a whole build appears (see structures.js)
ITEMS[I.STRUCT_HOUSE] = mat('Дом (постройка)', 'structure', { struct: 'house' });
ITEMS[I.STRUCT_CASTLE] = mat('Замок (постройка)', 'structure', { struct: 'castle' });
ITEMS[I.STRUCT_WELL] = mat('Колодец (постройка)', 'structure', { struct: 'well' });
ITEMS[I.STRUCT_PORTAL] = mat('Портал в ад (постройка)', 'structure', { struct: 'portal' });
ITEMS[I.STRUCT_VILLA] = mat('Вилла (постройка)', 'structure', { struct: 'villa' });
ITEMS[I.STRUCT_CITY] = mat('Город (постройка)', 'structure', { struct: 'city' });

export const NAME_TO_ID = new Map();
{
  for (const [idStr, it] of Object.entries(ITEMS)) {
    if (!it || !it.name) continue;
    const key = it.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (!NAME_TO_ID.has(key)) NAME_TO_ID.set(key, +idStr);
  }
}

ITEM_STENCILS[I.STRUCT_HOUSE] = {
  rows: [
    '.....rr.....', '....rrrr....', '...rrrrrr...', '..rrrrrrrr..',
    '.rrrrrrrrrr.', '............', '..bbbbbbbb..', '..bbybbbbb..',
    '..bbybbbbb..', '..bbbbbddb..', '..bbbbbddb..', '............',
  ],
  pal: { r: '#b33a2b', b: '#8a5d2e', y: '#f2d35c', d: '#4a2f16' },
};
ITEM_STENCILS[I.STRUCT_CASTLE] = {
  rows: [
    'gg..gggg..gg', 'gg..gggg..gg', 'gggggggggggg', 'gglggggglggg',
    'gggggggggggg', 'gggggggggggg', 'gggggggggggg', 'gggggddggggg',
    'gggggddggggg', 'gggggddggggg', '............', '............',
  ],
  pal: { g: '#8d8d96', l: '#3a3a44', d: '#5a3a1e' },
};
ITEM_STENCILS[I.STRUCT_WELL] = {
  rows: [
    '...rrrrrr...', '..rrrrrrrr..', '..w......w..', '..w......w..',
    '..gggggggg..', '..gbbbbbbg..', '..gbbbbbbg..', '..gggggggg..',
    '............', '............', '............', '............',
  ],
  pal: { r: '#a33f2c', w: '#6b4a26', g: '#7a7a7a', b: '#2f6fd6' },
};
ITEM_STENCILS[I.STRUCT_PORTAL] = {
  rows: [
    '..oooooooo..', '..opppppo...', '..oplpppo...', '..oplpppo...',
    '..opppppo...', '..opplppo...', '..opppppo...', '..oooooooo..',
    '............', '............', '............', '............',
  ],
  pal: { o: '#1a1a22', p: '#7a2fd6', l: '#c9a0ff' },
};
ITEM_STENCILS[I.STRUCT_VILLA] = {
  rows: [
    '............', '..wwwwwwww..', '..wwwwwwww..', '..wccccccw..',
    '..wclccclw..', '..wccccccw..', '..wwwwwwww..', '..wwddddww..',
    '..wwddddww..', '............', '............', '............',
  ],
  pal: { w: '#e8e4da', c: '#4fc3e8', l: '#b8f0ff', d: '#3a5a8c' },
};
// /give aliases (Russian names don't survive the latin key normalization)
NAME_TO_ID.set('house', I.STRUCT_HOUSE);
NAME_TO_ID.set('castle', I.STRUCT_CASTLE);
NAME_TO_ID.set('well', I.STRUCT_WELL);
NAME_TO_ID.set('portal', I.STRUCT_PORTAL);
ITEM_STENCILS[I.STRUCT_CITY] = {
  rows: [
    '...bb...gg..', '...bb...gg..', '...bbybggww.', '...bbybggww.',
    '...bbybggww.', '...bbybggww.', '...bbybggww.', '...bbbbgggg.',
    '............', '............', '............', '............',
  ],
  pal: { b: '#4f8fd6', y: '#f2d35c', g: '#9aa0a8', w: '#e8f2ff' },
};
NAME_TO_ID.set('villa', I.STRUCT_VILLA);
NAME_TO_ID.set('city', I.STRUCT_CITY);

const iconCache = new Map();
let atlasRef = null;

export function initItemIcons(atlasCanvas) { atlasRef = atlasCanvas; }

function drawStencil(ctx, rows, pal) {
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      ctx.fillStyle = pal[ch] || '#f0f';
      ctx.fillRect(x + 2, y + 2, 1, 1);
    }
  }
}

// 16x16 icon canvas for any item id.
export function itemIcon(id) {
  if (iconCache.has(id)) return iconCache.get(id);
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d');
  const it = ITEMS[id];
  if (it && it.kind === 'block' && atlasRef) {
    const blk = BLOCKS[id];
    const tile = blk.icon ?? blk.side; // slabs/stairs/fences have dedicated icon tiles
    const col = tile % ATLAS_COLS, row = (tile / ATLAS_COLS) | 0;
    ctx.drawImage(atlasRef, col * 16, row * 16, 16, 16, 0, 0, 16, 16);
  } else if (it && it.kind === 'tool') {
    const m = MATS[it.matKey];
    drawStencil(ctx, TOOL_STENCILS[it.toolType], { m: m.m, d: m.d, h: '#8a5d2e', g: '#5a5a5a' });
  } else if (it && it.kind === 'armor') {
    drawStencil(ctx, ARMOR_STENCILS[it.slot], ARMOR_COLORS[it.matKey]);
  } else if (ITEM_STENCILS[id]) {
    drawStencil(ctx, ITEM_STENCILS[id].rows, ITEM_STENCILS[id].pal);
  }
  iconCache.set(id, c);
  return c;
}
