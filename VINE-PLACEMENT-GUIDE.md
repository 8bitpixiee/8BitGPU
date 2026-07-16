# 8BitGPU Vine Placement Guide

Every vine uses the same little positioning system:

```text
top:    bigger number = moves DOWN
left:   bigger number = moves RIGHT
right:  bigger number = moves LEFT
width / height: bigger number = larger vine
negative number: moves the vine partially OFFSCREEN
```

## Main desktop (`style.css`)

```css
.vine-left  { top: -20px; left: -58px; height: min(74vh, 660px); }
.vine-right { top: -16px; right: -28px; height: min(70vh, 650px); }
.vine-top   { top: -30px; left: 31%; width: min(32vw, 460px); }
```

Quick moves:

```css
/* smaller top vine */
width: min(25vw, 360px);

/* push a side vine farther outside the screen */
left: -90px;

/* bring a side vine more into the screen */
right: -5px;
```

## Avatar Lab (`avatar-studio.css`)

```css
.lab-vine-left  { top: 52px; left: -42px; height: 76%; }
.lab-vine-right { top: 58px; right: -92px; height: 58%; }
.lab-vine-top   { top: 45px; left: 18px; width: 20%; }
```

Rule of thumb: vines should frame the outside edges and peek into blank space. If a vine lands across a title, tab, button, or character face, move it outward with a more negative `left` or `right` value first.
