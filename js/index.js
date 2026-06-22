import { preloadImages } from './utils.js';

const grids = document.querySelectorAll('.grid');

// Real page scroll limits. The page is very tall, and when the scroll
// reaches either edge we silently move it back to the middle. The image
// wall uses virtualScroll, so this reset is visually seamless.
const RESET_SCROLL_Y = 6000;
const RESET_BUFFER = 1800;
const AUTO_SCROLL_SPEED = 28; // px / second. Raise this if you want faster auto scroll.
const WALL_SCROLL_SPEED = 0.72;

let virtualScroll = 0;
let lastScrollY = 0;
let lastFrameTime = 0;
let autoRemainder = 0;
let isResettingScroll = false;

const mod = (value, size) => ((value % size) + size) % size;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const jumpToMiddle = () => {
  isResettingScroll = true;
  window.scrollTo(0, RESET_SCROLL_Y);
  lastScrollY = RESET_SCROLL_Y;
  requestAnimationFrame(() => {
    isResettingScroll = false;
  });
};

const handlePageScroll = () => {
  const currentY = window.scrollY || window.pageYOffset;

  if (!isResettingScroll) {
    const delta = currentY - lastScrollY;

    // Ignore extreme deltas caused by our own edge reset.
    if (Math.abs(delta) < 1200) {
      virtualScroll += delta;
    }
  }

  lastScrollY = currentY;

  const maxY = document.documentElement.scrollHeight - window.innerHeight;
  if (!isResettingScroll && (currentY < RESET_BUFFER || currentY > maxY - RESET_BUFFER)) {
    jumpToMiddle();
  }
};

const prepareGrid = (grid) => {
  const gridWrap = grid.querySelector('.grid-wrap');
  const originalItems = Array.from(gridWrap.querySelectorAll('.grid__item'));

  // Three identical sets make the vertical loop seamless.
  for (let copyIndex = 0; copyIndex < 2; copyIndex += 1) {
    originalItems.forEach((item) => {
      const clone = item.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      gridWrap.appendChild(clone);
    });
  }

  grid.style.setProperty('--grid-width', '52vw');
  grid.style.setProperty('--perspective', '3000px');
  grid.style.setProperty('--grid-item-ratio', '0.8');
  grid.style.setProperty('--grid-columns', '3');
  grid.style.setProperty('--grid-gap', '1vw');

  return {
    grid,
    gridWrap,
    items: Array.from(gridWrap.querySelectorAll('.grid__item')),
    originalCount: originalItems.length,
    blockHeight: 1,
  };
};

const gridStates = Array.from(grids).map(prepareGrid);

const refreshGridSizes = () => {
  gridStates.forEach((state) => {
    const firstRepeatedItem = state.items[state.originalCount];
    state.blockHeight = Math.max(1, firstRepeatedItem ? firstRepeatedItem.offsetTop : state.gridWrap.scrollHeight / 3);
  });
};

const renderGrid = (state) => {
  const y = -mod(virtualScroll * WALL_SCROLL_SPEED, state.blockHeight);

  gsap.set(state.gridWrap, {
    y,
    xPercent: -4,
    rotationY: 30,
    transformOrigin: '0% 50%',
  });

  state.items.forEach((item) => {
    const rect = item.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const distance = (centerY - window.innerHeight / 2) / (window.innerHeight / 2);
    const limited = clamp(distance, -1, 1);
    const depth = (1 - Math.abs(limited)) * 420;
    const brightness = clamp(120 - Math.abs(limited) * 85, 28, 120);

    gsap.set(item, {
      rotationX: limited * 70,
      z: depth,
      filter: `brightness(${brightness}%)`,
      transformOrigin: '50% 50%',
    });
  });
};

const tick = (time) => {
  const deltaTime = lastFrameTime ? (time - lastFrameTime) / 1000 : 0;
  lastFrameTime = time;

  autoRemainder += AUTO_SCROLL_SPEED * deltaTime;
  const wholePixels = Math.trunc(autoRemainder);

  if (wholePixels !== 0) {
    autoRemainder -= wholePixels;
    window.scrollBy(0, wholePixels);
  }

  gridStates.forEach(renderGrid);
  requestAnimationFrame(tick);
};

window.addEventListener('scroll', handlePageScroll, { passive: true });
window.addEventListener('resize', refreshGridSizes);

preloadImages('.grid__item-inner').then(() => {
  refreshGridSizes();
  jumpToMiddle();
  document.body.classList.remove('loading');
  requestAnimationFrame(tick);
});
