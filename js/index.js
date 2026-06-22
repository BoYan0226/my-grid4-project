import { preloadImages } from './utils.js';

const grids = document.querySelectorAll('.grid');

// Real page scroll limits. The page is very tall, and when the scroll
// reaches either edge we silently move it back to the middle. The image
// wall uses virtualScroll, so this reset is visually seamless.
const RESET_SCROLL_Y = 6000;
const RESET_BUFFER = 1800;

const AUTO_SCROLL_SPEED = 70; // px / second. Raise this if you want faster auto scroll.
const WALL_SCROLL_SPEED = 0.72;

// 滚轮停止后多久允许自动滚动恢复，单位 ms
const WHEEL_PAUSE_TIME = 0;

// 滚轮惯性参数
const WHEEL_POWER = 0.18;
const WHEEL_FRICTION = 0.9;
const WHEEL_MIN_SPEED = 0.15;
const WHEEL_MAX_SPEED = 60;

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

  // 不阻止浏览器默认滚动，只额外给一点惯性
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

  gsap.set(gridWrap, {
    transformStyle: 'preserve-3d',
    force3D: true,
    willChange: 'transform',
  });

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

    state.blockHeight = Math.max(
      1,
      firstRepeatedItem ? firstRepeatedItem.offsetTop : state.gridWrap.scrollHeight / 3,
    );
  });
};

const renderGrid = (state) => {
  const y = -mod(virtualScroll * WALL_SCROLL_SPEED, state.blockHeight);

  gsap.set(state.gridWrap, {
    y,
    xPercent: -20,
    rotationY: 30,
    transformOrigin: '0% 50%',
    transformStyle: 'preserve-3d',
    force3D: true,
    willChange: 'transform',
  });

  state.items.forEach((item) => {
    const rect = item.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const distance = (centerY - window.innerHeight / 2) / (window.innerHeight / 2);
    const limited = clamp(distance, -1, 1);

    const depth = (1 - Math.abs(limited)) * 220;

    // 以前这里是 brightness，会在白色背景下变成黑色阴影
    // 现在改成 opacity：中间最清楚，顶端/底端变透明
    const opacity = clamp(
      CENTER_OPACITY - Math.abs(limited) * (CENTER_OPACITY - EDGE_OPACITY),
      EDGE_OPACITY,
      CENTER_OPACITY,
    );

    // 越靠近屏幕中间、越往前的图片层级越高，减少 3D 排序错误导致的局部消失
    const visualPriority = Math.round(depth * 10);

    gsap.set(item, {
      rotationX: limited * 30,
      z: depth,
      zIndex: visualPriority,
      opacity,
      filter: 'none',
      transformOrigin: '50% 50%',
      transformStyle: 'preserve-3d',
      backfaceVisibility: 'visible',
      force3D: true,
      willChange: 'transform, opacity',
    });

    const inner = item.querySelector('.grid__item-inner');

    if (inner) {
      gsap.set(inner, {
        backfaceVisibility: 'hidden',
        transformStyle: 'preserve-3d',
        force3D: true,
        willChange: 'transform',
        z: 1,
      });
    }
  });
};

const tick = (time) => {
  const deltaTime = lastFrameTime ? (time - lastFrameTime) / 1000 : 0;
  lastFrameTime = time;

  // 鼠标滚轮松开后，继续补一点惯性滚动
  if (Math.abs(wheelVelocity) > WHEEL_MIN_SPEED) {
    window.scrollBy(0, wheelVelocity);
    wheelVelocity *= WHEEL_FRICTION;
  } else {
    wheelVelocity = 0;

    // 惯性结束，并且没有处于滚轮暂停期时，才恢复自动滚动
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

// 不拦截滚轮，滚轮本身还是正常控制页面
window.addEventListener('wheel', pauseAutoScrollByWheel, { passive: true });

window.addEventListener('resize', refreshGridSizes);

preloadImages('.grid__item-inner').then(() => {
  refreshGridSizes();
  jumpToMiddle();
  document.body.classList.remove('loading');
  requestAnimationFrame(tick);
});