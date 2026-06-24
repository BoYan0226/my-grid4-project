import { preloadImages } from './utils.js';

const grids = document.querySelectorAll('.grid');

// 页面滚动边界。页面很高，当滚动接近顶部或底部时，悄悄跳回中间。
// 图片墙使用 virtualScroll，所以这个重置看起来是连续的。
const RESET_SCROLL_Y = 6000;
const RESET_BUFFER = 1800;

const AUTO_SCROLL_SPEED = 70; // px / second. 数值越大，自动滚动越快。
const WALL_SCROLL_SPEED = 0.72;

// 滚轮惯性参数
const WHEEL_POWER = 0.18;
const WHEEL_FRICTION = 0.96;
const WHEEL_MIN_SPEED = 0.5;
const WHEEL_MAX_SPEED = 60;
const WHEEL_PAUSE_TIME = 0;

// 图片到顶端和底端时的透明度
const EDGE_OPACITY = 0.9;
const CENTER_OPACITY = 1;

let virtualScroll = 0;
let lastScrollY = 0;
let lastFrameTime = 0;
let autoRemainder = 0;
let isResettingScroll = false;

let isAutoPaused = false;
let wheelPauseTimer = null;
let wheelVelocity = 0;

const mod = (value, size) => ((value % size) + size) % size;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const pauseAutoScrollByWheel = (event) => {
  isAutoPaused = true;
  autoRemainder = 0;

  // 不阻止浏览器默认滚动，只额外加一点惯性。
  wheelVelocity += event.deltaY * WHEEL_POWER;
  wheelVelocity = clamp(wheelVelocity, -WHEEL_MAX_SPEED, WHEEL_MAX_SPEED);

  clearTimeout(wheelPauseTimer);

  wheelPauseTimer = setTimeout(() => {
    isAutoPaused = false;
  }, WHEEL_PAUSE_TIME);
};

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

    // 忽略由跳回中间造成的极大滚动差值。
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

  // 复制两份，形成三组相同图片，让纵向循环更连续。
  for (let copyIndex = 0; copyIndex < 2; copyIndex += 1) {
    originalItems.forEach((item) => {
      const clone = item.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      gridWrap.appendChild(clone);
    });
  }

  const items = Array.from(gridWrap.querySelectorAll('.grid__item'));

  const shells = items.map((item) => {
    const shell = document.createElement('div');
    shell.className = 'grid__item-shell';
    item.before(shell);
    shell.appendChild(item);
    return shell;
  });

  const innerItems = items.map((item) => item.querySelector('.grid__item-inner'));

  grid.style.setProperty('--grid-width', '52vw');
  grid.style.setProperty('--perspective', '3000px');
  grid.style.setProperty('--grid-item-ratio', '0.6667');
  grid.style.setProperty('--grid-columns', '3');
  grid.style.setProperty('--grid-gap', '1vw');

  gsap.set(gridWrap, {
    transformStyle: 'preserve-3d',
    force3D: true,
    willChange: 'transform',
  });

  // 固定样式只设置一次，不要每帧反复写。
  gsap.set(shells, {
    overflow: 'visible',
    clipPath: 'none',
    transformOrigin: '50% 50%',
    transformStyle: 'preserve-3d',
    backfaceVisibility: 'visible',
    force3D: true,
    willChange: 'transform, opacity',
  });

  return {
    grid,
    gridWrap,
    shells,
    innerItems,
    originalCount: originalItems.length,
    blockHeight: 1,
  };
};

const gridStates = Array.from(grids).map(prepareGrid);

const refreshGridSizes = () => {
  gridStates.forEach((state) => {
    const firstRepeatedItem = state.shells[state.originalCount];

    state.blockHeight = Math.max(
      1,
      firstRepeatedItem ? firstRepeatedItem.offsetTop : state.gridWrap.scrollHeight / 3,
    );
  });
};

const renderGrid = (state) => {
  const TOP_SAFE_OFFSET = 100;
  const y = TOP_SAFE_OFFSET - state.blockHeight - mod(virtualScroll * WALL_SCROLL_SPEED, state.blockHeight);

  gsap.set(state.gridWrap, {
    y,
    xPercent: -20,
    rotationY: 30,
    transformOrigin: '0% 50%',
  });

  const gridRect = state.grid.getBoundingClientRect();
  const baseTop = gridRect.top + state.gridWrap.offsetTop + y;
  const viewportCenter = window.innerHeight / 2;

  state.shells.forEach((shell, index) => {
    const centerY = baseTop + shell.offsetTop + shell.offsetHeight / 2;
    const distance = (centerY - viewportCenter) / viewportCenter;
    const limited = clamp(distance, -1, 1);

    const depth = 10 + (1 - Math.abs(limited)) * 300;

    const opacity = clamp(
      CENTER_OPACITY - Math.abs(limited) * (CENTER_OPACITY - EDGE_OPACITY),
      EDGE_OPACITY,
      CENTER_OPACITY,
    );

    const column = index % 3;
    const columnPriority = 3 - column;
    const visualPriority = Math.round(depth * 100) + columnPriority;

    gsap.set(shell, {
      rotationX: limited * 30,
      z: depth + columnPriority * 0.001,
      zIndex: visualPriority,
      opacity: 1,
    });

    gsap.set(state.innerItems[index], {
      opacity,
    });
  });
};

const tick = (time) => {
  const deltaTime = lastFrameTime ? (time - lastFrameTime) / 1000 : 0;
  lastFrameTime = time;

  if (Math.abs(wheelVelocity) > WHEEL_MIN_SPEED) {
    window.scrollBy(0, wheelVelocity);
    wheelVelocity *= WHEEL_FRICTION;
  } else {
    wheelVelocity = 0;

    if (!isAutoPaused) {
      autoRemainder += AUTO_SCROLL_SPEED * deltaTime;
      const wholePixels = Math.trunc(autoRemainder);

      if (wholePixels !== 0) {
        autoRemainder -= wholePixels;
        window.scrollBy(0, wholePixels);
      }
    }
  }

  gridStates.forEach(renderGrid);
  requestAnimationFrame(tick);
};

window.addEventListener('scroll', handlePageScroll, { passive: true });
window.addEventListener('wheel', pauseAutoScrollByWheel, { passive: true });
window.addEventListener('resize', refreshGridSizes);

preloadImages('.grid__item-inner').then(() => {
  refreshGridSizes();
  jumpToMiddle();
  document.body.classList.remove('loading');
  requestAnimationFrame(tick);
});
