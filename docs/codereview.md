                                                                                                                                                    
  Code Review: Paper Peloton                                                                                                                                           
                                                                                                                                                                       
  Overall Assessment                                                                                                                                                   
                                                                                                                                                                       
  The architecture is clean and the non-scene code (physics, course, FIT, services) is excellent — pure, testable, and well-scoped. The issues are concentrated in the
  two large scenes. Here are the findings, roughly by severity.

  ---
  Critical / Correctness Bugs

  1. onResize finds a Text object by searching the entire scene graph for its content (GameScene.ts:324)

  this.children.list.forEach(child => {
    if (child instanceof Phaser.GameObjects.Text && child.text === 'ELEV') {
      child.setPosition(ELEV_PAD_X, height - 120);
    }
  });

  This is fragile and slow. If you ever add another text that says "ELEV" it breaks silently. Store a reference to that label: private elevLabel!:
  Phaser.GameObjects.Text; and assign it in buildElevationGraph().

  2. Type-safety hole in init() (GameScene.ts:411)

  this.lastSentSurface  = '' as any;

  lastSentSurface is typed SurfaceType. The right fix is to type it SurfaceType | null (or a sentinel value like 'none' added to the union), and narrow appropriately
  when reading it.

  3. "TRAINER REQUIRED" state checked by reading button text (MenuScene.ts:833)

  runBtn.on('pointerover', () => {
    if (runTxt.text !== 'TRAINER REQUIRED') runBtn.setFillStyle(0xcc8800);
  });

  Button behavioral state is being stored in the display string. If the label ever changes this silently breaks hover behavior. Use a private isTrainerWarning = false
  flag instead.

  ---
  Phaser Best Practices

  4. drawElevationGraph runs fully every frame — most of it doesn't need to (GameScene.ts:1121)

  The surface-colored polygon fill doesn't change while riding. Only the position marker and text labels do. Right now, every frame:
  - Filters ~100 elevation samples × N segments
  - Rebuilds polygon point arrays
  - Redraws all fill paths

  Extract the static part (surface polygons + outline) into a RenderTexture drawn once in buildElevationGraph(). Keep only the marker, progress fill, and labels as the
   per-frame draw. This is the single most impactful performance change available.

  5. drawCyclist makes ~20 Graphics draw calls every frame (GameScene.ts:832)

  The Graphics API is immediate-mode — every lineTo, strokePath, fillCircle call is work for the GPU. Two alternatives, in order of effort:
  - Lower effort: Draw the cyclist to a RenderTexture once per "pose bucket" (e.g., 16 crank positions) and just swap between them each frame.
  - Current approach is fine for now — the cyclist is small and the draw calls are simple. Just worth knowing this is the ceiling on cyclist complexity.

  6. Keyboard listener is registered inside buildWeightSection() (MenuScene.ts:434)

  The handler responds to both weight AND distance input. Its placement inside a method named "build weight section" is misleading and makes it easy to accidentally
  register the handler twice if buildWeightSection is ever refactored. Move it to a dedicated setupKeyboardInput() method called once in create().

  7. shutdown() is missing from MenuScene and MapScene

  GameScene correctly removes its resize listener in shutdown(). The other two scenes add this.scale.on('resize', ...) but never call this.scale.off(...).
  Scale.Manager is game-level — its listeners aren't automatically cleaned up when a scene stops. Add shutdown() to both:

  shutdown(): void {
    this.scale.off('resize', this.onResize, this);
  }

  8. update() uses Date.now() for the FIT recording timer instead of the Phaser clock (GameScene.ts:574)

  const nowMs = Date.now();
  if (nowMs - this.lastRecordMs >= 1000) {

  The time parameter passed to update(time, delta) is the game clock, which pauses when the game is backgrounded and doesn't drift across frames like Date.now() can.
  For the interval check, prefer time. (For FIT file timestamps themselves, Date.now() is correct since they're wall-clock.)

  9. Magic depth numbers scattered across GameScene

  Depths of 10, 11, 12, 15, 16, 20, 50, 51, 100, 101 appear in isolation. A simple constants block at the top would make layering auditable:

  const DEPTH = {
    HUD_BG: 10, HUD_CONTENT: 11, HUD_LABELS: 12,
    EFFECT_BTN: 15, EFFECT_LABEL: 16, NOTIF: 20,
    OVERLAY: 50, OVERLAY_CONTENT: 51,
    BLOCKING: 100,
  } as const;

  10. Manual hex color string building (GameScene.ts:1234)

  const hex = '#' + col.toString(16).padStart(6, '0');

  Phaser exposes Phaser.Display.Color.IntegerToColor(col).rgba and Phaser.Display.Color.RGBToString(r, g, b). Not a major issue, but the manual approach can silently
  produce incorrect strings for colors < 0x100000 (they'd be under 6 digits without the padStart).

  ---
  Architecture / Scene Size

  11. GameScene (~1750 lines) is doing too many things

  The scene currently owns: parallax drawing, cyclist IK animation, HUD, elevation graph, bottom controls, effect system, physics integration, FIT recording, and the
  ride-end overlay. These are seven distinct subsystems.

  The Phaser recommendation is not to split these into separate Scene classes (that would complicate data sharing and the render loop) but to extract them into plain
  TypeScript helper classes that the scene owns and delegates to:

  src/scenes/game/
    GameScene.ts           (< 400 lines: lifecycle, update loop, wires subsystems together)
    ParallaxBackground.ts  (buildParallaxLayers, drawMountains, etc.)
    CyclistRenderer.ts     (buildCyclist, drawCyclist, computeKnee)
    GameHUD.ts             (buildHUD, updateHUDColumn, updateGradeDisplay)
    ElevationGraph.ts      (buildElevationGraph, drawElevationGraph)
    EffectSystem.ts        (buildEffectUI, buildManualEffectButtons, triggerEffect, etc.)
    RideEndOverlay.ts      (showRideEndOverlay, downloadFit)

  Each class would receive scene: Phaser.Scene in its constructor and call scene.add.* / scene.tweens.* etc. This is the standard "composition object" pattern for
  large Phaser scenes. The scene's create() becomes a wiring method, and update() just calls subsystem.update(time, delta) on the ones that need it.

  12. MenuScene (~1038 lines) has a similar problem, though less severe

  The keyboard input handler, form field state machines (cursor blinking, commit/cancel logic), and all the section builders could be extracted. At minimum, the two
  input fields (distance, weight) are nearly identical and could share a TextInputField helper class.

  ---
  Minor / Polish

  13. cadenceHistory grows unboundedly between handleData trim (5s) and update filter (3s)

  // handleData: trims to 5s
  this.cadenceHistory = this.cadenceHistory.filter((h) => h.timeMs > cutoff); // cutoff = now - 5000

  // update: reads only 3s window
  const recent = this.cadenceHistory.filter((h) => now - h.timeMs <= 3000);

  Entries between 3–5 seconds old are kept in the array but never used for the animation. Tighten the trim to 3s in handleData — the array and the filter call both
  shrink.

  14. buildWeightSection registers the global pointerdown handler (MenuScene.ts:428)

  This means clicking anywhere on the menu commits an active input field, but the binding is invisible unless you read buildWeightSection. Make this
  this.input.on('pointerdown', ...) call explicit in create() with a named method this.onGlobalClick.

  15. Console logs left in production paths (GameScene.ts:381, 504, MenuScene.ts:839, 886)

  console.log('[GameScene] init data:', data) etc. These are fine in DEV but ideally guard them with if (import.meta.env.DEV) or remove them. At minimum,
  console.warn('[GameScene] No trainer connected...') at line 534 will appear in user consoles in production.

  ---
  What's Already Good

  - The ITrainerService abstraction is excellent — hot-swapping mock vs. BT is clean.
  - CyclistPhysics.ts and CourseProfile.ts are pure-functional and testable. No Phaser coupling.
  - FitWriter.ts is a dependency-free binary encoder — well-isolated.
  - RunStateManager singleton is simple and appropriate for this scope.
  - The parallax texture generation pattern (Graphics → generateTexture → TileSprite → destroy Graphics) is exactly the right approach for procedurally generated
  scrolling backgrounds in Phaser.
  - Resize handling exists at all — many Phaser projects don't bother. The onResize + initial call pattern is correct.
  - The shutdown() in GameScene with explicit service disconnection is correct.

  ---
  Priority order if you want to action these:
  1. Store the ELEV label reference (bug fix, 2 minutes)
  2. Fix shutdown() in MenuScene and MapScene (correctness, 5 minutes)
  3. Fix lastSentSurface type (type safety, 5 minutes)
  4. Move keyboard handler to create() (clarity, 10 minutes)
  5. Add DEPTH constants object (readability, 15 minutes)
  6. Extract the elevation graph static rendering to a RenderTexture (performance, 1 hour)
  7. Extract GameScene subsystems into helper classes (maintainability, 2–4 hours)