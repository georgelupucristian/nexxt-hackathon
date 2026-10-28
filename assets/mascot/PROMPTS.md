# Seal mascot: generation prompts

Settings for stills: Nano Banana 2.1 (edit), 1K, 1:1, PNG. Each still costs about 7 Weave credits.

## Step 0: fix the anatomy of the idle pose

The first idle pose (`source/idle-green.png`) has six limbs: two front flippers, two foot-like flippers under the belly, and the tail. Real seals have only two front flippers. Their two hind flippers sit together at the end of the tail. The reference photo has the same mistake, so every prompt below repeats the anatomy rule.

Input: `source/idle-green.png`. Save the result as `source/idle-green-v2.png`, and check it before generating the states.

```
Fix the anatomy to match a real seal. A seal has only two front flippers, and its two hind flippers sit together at the very end of its tail. Remove the two foot-like flippers under the belly (bottom left and bottom center), so the round belly rests directly on the ground. Keep the two front flippers at the sides of the body, and keep the tail with its hind flippers on the right. Keep everything else exactly identical: same face, eyes, whiskers, fur, spots, lighting, size and position. Background: perfectly flat uniform chroma-key green, nothing else in the image.
```

## States

The input image for every state is `source/idle-green-v2.png`, the fixed idle pose.

Every state prompt ends with this suffix, so the character, anatomy, framing and background stay identical across states:

> Keep it the exact same seal character (same face, fur, spots, whiskers, Pixar-style 3D render, same lighting). Real seal anatomy: only two front flippers, the two hind flippers together at the end of the tail, no legs or feet under the belly. Same camera angle, same framing and scale, whole body visible with margin. Background: perfectly flat uniform chroma-key green, no shadow, no other objects.

| state | prompt (before the suffix) |
|---|---|
| happy | Same seal, now very happy: eyes squeezed shut into joyful upward crescents, big open-mouth smile, both front flippers lifted slightly outward in delight, body bouncing a little. |
| celebrate | Same seal, celebrating: hopping joyfully a little above the ground, both front flippers raised high above its head, eyes happily closed, wide open-mouth smile. A few small shiny gold coins and tiny golden sparkles pop in the air around it. (Change the end of the suffix to "no other objects besides the coins and sparkles".) |
| wave | Same seal, waving hello: one front flipper raised high beside its head and waving, head tilted slightly, warm friendly smile, looking at the viewer. |
| think | Same seal, thinking: head tilted to one side, eyes looking up and to the side thoughtfully, one front flipper raised so its tip touches its chin, mouth closed in a small pensive line. |
| point | Same seal, pointing: body turned slightly toward the right side of the image, one front flipper extended straight out to the right, pointing at something off to the side, head turned the same way, friendly confident smile. |
| sleep | Same seal, peacefully asleep: lying down on its belly, chin resting on its front flippers, eyes gently closed, calm content expression, tail flippers relaxed. |
| sad | Same seal, mildly sad in a sympathetic, gentle way: inner eyebrows raised slightly, eyes a little droopy and glossy, small closed-mouth frown, shoulders slightly slumped, flippers hanging down. Not crying, still cute and soft. |

## Video clips

Model: Seedance V1.5 Pro (image-to-video), 720p, 1:1, 5 s, `camera_fixed: true`, audio off. About 31 credits per clip.
Use `source/idle-green-v2.png` as both the first frame AND the last frame, so the clip loops (idle) or returns to idle (celebrate) without a jump.

| clip | first + last frame | prompt |
|---|---|---|
| idle | `source/idle-green-v2.png` | The seal breathes slowly and gently, blinks once, its whiskers twitch slightly and its head bobs a little. Calm and friendly. Static camera, flat green background stays unchanged. |
| celebrate | `source/idle-green-v2.png` | The seal hops up joyfully with both front flippers raised high, a few gold coins and sparkles pop around it, then it lands softly with a little squash and settles back into the same calm pose. Static camera, flat green background stays unchanged. |

Save every result in `source/` (as `<state>-green.png` or `<clip>-green.mp4`). The keying script turns them into the transparent files in `public/mascot/`.
