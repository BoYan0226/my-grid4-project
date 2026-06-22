import { preloadImages } from './utils.js';

let lenis;

const initSmoothScrolling = () => {
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on('scroll', () => ScrollTrigger.update());

  const scrollFn = (time) => {
    lenis.raf(time);
    requestAnimationFrame(scrollFn);
  };

  requestAnimationFrame(scrollFn);
};

const grids = document.querySelectorAll('.grid');

const applyAnimation = (grid) => {
  const gridWrap = grid.querySelector('.grid-wrap');
  const gridItems = grid.querySelectorAll('.grid__item');

  const timeline = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: gridWrap,
      start: 'top bottom+=5%',
      end: 'bottom top-=5%',
      scrub: true
    }
  });

  grid.style.setProperty('--grid-width', '50%');
  grid.style.setProperty('--perspective', '3000px');
  grid.style.setProperty('--grid-item-ratio', '0.8');
  grid.style.setProperty('--grid-columns', '3');
  grid.style.setProperty('--grid-gap', '1vw');

  timeline
    .set(gridWrap,{transformOrigin:'0% 50%',rotationY:30,xPercent:-75})
    .set(gridItems,{transformOrigin:'50% 0%'})
    .to(gridItems,{duration:0.5,ease:'power2',z:500,stagger:0.04},0)
    .to(gridItems,{duration:0.5,ease:'power2.in',z:0,stagger:0.04},0.5)
    .fromTo(gridItems,
      {rotationX:-70,filter:'brightness(120%)'},
      {duration:1,rotationX:70,filter:'brightness(0%)',stagger:0.04},0);
};

grids.forEach(grid => applyAnimation(grid));

preloadImages('.grid__item-inner').then(() => {
  initSmoothScrolling();
  document.body.classList.remove('loading');
});
