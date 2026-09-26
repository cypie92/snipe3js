// Tiny event hub so audio / FX / the level can hook character moments without touching this folder.
//   onCharacterEvent('react', (ch, hit) => audio.sfx('hey', { position: ch.root.getWorldPosition(v) }));
// Events: 'react' (ch, hit), 'celebrate' (ch), 'tell' (ch, iconType), 'action' (ch, name, opts) (a dog's
//         'bark', a seal's 'clap'... arrive as actions), 'stealChip' (gull, person), 'squawk' (flock bird).
const handlers = new Map();

export function onCharacterEvent(name, fn) {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name).add(fn);
  return () => handlers.get(name)?.delete(fn);
}

export function offCharacterEvent(name, fn) { handlers.get(name)?.delete(fn); }

export function emitCharacterEvent(name, ...args) {
  const set = handlers.get(name);
  if (!set) return;
  for (const fn of set) {
    try { fn(...args); } catch (e) { console.error(`[characters] ${name} handler failed`, e); }
  }
}
