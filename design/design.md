# The Architect

*The Book of Servants · a design document*

[Play the prototype](../)

You are the Architect. Every flame on these roads is yours to set, every servant’s fate yours to decide, and of them you build a machine. Signals are **torchbearers**, monks who walk the roads between gates, each carrying a single torch: a *lit* torch is 1, a *dark* one is 0. A gate receives the torches that arrive and sends one onward, lit or dark, as its keeper judges.

- **Monks carry.** A monk never changes a torch on the road. He only walks, and what he carries is the signal.
- **Priests combine.** A priest receives the torches that reach him, weighs what they say together, and sends one on.
- **High priests negate.** A high priest overturns what reaches him. The greater high priests keep a priest at their side and overturn his verdict.

Each servant is known by what he does and what he wants of the torches that reach him, never by the cut of his robes.

> Monks carry, priests weigh, high priests overturn.

## Contents

1. [The Bearer](#the-bearer) · Monk
2. [NOT](#not) · High priest
3. [AND](#and) · Priest
4. [OR](#or) · Priest
5. [NAND](#nand) · High priest
6. [NOR](#nor) · High priest
7. [The Architect’s View](#the-architects-view) · The world

---

## The Bearer

*Monk · the signal*

- **Order:** Monk · carries
- **Torches:** One, lit (1) or dark (0), carried unchanged

### The rule

> What I am given, I carry. I do not kindle and I do not quench: the torch that reaches the next gate is the torch that left the last.

### Truth table

| In | Out |
|----|-----|
| 0 *dark* | 0 *dark* |
| 1 *lit* | 1 *lit* |

### Personality

Silent, obedient and without question. A bearer has no judgment of his own: he is the road’s memory of what the last gate decided. He never kindles or quenches a torch on the road; he carries what he is given to the next gate and kneels there until he is sent on. He keeps vigil in the queues, murmurs the hours under his breath, and never asks what the Architect is building.

### Look

Small and hooded, with short legs and a slow, bowed walk so a column reads at a glance. A rough dark habit, a rope girdle, bare feet grey with ash. Nothing about him draws the eye but his torch, which rides high on a long pole so its state shows from across the map: lit, it throws a warm halo; dark, it is a charred wick with a thread of smoke. The color of hood or stole (oxblood, deep blue, bone) tells one bearer from another.

---

## NOT

*High priest · a gate*

- **Order:** High priest · negates
- **Torches:** One in, one out

### The rule

> Bring me fire and I will put it out. Bring me ashes and I will kindle them. Nothing leaves my altar as it came: whatever you carry in, you carry the opposite out.

### Truth table

| In | Out |
|----|-----|
| 0 *dark* | 1 *lit* |
| 1 *lit* | 0 *dark* |

### Personality

Grave, unbending and wholly certain. He overturns whatever he is given. He answers no before the question is finished, and yes to any who come seeking no. He does not scheme and he does not relent, so the harshest judge in all the world is also the one most surely relied upon. The bearers bow lowest at his gate.

### Look

Tall and gaunt, in a black cope lined with rubric red, so that he seems dark from one side and burning from the other. A hollow face, ash on the brow, a long snuffer in one hand and a flint in the other: one to put out, one to kindle. Colors: black, rubric-red lining, tarnished gold.

---

## AND

*Priest · a gate*

- **Order:** Priest · combines
- **Torches:** Two in, one out

### The rule

> Only when every torch that comes before me is burning will I light the torch that leaves. One dark torch is a witness against, and I will heed it.

### Truth table

| In A | In B | Out |
|------|------|-----|
| 0 *dark* | 0 *dark* | 0 *dark* |
| 0 *dark* | 1 *lit* | 0 *dark* |
| 1 *lit* | 0 *dark* | 0 *dark* |
| 1 *lit* | 1 *lit* | 1 *lit* |

### Personality

Patient, exacting and slow to judge. He wants full consensus and will settle for nothing less: half a testimony does not move him, and a single dark torch is dissent enough to darken his verdict. He will not be hurried, and he weighs every torch twice before he gives it. Disputes with the priest of OR through every night vigil, and never yields.

### Look

Broad and solid, planted like a man who will not be moved. A heavy black chasuble, a shaven head, a stole of rubric red, and a pair of scales at his girdle that must hang level before he will speak. Colors: black, oxblood, tarnished gold.

---

## OR

*Priest · a gate*

- **Order:** Priest · combines
- **Torches:** Two in, one out

### The rule

> If but one of you comes before me burning, the torch that leaves shall burn. Only when every torch comes dark do I send darkness on.

### Truth table

| In A | In B | Out |
|------|------|-----|
| 0 *dark* | 0 *dark* | 0 *dark* |
| 0 *dark* | 1 *lit* | 1 *lit* |
| 1 *lit* | 0 *dark* | 1 *lit* |
| 1 *lit* | 1 *lit* | 1 *lit* |

### Personality

Merciful, quick to grant and slow to refuse. He needs only one voice: a single flame is reason enough for him to give light. He keeps the night office in a low chant and gives away his bread. Thinks the priest of AND hard of heart, and tells him so, gently.

### Look

Tall and spare, leaning a little forward as if listening for the one voice he needs. Ash-grey vestments, a deep-blue stole, and a small lamp at his girdle that he never lets go out. Colors: ash grey, deep blue, bone, candle yellow.

---

## NAND

*High priest · a gate*

- **Order:** High priest · negates, with the AND priest at his side
- **Torches:** Two in, one out

### The rule

> My priest asks for consensus as AND was taught to ask for it, and then I overturn his judgment. When every torch arrives lit, the torch that leaves is dark. Anything less leaves lit.

### Truth table

| In A | In B | Out |
|------|------|-----|
| 0 *dark* | 0 *dark* | 1 *lit* |
| 0 *dark* | 1 *lit* | 1 *lit* |
| 1 *lit* | 0 *dark* | 1 *lit* |
| 1 *lit* | 1 *lit* | 0 *dark* |

### Personality

Distrustful of consensus: when every torch agrees he suspects a false witness and overturns the verdict. In every other case he is lenient, almost merciful, so most torches leave his altar lit. He holds that his order alone could build the whole machine without any other gate, and, gravely, he is right.

### Look

Heavy and broad, in an oxblood cope over black, one hand raised as if to stay a verdict. The AND priest stands at his elbow with scales in hand, so the piece is a pair: the priest who weighs, half a step behind, and the high priest who overturns, in front. Colors: oxblood, tarnished gold, black.

---

## NOR

*High priest · a gate*

- **Order:** High priest · negates, with the OR priest at his side
- **Torches:** Two in, one out

### The rule

> My priest would give light if any torch were burning. I forbid it. The torch that leaves my altar shall burn only when every torch arrives dark.

### Truth table

| In A | In B | Out |
|------|------|-----|
| 0 *dark* | 0 *dark* | 1 *lit* |
| 0 *dark* | 1 *lit* | 0 *dark* |
| 1 *lit* | 0 *dark* | 0 *dark* |
| 1 *lit* | 1 *lit* | 0 *dark* |

### Personality

Cold, still and austere, a keeper of the long night. He trusts darkness and receives any flame as an offense, so he gives light only when all who come before him are dark. Like NAND he could build the whole machine with his order alone; unlike NAND, he would never say so aloud.

### Look

Tall and motionless, in a deep-blue cope with a collar of bone. The OR priest walks at his side carrying a lamp the high priest keeps dark. Colors: deep blue, bone, ash grey, one rubric-red stole.

---

## The Architect’s View

*The world · the machine, seen from above*

- **Hour:** Night, and only night
- **Gaze:** Fixed, from the south, 45° down
- **Light:** Cold moon, warm fire

### The gaze

You look down on your works from the south, at forty-five degrees, and your gaze does not turn. The road comes in at the top of the world and goes out at the bottom, and every servant on it walks beneath your eye.

### The diorama

The land is a dark toy laid out on a table, as in the remake of *Link’s Awakening*: chunky bevelled tiles set a little apart so the dark shows between them, soft rounded forms, and servants made as glossy painted pieces, like chessmen lifted from their box. The top and bottom of the view fall soft, as if seen too near, with tilt-shift blur.

### The night

But this toy has been left out after dark, in the gloom of *Twilight Princess*. The sky is a deep blue-black. A low mist lies over the grass, and the greens and earths are drained near to grey. The moon gives every edge a cold rim and warms nothing. The torches and fires are the only warm light in the world, and they bloom.

### The places

- **The road.** Packed earth, worn by bare feet, running from the top of the screen to the bottom.
- **The chapels.** Each gate is a small dark chapel or shrine beside the road, with one arch and one low lamp. Its priest stands at the door and receives the torches.
- **The beacon.** At the road’s end stands a stone tower with an iron bowl, the first lamp of the Architect’s machine. A lit torch that reaches it wakes it.

### Palette

The night:

- `#0a0f1d` Night sky
- `#8794a8` Mist
- `#bccce4` Moonlight
- `#3e4d3a` Moonlit grass
- `#806849` Packed earth
- `#565b64` Stone

The vestments:

- `#1a1410` Cope black
- `#68696d` Ash grey
- `#4a1414` Oxblood
- `#efe6cf` Bone
- `#3f454d` Iron
- `#1a3263` Deep blue
- `#6e130f` Rubric red
- `#7f5f1f` Tarnished gold

The fire:

- `#fff4b8` Flame core
- `#f5a623` Flame
- `#d4400f` Flame edge

---

*Working document · servants and the Architect’s view*
