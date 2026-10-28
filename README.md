# nexxt-hackathon

Proiectul de hackathon: **Avansul**, aplicatie de economisire pentru tinerii din Romania (Gen Z) care strang pentru avansul la o casa.

## Structura

- `app/`, `components/`, `public/` - aplicatia Next.js. Deocamdata are doar pagina demo a mascotei.
- `assets/mascot/` - imaginile sursa ale mascotei (pe fundal verde) si prompturile cu care au fost generate.
- `scripts/process_mascot.py` - transforma imaginile sursa in fisierele din `public/mascot/`.
- `skills/` - toate skill-urile de agent (Claude Code, claude.ai, Codex, plugin-uri) intr-un singur folder. Vezi [skills/README.md](skills/README.md).

## Rulare

```bash
npm install
npm run dev
```

Demo-ul mascotei: http://localhost:3000/mascot-demo

## Mascota: foca

Imagini 3D generate cu AI (Nano Banana 2.1, pornind de la `assets/mascot/source/reference.png`), cate una pe stare. Componenta face crossfade intre ele si adauga miscare discreta din CSS.

```tsx
import { Seal } from "@/components/Seal";

<Seal state="idle" size={300} />
<Seal state="point" direction="left" size={120} />
<Seal state="celebrate" onCelebrateEnd={() => console.log("gata")} />
```

| prop | tip | implicit | |
|---|---|---|---|
| `state` | `SealState` | `"idle"` | vezi tabelul de mai jos |
| `size` | `number` | `120` | latura in px. Pana la 72px se afiseaza doar capul (avatar). |
| `direction` | `"left" \| "right"` | `"right"` | doar pentru `point` (oglindeste imaginea) |
| `reducedMotion` | `boolean` | `false` | forteaza pozele statice; `prefers-reduced-motion` din OS e respectat oricum |
| `onCelebrateEnd` | `() => void` | | apelat cand `celebrate` s-a terminat si foca e din nou in idle |
| `title` | `string` | `"Foca Avansul"` | eticheta accesibila; `""` = decorativa |
| `className` | `string` | | |

| stare | cand o folosim | miscare |
|---|---|---|
| `idle` | implicit | respiratie lenta |
| `happy` | actiune reusita | sare usor pe loc |
| `celebrate` | depunere lunara reusita, milestone atins | o singura saritura de ~1.2s cu monede, apoi revine singura in idle |
| `wave` | onboarding, salut | se leagana |
| `think` | se incarca, calculeaza | se apleaca + bula "..." |
| `point` | arata spre un element din UI | se impinge spre directie |
| `sleep` | nimic nu cere atentia userului | respiratie foarte lenta + "z" |
| `sad` | plata esuata (rar, bland) | respiratie lenta |

La saritura din `celebrate`, monedele ies cu ~6% peste marginea de sus a componentei, deci nu o pune intr-un container cu `overflow: hidden`.

### Fisiere

- `public/mascot/<stare>.webp` - corpul intreg, transparent, 768px.
- `public/mascot/<stare>-face.webp` - doar capul, 192px, pentru avatare.
- `public/mascot/icon-192.png`, `icon-512.png` - iconite app/PWA (capul pe fundal `#EAF4FF`).

### Inlocuirea unei poze

1. Pune noua imagine pe fundal verde plat in `assets/mascot/poses/` (`normal.png` = idle, restul cu numele starii).
2. Ruleaza `python3 scripts/process_mascot.py` (are nevoie de `pip install numpy scipy pillow`).
3. Daca s-a mutat capul in imagine, ajusteaza crop-ul fetei in `assets/mascot/face-crops.json` (`[x, y, latura]` pe canvas-ul de 768px).

### Culori

| | |
|---|---|
| fundal app (albastru deschis) | `#EAF4FF` |
| fundal app (menta) | `#E6FBF4` |
| gri text / pete | `#5E6A79` |
| umbra pe sol | `rgba(30, 40, 60, 0.15)` |
