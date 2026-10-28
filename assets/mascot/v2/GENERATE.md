# Images to generate for Kept

The current small Kip faces are crops of the full-body renders (192 px cut out of 768 px), so they go soft when shown big, and the same eight faces appear everywhere. This list replaces them with real close-up renders and adds a pose per feature, so no screen has to borrow another screen's Kip.

## How to generate (same for every image)

- **Reference image:** attach `assets/mascot/poses/happy.png` (and the closest existing pose) every time, so it's the same seal.
- **Size:** 1024 x 1024, PNG.
- **Background:** transparent if the tool can do it. Otherwise plain white (#FFFFFF) with nothing else in the frame.
- **Framing:** subject centred with about 12% empty margin on every side. Nothing may touch the edge.
- **Style block** (paste at the end of every prompt):

  > Same character as the reference: a young harbor seal mascot named Kip, soft light-grey fur with darker grey spots, big glossy dark eyes, small whiskers, cream belly. Stylized 3D render, Pixar-like realism, soft subsurface fur, same proportions as the reference. Seal anatomy: exactly two front flippers, the rear flippers joined at the tail; no legs, no hands, no fingers. Soft studio light from the top left, gentle fill from the right, soft contact shadow under the body. Camera at the seal's eye height. Clean, no text, no logos, no props unless described.

- **Where to put them:** `assets/mascot/v2/`, with exactly the file names below. Claude converts them to webp and wires them in.

## 1. Close-up faces (12)

These replace every small round Kip: the nav button, Kip's speech bubbles, the tour, tiles and lists. For each one, add this framing line to the prompt: *"Close-up portrait: head and top of the chest only, face fills about 60% of the frame, eyes in the upper third, looking at the camera."*

| File | Expression to describe in the prompt | Used for |
| --- | --- | --- |
| `face-happy.png` | warm closed-mouth smile, eyes open and bright | default, home |
| `face-laugh.png` | big open-mouth laugh, eyes squeezed into happy arcs | celebrations |
| `face-hi.png` | friendly smile, one front flipper raised beside the face in a little wave | welcome, Goals hover |
| `face-point.png` | eyebrows up, eyes looking to the right, one flipper pointing right at shoulder height | tips, Profile hover |
| `face-think.png` | looking up and to the side, one flipper on the chin, mouth pursed | plan checks, Activity hover |
| `face-sleep.png` | eyes closed, peaceful, head tilted, tiny smile | sleeping wishes, paused goals |
| `face-sad.png` | gentle, sympathetic sad look, brows tilted, no tears | failed sync, missed things |
| `face-curious.png` | head tilted about 15 degrees, ears forward, slightly open mouth | idle, empty states |
| `face-hungry.png` | mouth wide open like waiting to catch a fish, eyes excited | being dragged onto a goal (Feed Kip) |
| `face-proud.png` | chin up, eyes closed, smug little smile | streak milestones |
| `face-wink.png` | one eye winking, cheeky half smile | small tips and Easter eggs |
| `face-surprised.png` | eyes wide, mouth a small "o" | a big saving or goal reached |

## 2. Full-body poses for each feature (8)

| File | Prompt (then the style block) | Used for |
| --- | --- | --- |
| `pose-feed.png` | Kip lying on his belly, head up, mouth open, catching a shiny gold coin that is falling into his mouth. | Feed Kip (drag onto a goal) |
| `pose-ice-floe.png` | Kip lying relaxed on a small floating ice floe, eyes half closed, a flipper hanging over the edge, a little water around the floe. | ice floe days (rest days) |
| `pose-sleep-on-it.png` | Kip asleep curled up, hugging a small paper shopping bag with a blank price tag. | Sleep on it, while waiting |
| `pose-awake-asking.png` | Kip just woke up, rubbing one eye with a flipper, holding the blank price tag up with the other, curious look. | Sleep on it, when he asks |
| `pose-campfire.png` | Kip sitting upright warming both front flippers over a small campfire, happy cosy face (the fire is part of the image). | streak moment |
| `pose-goal-reached.png` | Kip hugging a big gold coin as large as his body, eyes closed, very happy. | goal reached |
| `pose-guide.png` | Kip holding a small rolled paper map in one flipper and pointing ahead with the other, friendly look. | the tour |
| `pose-peek.png` | Kip peeking in from the bottom edge of the frame, only head and front flippers visible, curious. | empty states |

## 3. Goal objects in the same 3D style (6)

These replace the line icons next to goals. Same lighting and camera as Kip, so they look like objects from his world. Prompt: *"A single [object], stylized 3D render in the same style, materials and lighting as the reference character, soft contact shadow, centred, three-quarter view, slightly toy-like proportions."* Leave Kip out of these.

| File | Object | Goal type |
| --- | --- | --- |
| `obj-laptop.png` | an open laptop with a couple of round stickers on the lid | tech |
| `obj-suitcase.png` | a small travel suitcase with a plane ticket tucked into the strap | travel / Erasmus |
| `obj-buoy.png` | a red and white life buoy | emergency fund |
| `obj-jar.png` | a glass savings jar with a few coins and a paper label | custom goal |
| `obj-phone.png` | a modern smartphone, screen dark, slight reflection | extra goal type |
| `obj-headphones.png` | over-ear headphones | extra goal type |

## Checks before you send them

- Same seal in every image: fur colour, spot pattern, eye size and head shape all match the reference. If one looks like a different seal, redo it.
- Two front flippers only, no legs or hands.
- Nothing cut off at the edges. No text or watermark.
- Faces: the eyes should be sharp when the image is zoomed to 100%.
