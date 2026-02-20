Refactor: Realistic Acceleration Model


  Goal: Replace the "Smoothing/LERP" velocity logic with a "Force-based" model
  where velocity is updated via v = v + a * dt.

  1. Update Imports in src/scenes/GameScene.ts
  Restore the calculateAcceleration function that was previously removed:


   1 import {
   2   calculateAcceleration, // Add this back
   3   powerToVelocityMs,
   4   // ... rest
   5 } from '../physics/CyclistPhysics';


  2. Update the update(time, delta) loop
  Locate the velocity calculation block (around line 308). Replace the
  targetVelocityMs and LERP logic with the following:


    1 // 1. Convert delta from ms to seconds
    2 const dt = delta / 1000;
    3
    4 // 2. Calculate instantaneous acceleration based on current power and velocit
    5 // latestPower is the smoothed/modified watts from the trainer
    6 const acceleration = calculateAcceleration(
    7   this.latestPower,
    8   this.smoothVelocityMs,
    9   this.physicsConfig
   10 );
   11
   12 // 3. Update velocity using: v_new = v_old + (a * dt)
   13 this.smoothVelocityMs += acceleration * dt;
   14
   15 // 4. Safety: prevent the bike from going backward due to resistance forces
   16 if (this.smoothVelocityMs < 0) {
   17   this.smoothVelocityMs = 0;
   18 }
   19
   20 // 5. Update distance as usual
   21 this.distanceM += this.smoothVelocityMs * dt;


  3. Why this is better for "Coasting":
   * Current Model: When power goes to 0, the steady-state target becomes 0, and
     the bike LERPs there at a fixed rate regardless of grade or wind.
   * New Model: When power is 0, calculateAcceleration will return a negative value
     based on Drag and Rolling Resistance. If you are on a Downhill, Gravity might
     balance these out, allowing the bike to maintain speed or even speed up while
     coasting—exactly like a real Peloton/bike.


  4. Cleanup
   * You can remove the LERP_FACTOR constant if it's no longer used.
   * You can remove targetVelocityMs from the class properties as the "target" is
     now implicitly defined by the balance of forces.