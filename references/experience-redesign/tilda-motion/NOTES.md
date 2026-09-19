# Reference

Tilda animation references

## URL

- https://tilda.cc/ru/lp/step-by-step-animation/
- https://tilda.cc/ru/lp/trigger-animation/

## What is valuable

Tilda is valuable as a trigger and sequencing vocabulary. It breaks motion into practical event types: on hover, on click, on scroll, element on screen, opacity, transform, rotation, and stagger.

For Zamanushka, the value is not the look of Tilda pages. The value is a precise language for specifying when motion starts, what property changes, and how sequences chain.

## Specific screens / interactions inspected

- Step-by-step animation reference for chained movement.
- Trigger animation reference for hover/click/scroll/on-screen behaviors.

Screenshot capture was not available in this environment. No screenshot files were fabricated.

## Motion patterns

- Hover: small transform + opacity/lighting shift.
- Click: immediate feedback, then navigation sequence.
- Element on screen: reveal secondary UI after primary scene/object is visible.
- Stagger: reveal grouped elements in 30-80ms offsets.
- Rotation: useful for dice and small objects, dangerous for large panels.
- Object-to-object transition: a source object should visually become or lead to the destination.

## Layout patterns

- Motion works best when objects have clear start and end positions.
- Staggered UI should respect reading order.
- Scroll reveals are secondary; they should not carry core game state.

## Hover / touch patterns

- Hover should be mirrored by touch-down.
- Click/tap feedback should begin before route change.
- Long-running animations must be interruptible or skippable.

## What Zamanushka should borrow

- A shared trigger vocabulary for future implementation specs.
- Short hover and click timings.
- Staggered reveal for lobby seats and room rows.
- Element-on-screen reveal for secondary UI only.

## What Zamanushka must NOT copy

- Tilda layouts.
- Scroll-heavy storytelling for gameplay.
- Delayed access to critical actions.
- Non-interruptible motion chains.

## Technical observations

- Prefer transform and opacity for UI motion.
- Use CSS/JS tokens: micro, UI, navigation, spatial, cinematic.
- Reduced motion should replace spatial movement with opacity/state change.

## Relevance score

7/10

