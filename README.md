# Gasket's Pressure Kitchen

An arcade browser game: Gasket the robot rat chef keeps a glowing industrial pod under pressure
without blowing the valve.

## How to run it

Open `index.html` in a browser, or serve the folder and open the address it prints:

```bash
npx serve .
```

There is no build step and nothing to install: HTML, CSS and JavaScript, the pictures drawn on a
canvas, the sounds made with Web Audio, no external files.

## How to play

- The pod builds pressure on its own. The gauge shows it from 0 to 100 PSI, with a digital readout.
- Hold **Space**, or click (or touch) and hold anywhere in the room, to pull Gasket's lever: the valve
  opens and steam vents. Let go and the lever springs back.
- Keep the needle in the orange **65–85 PSI** zone. Every second there scores 10 points times the combo.
- **Combo**: 3, 6, 10 and 15 seconds in the zone without a break take it to ×2, ×3, ×4 and ×5. More
  than 0.4 s out of the zone drops it back to ×1.
- **Orders**: time in the zone cooks the order on the ticket: 8 s for the first, one more second for
  each next one, up to 14. A served order scores 150 points, 50 more for each order after the first,
  and the burner turns up.
- **Surges**: from the second order on, the burner flares every 7 to 14 s, for 2.5 to 3.5 s, at up to
  1.5 times its heat. The status bar and the wall beacons warn 1.5 s before: vent early.
- **Shift complete**: serve 8 orders to finish the shift. Then keep cooking into overtime, where the
  burner keeps climbing, or start a new shift.
- **Valve blowout**: at 100 PSI the valve blows and the game is over, with the final score and a
  **Play again** button (Space or Enter work too).
- **P** or **Esc** pauses, and the game pauses itself when its tab is hidden. **M** turns the sound
  on and off. The best score is kept in the browser's local storage.

## The pressure physics

The game steps 120 times a second, whatever the frame rate.

- The burner adds 6 PSI a second on the first order, 0.75 more for each order served, up to 16. It
  wobbles by ±12 %, climbs with the pressure (×0.85 at 0 PSI, ×1.15 at 100 PSI) and a surge multiplies
  it by up to 1.5.
- The valve lets out `0.24 × lever × pressure` PSI a second: like an orifice, it vents faster the more
  pressure is behind it. Early on, holding the lever easily beats the burner; in overtime it takes
  holding it most of the time.
- The lever follows a press with a time constant of 45 ms and springs back in 70 ms, so a tap trims a
  few PSI and a hold a lot more.
- The needle is a damped spring chasing the pressure, and it rattles above 85 PSI.

Every number is in `TUNING` at the top of [`src/sim.js`](src/sim.js).

## Choices where the brief was silent

- A title screen comes first, so the pressure starts rising when the player is ready. Space, Enter or
  a click starts the game at 45 PSI, about three seconds below the zone.
- The whole room is the lever's click target, not only its knob, so any click or touch pulls it.
- Phones held upright get a tall layout: the HUD on top, the gauge in the middle, the pod, the lever
  and Gasket below, filling the screen; the texts speak of touch instead of Space. Held sideways, or
  on a wider screen, the room is the wide stage, with bigger type when it is drawn small.
- Both ends of the zone count: 65 and 85 PSI are in it.
- Success and failure: in the zone the status bar, the gauge's band, the readout, the score and
  Gasket all show it; each served order is a small win with a bonus; eight orders end the shift on a
  screen of their own; 100 PSI ends the game.
- Gasket's speech bubble uses the pod's status words: NAPPING on the title screen, LET HIM COOK below
  the zone, HOLDING PRESSURE in it, HOLD MY HAT above it, IN ORBIT after a blowout.
- The pod is the Hotpod mark, the lid's stem and ball being the vent valve; the colours are warm only
  (`#0D0908` room, `#F3EEE9` text, `#F05A18` and `#FFB35C` heat), with no blue or purple anywhere.

## Code

| File | What it does |
| --- | --- |
| `index.html` | the page: the canvas, the HUD, the screens and their styles |
| `src/sim.js` | the rules: pressure, lever, zone, combo, orders, surges, blowout; no DOM, the same seed replays the same game |
| `src/art.js` | what the drawing shares: the two layouts (wide, tall), the palette, small canvas helpers |
| `src/room.js` | the room's still parts, painted once per size: wall, pipes, floor, the gauge's face, the lever's box |
| `src/gasket.js` | Gasket, the robot rat chef, in his seven moods, his arm reaching the lever |
| `src/render.js` | each frame: the needle, the pod, the flames, the lever, steam, sparks, popups and screen effects |
| `src/audio.js` | the sounds, made with Web Audio |
| `src/main.js` | input, the fixed-step loop, the screens and the HUD |
| `test/sim.test.js` | the rules, stepped in Node |

## Tests

```bash
npm test
```

runs the simulation's tests with Node's own test runner (Node 18 or later, no dependencies): the
pressure rising on its own, venting, the lever's response, points only in the zone, the combo,
orders, surges and their warning, the blowout, and a steady cook finishing the shift.
