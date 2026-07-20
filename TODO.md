# Repo Tidy-Up TODO

Working branch: `update-interface`

Organism Lab
- [ ] Fix the "Bob" preset organism from freezing the game
- [ ] Add scroll to zoom in the organism lab
- [ ] Fix zoom buttons so they actually fit the interface and/or display pixel dimensions
- [ ] Experiment with ways to overlay this on the editor - make sure developer approves the design before implementing
- [ ] Save / Load / Presets selector - maybe a toolbar at the top? Experiment with this
- [ ] Cell scroll is small. Maybe these cells should be on the side of the menu. Give options and experiment
- [x] Add a little lab beaker svg icon beside the "Organism Lab" title. In fact, maybe the "Edit" button on the bottom bar should use a beaker icon too?

Top-right bar
- [ ] Fix speed adjustment interface - doesn't appear to function. Need to go lower and higher than 1x

Bottom bar
- [ ] Rename "Print" to "Save" and then actually implement it. Save also doesn't work in upper-lefthand corner

Stats window
- [ ] Replace the CanvasJS chart with something open source that can be themed
- [ ] Find a way to condense the information at the top, before the chart. Right now there's just a lot of margin. It's too much space for so little information

General
- [ ] Add hover text to explain the purpose of most buttons or information that is specific to game mechanics, or where the exact function could use detail
- [ ] Add basic click function hint in the game (middle click = pan, click = place [item] or select depending on mode, right click = ? if anything)
- [ ] Implement or remove the hamburger menu icon. Maybe remove the reset view icon too or make it restart? 
- [ ] The hud somehow turned out green and squarish instead of pixel-y like the concept art - fix the colors and style
- [ ] Day / Night indicator with hud hover that explains the effects of day and night
- [ ] Add a life form modal (opened by clicking "Lifeforms" at the top) where you see every life form and its design. Click to open in Organism Lab
- [ ] Display brush size so you can know what you are putting down or erasing
- [ ] Erase mode = erase cursor?
- [ ] Display preview of organism you are placing, so you can know exact placement and orientation for when you click

Icing on the cake
- [ ] Add some particle floaties, like you're actually looking at life forms under a microscope. No real gameplay change, but they maybe bump out of the way if you move your cursor over them or a lifeform hits them
- [ ] Make the life forms have a slight glow to them (maybe non-lifeforms don't have a glow, so it's easy to differentiate?)
- [ ] Make the world a circular petri dish (with some petri dish styling) instead of a rectangle
