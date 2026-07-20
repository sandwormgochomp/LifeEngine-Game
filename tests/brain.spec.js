const { test, expect, openEditor, loadPreset, pauseEngine } = require('./helpers/fixtures');

const brainState = (page, index = 0) => page.evaluate(i => {
  const s = window.engine.organism_editor.organism.brain.states[i];
  return s && JSON.parse(JSON.stringify(s));
}, index);

test.describe('Brain editor', () => {
  test.beforeEach(async ({ page }) => {
    await pauseEngine(page);
    await openEditor(page);
    // Hunter has a mover and eyes, so its brain actually runs
    await loadPreset(page, 'hunter');
    await page.locator('#open-brain').click();
    await expect(page.getByTestId('brain-modal')).toBeVisible();
  });

  test('Weights and actions write through to the brain', async ({ page }) => {
    await page.locator('#weight-food').fill('7');
    await page.locator('#weight-killer').fill('-9');
    await page.locator('#action-food').selectOption('hibernate');

    const state = await brainState(page);
    expect(state.decisions.food).toBe(7);
    expect(state.decisions.killer).toBe(-9);
    expect(state.actions.food).toBe('hibernate');

    // Clearing the action removes it rather than storing an empty string
    await page.locator('#action-food').selectOption('');
    expect((await brainState(page)).actions.food).toBeUndefined();
  });

  test('States can be added, renamed and deleted', async ({ page }) => {
    await expect(page.locator('.brain-state-tab')).toHaveCount(1);

    await page.locator('#add-brain-state').click();
    await expect(page.locator('.brain-state-tab')).toHaveCount(2);

    await page.locator('#brain-state-name').fill('Fleeing');
    expect((await brainState(page, 1)).name).toBe('Fleeing');

    await page.locator('#delete-brain-state').click();
    await expect(page.locator('.brain-state-tab')).toHaveCount(1);
  });

  test('The last state cannot be deleted', async ({ page }) => {
    await page.locator('#delete-brain-state').click();
    await expect(page.getByTestId('hud-notifications')).toContainText('at least one state');
    await expect(page.locator('.brain-state-tab')).toHaveCount(1);
  });

  test('Transitions are added with a target state', async ({ page }) => {
    await page.locator('#add-brain-state').click();
    await page.locator('.brain-state-tab').first().click();
    await page.locator('#add-brain-transition').click();

    const state = await brainState(page, 0);
    expect(state.transitions).toHaveLength(1);
    expect(state.transitions[0].condition_type).toBe('Health');

    // Deleting the target state drops transitions pointing at it
    await page.locator('.brain-state-tab').nth(1).click();
    await page.locator('#delete-brain-state').click();
    expect((await brainState(page, 0)).transitions).toHaveLength(1);
  });

  test('Brain edits survive a save/load round trip and are undoable', async ({ page }) => {
    await page.locator('#weight-mouth').fill('5');

    const roundTripped = await page.evaluate(() => {
      const editor = window.engine.organism_editor;
      const raw = JSON.parse(JSON.stringify(editor.organism.serialize()));
      editor.loadRawOrg(raw);
      window.engine.emitChange(true); // the app emits after loading, so the UI re-reads
      return editor.organism.brain.states[0].decisions.mouth;
    });
    expect(roundTripped).toBe(5);

    // Each brain edit is one step on the editor's undo history
    await page.locator('#weight-mouth').fill('-3');
    expect((await brainState(page)).decisions.mouth).toBe(-3);
    await page.keyboard.press('Control+z');
    expect((await brainState(page)).decisions.mouth).toBe(5);
  });

  test('Warns when the organism has no mover or eye', async ({ page }) => {
    await page.getByTestId('brain-modal').press('Escape');
    await page.locator('#clear-editor').click();
    await page.locator('#open-brain').click();
    await expect(page.locator('#brain-warning')).toBeVisible();
  });
});
