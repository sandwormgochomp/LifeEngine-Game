// Computed-style dump, used by scripts/css-style-diff.sh to prove a CSS
// refactor changed nothing. Skipped during a normal run: it produces a file
// rather than asserting, and only means something when diffed against the same
// dump taken from another revision.
//
// It exists because the visual snapshots cannot catch a cascade regression --
// they allow a 5% pixel diff, and a modal silently losing 140px of width sits
// under that. See the Group 1b notes in TODO.md.
const fs = require('fs');
const { test, openEditor, openPanel } = require('./helpers/fixtures');

// Keyed by structural DOM path, because CSS-module class names are content
// hashes and differ between any two revisions.
const PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'width', 'height',
  'padding', 'margin', 'gap', 'flexDirection', 'alignItems', 'justifyContent',
  'gridTemplateColumns', 'color', 'backgroundColor', 'borderStyle', 'borderWidth',
  'borderColor', 'boxShadow', 'fontFamily', 'fontSize', 'fontWeight',
  'letterSpacing', 'lineHeight', 'textAlign', 'textShadow', 'opacity', 'zIndex',
  'whiteSpace', 'overflow', 'transform', 'visibility', 'minWidth', 'maxWidth',
  'boxSizing', 'cursor', 'userSelect', 'flexGrow', 'flexBasis',
];

async function dump(page, label) {
  return await page.evaluate(({ PROPS, label }) => {
    const path = (el) => {
      const parts = [];
      for (let e = el; e && e.tagName !== 'HTML'; e = e.parentElement) {
        const i = e.parentElement ? [...e.parentElement.children].indexOf(e) : 0;
        parts.unshift(`${e.tagName}[${i}]`);
      }
      return parts.join('/');
    };
    const out = {};
    for (const el of document.querySelectorAll('*')) {
      if (!el.className || typeof el.className !== 'string') continue;
      const s = getComputedStyle(el);
      const rec = {};
      for (const p of PROPS) rec[p] = s[p];
      out[`${label}|${path(el)}`] = rec;
    }
    return out;
  }, { PROPS, label });
}

test('dump computed styles across UI states', async ({ page }) => {
  test.skip(!process.env.DUMP_OUT, 'set DUMP_OUT to capture; see scripts/css-style-diff.sh');

  await page.evaluate(() => window.engine.stop());
  // Animations and transitions must be off or the dump is not reproducible:
  // the playback buttons pulse, so their colours differ between two runs of the
  // *same* build. This also flattens animation-name, whose hash always differs.
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });

  let all = {};
  const add = async (l) => { all = { ...all, ...(await dump(page, l)) }; };

  await add('dashboard');

  await openEditor(page);
  await page.waitForTimeout(300);
  await add('editor-dock');
  await openEditor(page);

  for (const panel of ['stats', 'save', 'rules']) {
    await openPanel(page, panel);
    await page.waitForTimeout(300);
    await add(`panel-${panel}`);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);
  }

  fs.writeFileSync(process.env.DUMP_OUT, JSON.stringify(all, null, 1));
  console.log('elements captured:', Object.keys(all).length);
});
