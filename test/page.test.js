// The page's wiring and palette, read from the files: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const sources = { 'index.html': html, ...Object.fromEntries(scripts.map((file) => [file, read(file)])) };

test('index.html loads every script it names, from the repository, in order', () => {
  assert.deepEqual(scripts, ['src/sim.js', 'src/art.js', 'src/room.js', 'src/gasket.js', 'src/render.js', 'src/audio.js', 'src/main.js']);
  for (const file of scripts) assert.ok(fs.existsSync(path.join(root, file)), `${file} is missing`);
  assert.doesNotMatch(html, /(src|href)="(https?:)?\/\//, 'no external files');
});

test('every element main.js looks up is in index.html', () => {
  const ids = [...read('src/main.js').matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 20);
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), `#${id} is not in index.html`);
});

test('the page has the canvas, the meter and a Play again button', () => {
  assert.match(html, /<canvas id="scene"/);
  assert.match(html, /role="meter"[^>]*aria-valuemax="100"/s);
  assert.match(html, />Play again<\/button>/);
});

test('the brief\'s colours are all used', () => {
  for (const colour of ['#0D0908', '#F3EEE9', '#F05A18', '#FFB35C']) {
    assert.match(html, new RegExp(colour, 'i'), `${colour} is not in index.html`);
  }
});

test('no colour anywhere is blue or purple', () => {
  for (const [file, text] of Object.entries(sources)) {
    for (const [literal, rgb] of colours(text)) {
      const { h, s, l } = hsl(rgb);
      const greyish = s < 0.15 || l < 0.06 || l > 0.97;
      assert.ok(greyish || h < 180 || h >= 330, `${file}: ${literal} has hue ${Math.round(h)}°`);
    }
  }
});

// Every colour literal in a source: #RGB, #RRGGBB, rgb()/rgba() and the 'r, g, b' strings the sprites take.
function colours(text) {
  const found = [];
  for (const m of text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    found.push([m[0], [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))]);
  }
  for (const m of text.matchAll(/(?:rgba?\(|')\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/g)) {
    found.push([m[0], [m[1], m[2], m[3]].map(Number)]);
  }
  return found;
}

function hsl([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}
