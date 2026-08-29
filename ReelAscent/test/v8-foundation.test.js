import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CLIMBING_CONFIG } from '../src/config.js';
import { ALL_FISH_SPECIES, FISH_SPECIES, canonicalSpeciesId, createFishSpecimenForCategories } from '../src/fishing/fish-data.js';
import { generateRhythmPattern } from '../src/fishing/rhythm-session.js';
import { MultiplayerClient, MULTIPLAYER_STATES } from '../src/multiplayer/multiplayer-client.js';
import { MESSAGE_TYPES } from '../src/multiplayer/protocol.js';
import { REMOTE_PLAYER_COLORS } from '../src/multiplayer/player-colors.js';
import { RoomState } from '../src/multiplayer/room-state.js';
import { MockTransport } from '../src/multiplayer/transport.js';
import { SaveSystem } from '../src/persistence/save-system.js';
import { serializeProgress, validateProgressImport } from '../src/progression/progress-transfer.js';

test('v8 active roster stays 280/70 with stable catalog and legacy identity resolution', () => {
  assert.equal(FISH_SPECIES.length, 280);
  for (const [rarity, prefix] of [['Common', 'C'], ['Uncommon', 'U'], ['Rare', 'R'], ['Legendary', 'L']]) {
    const page = FISH_SPECIES.filter((fish) => fish.rarity === rarity);
    assert.equal(page.length, 70);
    assert.deepEqual(page.map((fish) => fish.name), [...page].map((fish) => fish.name).sort((a, b) => a.localeCompare(b)));
    assert.equal(page[0].catalogId, `${prefix}001`);
    assert.equal(page.at(-1).catalogId, `${prefix}070`);
  }
  assert.equal(ALL_FISH_SPECIES.filter((fish) => fish.retired).length, 10);
  assert.equal(canonicalSpeciesId('bluewater-bonnet-shark'), 'bonnethead_shark');
  assert.equal(ALL_FISH_SPECIES.find((fish) => fish.id === 'windscale-bream').retired, true);
  for (const name of ['Great Barracuda', 'Polar Bear', 'Saltwater Crocodile', 'American Alligator', 'Hippopotamus', 'Yellowfin Tuna', 'Swordfish', 'Sailfish', 'Giant Caribbean Anemone', 'Staghorn Coral']) {
    assert.ok(FISH_SPECIES.some((fish) => fish.name === name), `${name} is active`);
  }
});

test('rarity profiles produce longer and more complex high-rarity songs with v7.4 tempo', () => {
  const byRarity = Object.fromEntries(['Common', 'Uncommon', 'Rare', 'Legendary'].map((rarity) => {
    const fish = createFishSpecimenForCategories(FISH_SPECIES.find((entry) => entry.rarity === rarity), 2, 2, false, () => .5);
    return [rarity, generateRhythmPattern(fish, () => .5)];
  }));
  assert.ok(byRarity.Uncommon.notes.length > byRarity.Common.notes.length);
  assert.ok(byRarity.Rare.notes.length > byRarity.Uncommon.notes.length);
  assert.ok(byRarity.Legendary.notes.length > byRarity.Rare.notes.length);
  for (const [rarity, pattern] of Object.entries(byRarity)) {
    const fish = FISH_SPECIES.find((entry) => entry.rarity === rarity);
    const baseline = (fish.rhythm.bpm[0] + fish.rhythm.bpm[1]) * .5 + 20;
    assert.ok(Math.abs(pattern.bpm - baseline) <= 2);
    assert.ok(Math.max(...pattern.notes.map((note) => pattern.notes.filter((other) => other.hitTime === note.hitTime).length)) <= 3);
  }
  assert.ok(byRarity.Legendary.notes.some((note) => note.duration > 0));
});

test('audio starts only after async preparation and real caves use holes plus interior shells', async () => {
  const [fishing, mountain, player] = await Promise.all([
    readFile(new URL('../src/fishing/fishing.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/player/player.js', import.meta.url), 'utf8')
  ]);
  assert.match(fishing, /await context\.resume\?\.\(\)/);
  assert.match(fishing, /this\.audio\.prepareForRhythm[\s\S]*?\.then\(\(readiness\)/);
  assert.match(fishing, /performance\.now\(\) \/ 1000 \+ Math\.max\(\.02, readiness\.leadSeconds/);
  assert.match(mountain, /isCaveEntranceSurfacePoint/);
  assert.match(mountain, /visibleTriangles = triangles\.filter/);
  assert.match(mountain, /buildCaveInteriorShell/);
  assert.match(mountain, /interior roof/);
  assert.match(mountain, /seabedVertices\.slice\(TERRAIN_SEGMENTS\)/);
  assert.match(player, /if \(this\.tryAirborneTopOut\(dt, hasMoveInput\)\) return;[\s\S]{0,220}if \(this\.contactMotionLocked\)/);
  assert.ok(CLIMBING_CONFIG.mantleDuration >= .35 && CLIMBING_CONFIG.mantleDuration <= .55);
});

test('portable progress round-trips UUID ownership and rejects malformed money', () => {
  const storage = { value: null, getItem() { return this.value; }, setItem(key, value) { this.value = value; } };
  const save = new SaveSystem(storage);
  save.data.progression.money = 725;
  const text = serializeProgress(save.getSnapshot());
  const imported = validateProgressImport(text);
  assert.match(imported.summary.playerId, /^player-[0-9a-f-]{36}$/);
  assert.equal(imported.summary.money, 725);
  const malformed = JSON.parse(text);
  malformed.progression.economy.money = Number.NaN;
  assert.throws(() => validateProgressImport(malformed), /Money must be/);
});

test('portable progress UI downloads JSON, imports explicitly, and backs up before replacement', async () => {
  const [html, inventory] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/inventory.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /data-progress-action="download">DOWNLOAD PROGRESS/);
  assert.match(html, /data-progress-action="import">IMPORT PROGRESS/);
  assert.match(inventory, /new Blob\(\[text\], \{ type: 'application\/json;charset=utf-8' \}\)/);
  assert.match(inventory, /reel-ascent-backup-before-import/);
});

test('multiplayer foundation is optional and transports no rhythm-input message type', async () => {
  assert.deepEqual(MULTIPLAYER_STATES, ['disconnected', 'connecting', 'connected', 'joining', 'in_room', 'reconnecting', 'error']);
  assert.equal(Object.values(MESSAGE_TYPES).some((type) => /rhythm|note|input/.test(type)), false);
  const transport = new MockTransport();
  const client = new MultiplayerClient('player-test', { endpoint: 'mock://local', transport });
  assert.equal(await client.host(), true);
  assert.equal(client.state, 'joining');
  assert.equal(transport.messages.at(-1).type, MESSAGE_TYPES.HOST_ROOM);
  client.destroy();
});

test('multiplayer is a direct M modal while Inventory and hidden debug bindings remain separate', async () => {
  const [html, menuSource, movementSource] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/multiplayer-menu.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/player/movement.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /<kbd>I<\/kbd> Inventory/);
  assert.match(html, /<kbd>M<\/kbd> Multiplayer/);
  assert.doesNotMatch(html, /id="open-multiplayer"/);
  assert.match(menuSource, /event\.code === 'KeyM'[\s\S]{0,220}this\.toggle\(\)/);
  assert.match(menuSource, /event\.code === 'Escape'[\s\S]{0,180}this\.close\(\)/);
  assert.doesNotMatch(movementSource, /event\.code === 'KeyM'[\s\S]{0,120}debugFishQueued/);
  assert.match(movementSource, /event\.code === 'F10'[\s\S]{0,120}debugFishQueued = 'hard'/);
});

test('remote room colors stay distinct and catch presentation start/end reaches the avatar', () => {
  const localPlayerId = 'player-0';
  const room = new RoomState(localPlayerId);
  const representations = new Map();
  const players = Array.from({ length: REMOTE_PLAYER_COLORS.length }, (_, index) => ({ id: `player-${index}` }));
  room.applyRoomState({ players }, (playerId, colorIndex) => {
    const representation = {
      colorIndex,
      catches: [],
      cleared: [],
      showCatch(value) { this.catches.push(value); },
      clearCatch(value) { this.cleared.push(value); },
      destroy() {}
    };
    representations.set(playerId, representation);
    return representation;
  });
  assert.equal(new Set([...room.roster.values()].map((player) => player.colorIndex)).size, players.length);
  const originalColors = new Map([...room.roster].map(([id, player]) => [id, player.colorIndex]));
  room.applyRoomState({ players: [...players].reverse() }, () => { throw new Error('existing remote should be reused'); });
  assert.deepEqual(new Map([...room.roster].map(([id, player]) => [id, player.colorIndex])), originalColors);

  const payload = { playerId: 'player-1', speciesId: 'bluegill', presentationId: 'catch-1', active: true };
  assert.equal(room.consumeCatchEvent(payload), true);
  assert.equal(representations.get('player-1').catches[0], payload);
  assert.equal(room.consumeCatchEvent({ ...payload, active: false }), true);
  assert.equal(representations.get('player-1').cleared[0], 'catch-1');
  room.clear();
});

test('remote catch event remains protocol v1 and carries additive presentation lifecycle fields', () => {
  const transport = new MockTransport();
  transport.open = true;
  const client = new MultiplayerClient('local-player', { endpoint: 'mock://local', transport });
  client.state = 'in_room';
  assert.equal(client.sendCatchEvent({
    speciesId: 'bluegill', name: 'Bluegill', length: 9.2, weight: .7,
    shiny: true, presentationId: 'bluegill:123', active: true
  }), true);
  const event = transport.messages.at(-1);
  assert.equal(event.protocolVersion, 1);
  assert.equal(event.type, MESSAGE_TYPES.CATCH_EVENT);
  assert.equal(event.payload.presentationId, 'bluegill:123');
  assert.equal(event.payload.active, true);
  client.destroy();
});

test('rhythm visual endpoint shares the receptor center without changing judgment windows', async () => {
  const [styles, rhythm] = await Promise.all([
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/fishing/rhythm-session.js', import.meta.url), 'utf8')
  ]);
  assert.match(styles, /--rhythm-receptor-radius: calc\(var\(--rhythm-receptor-size\) \/ 2\)/);
  assert.match(styles, /bottom: calc\(var\(--rhythm-receptor-bottom\) \+ var\(--rhythm-receptor-radius\)\)/);
  assert.match(rhythm, /position = clamp\(\(note\.hitTime - this\.songTime\) \/ this\.pattern\.approachSeconds/);
  assert.match(rhythm, /this\.config\.perfectWindow \* this\.timingTolerance/);
});

test('normal solid rendered rocks infer a climb material from their exact collider path', async () => {
  const mountain = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.match(mountain, /options\.climbable !== false && options\.decorative !== true/);
  assert.match(mountain, /else climbMaterial = 'normal'/);
  assert.match(mountain, /registerClimbSurface\(entity, entity\.physicsCollider, climbMaterial\)/);
  assert.match(mountain, /invalid collider hull/);
});
