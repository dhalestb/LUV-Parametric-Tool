const FORM = [
  'The inner contour is the cutter and opens through the clipped form, along the letter’s saved rotation.',
  'Platforms are 0.75 ft, with horizontal terraces and vertical exterior walls.',
  'Each letter imprints its contour on the finished surface.',
  'Neighboring letters intersect slightly, so bridges are not added.',
];

const AXIS = 'X tilt is measured from horizontal; Z turns the letter in plan.';

const ORIENTATION: { test: RegExp; lines: string[]; form?: string[] }[] = [
  {
    test: /topographic/i,
    lines: [
      'The letters form a 120° spiral around the vertical axis.',
      'Three letters lie on XY and form the floor plates. The others keep the spiral tilt and form walls.',
      'Each step rises as far as it moves in plan, inside a 1:1:1 field.',
    ],
  },
  {
    test: /vertical/i,
    lines: [
      'Order is L, then U, then V, at 140%, 100%, and 75%.',
      'Three letters lie on XY and form the floor plates. The others stand as walls.',
      'Letters stack on one vertical axis and intersect slightly.',
      'V walls tilt 45°–135° from horizontal.',
    ],
  },
  {
    test: /linear/i,
    lines: [
      'Order is L, then U, then V. Flat and upright letters alternate in 90° steps inside a 2:1:1 field.',
      'Upright letters except U stretch to the field height. Each upright U turns 180°, is 1 ft thick, and bows 4 ft in plan. Its arms are 2 ft tall around a curved opening that is 10 ft across the mouth.',
      'L keeps its length on X, scales up on Y to the field depth, and a flat L scales up on Z by the same amount. Every L sits on the bottom of the field.',
    ],
    form: [
      'Each letter adds a 0.75 ft plate, two stepped terraces, and a wall strip. Neighbors are joined by a hulled 0.75 ft terrace.',
      'The finished bar is 10% wider than the letters, with half of that extra width past each end. It is clipped to the field and is not stretched to fill the box.',
      'Each letter cuts its inner contour through the bar. Above the opening, flat pads are 0.75 ft thick and upright pads rise 5.4 ft higher, clipped to the ceiling. An upright U cuts its curved inner contour. The outside of the shell stays the boxes around the letters.',
      'No bridges are added.',
    ],
  },
  {
    test: /compressed/i,
    lines: [
      'L is at each end. U and V alternate through the middle.',
      'Letters roll on the YZ plane through the first half, at half the width and height of that face. From the middle they rotate down toward the XY plane, and the last letter lies on it. Every letter except the last one has the same height, and the largest U is half that size.',
      'The XY letter is half of the previous 80% size. The two center letters are 60%. The first two full letters turning down toward XY are half the height of the 80% size, at or below the letter beside them. Every letter is reduced by 75%, then scaled to 150% of that size.',
      'The shell stands at least 1 ft outside each letter, then the compressed space scales to the field box.',
    ],
    form: [
      'The shell wraps each letter, so the middle narrows and the ends stay open.',
      'The interior is that outline, set in by the wall.',
      'The letters sit in the center of the shell.',
      'Neighboring letters meet, so bridges are not added.',
    ],
  },
  {
    test: /continuous|hall/i,
    lines: [
      'One letter is the XY floor and one is the XY ceiling.',
      'The others are parallel to the short face and turn in 15° steps along the hall.',
      'The openings puncture the sides. Height to length is 1:2, in a 2:1:1 field.',
    ],
  },
];

export function lobbyExplanation(name: string) {
  const match = ORIENTATION.find(item => item.test.test(name));
  if (!match) return null;
  const form = match.form ?? FORM;
  return { orientation: match.lines, form, lines: [...match.lines, ...form, AXIS] };
}
