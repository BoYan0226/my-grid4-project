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
  const y = -state.blockHeight - mod(virtualScroll * WALL_SCROLL_SPEED, state.blockHeight);

  gsap.set(state.gridWrap, {
    y,
    xPercent: -20,
    rotationY: 30,
    transformOrigin: '0% 50%',
    transformStyle: 'preserve-3d',
    force3D: true,
    willChange: 'transform',
  });

  // 不用 item.getBoundingClientRect() 算位置。
  // 因为它会读到上一帧 3D 旋转后的尺寸，容易造成下端回缩/抖动。
  const gridRect = state.grid.getBoundingClientRect();
  const baseTop = gridRect.top + state.gridWrap.offsetTop + y;

  state.items.forEach((item) => {
    const centerY = baseTop + item.offsetTop + item.offsetHeight / 2;
    const distance = (centerY - window.innerHeight / 2) / (window.innerHeight / 2);
    const limited = clamp(distance, -1, 1);

    const depth = 60 + (1 - Math.abs(limited)) * 150;

    // 中间最清楚，顶端/底端稍微透明。
    const opacity = clamp(
      CENTER_OPACITY - Math.abs(limited) * (CENTER_OPACITY - EDGE_OPACITY),
      EDGE_OPACITY,
      CENTER_OPACITY,
    );

    // 越靠近屏幕中间、越往前的图片层级越高，减少 3D 排序错误导致的局部消失。
    const visualPriority = Math.round(depth * 10);

    gsap.set(item, {
      rotationX: limited * 30,
      z: depth,
      zIndex: visualPriority,
      opacity,
      filter: 'none',
      overflow: 'visible',
      clipPath: 'none',
      transformOrigin: '50% 50%',
      transformStyle: 'preserve-3d',
      backfaceVisibility: 'visible',
      force3D: true,
      willChange: 'transform, opacity',
    });

    const inner = item.querySelector('.grid__item-inner');

    if (inner) {
      gsap.set(inner, {
        backfaceVisibility: 'visible',
        transformStyle: 'preserve-3d',
        force3D: true,
        willChange: 'transform',
        borderRadius: 'inherit',
        z: 1,
      });
    }
  });
};

const tick = (time) => {
  const deltaTime = lastFrameTime ? (time - lastFrameTime) / 1000 : 0;
  lastFrameTime = time;

  // 鼠标滚轮松开后，继续补一点惯性滚动。
  if (Math.abs(wheelVelocity) > WHEEL_MIN_SPEED) {
    window.scrollBy(0, wheelVelocity);
    wheelVelocity *= WHEEL_FRICTION;
  } else {
    wheelVelocity = 0;

    // 惯性结束，并且没有处于滚轮暂停期时，恢复自动滚动。
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

// 不拦截滚轮，滚轮本身还是正常控制页面。
window.addEventListener('wheel', pauseAutoScrollByWheel, { passive: true });

window.addEventListener('resize', refreshGridSizes);

preloadImages('.grid__item-inner').then(() => {
  refreshGridSizes();
  jumpToMiddle();
  document.body.classList.remove('loading');
  requestAnimationFrame(tick);
});