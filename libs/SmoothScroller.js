// class SmoothScroller {
//   constructor(options) {
//     this.options = options || {};
//     this.sectionSelector = this.options.sectionSelector || 'section';
//     this.pageLoader = this.options.pageLoader;
//     this.sections = document.querySelectorAll(this.sectionSelector);
//     this.lenis = null;
//     this.totalHeight = 0;

//     this.init();
//   }

//   init() {
//     this.lenis = new Lenis({
//       smooth: true,
//       lerp: 0.5,
//       wheelMultiplier: 1.2,
//     });

//     this.lenis.on('scroll', this.onScroll.bind(this));

//     this.calculateTotalHeight();
//     this.onScroll({ scroll: 0 }); // Initial call to load content
//     this.raf();
//   }

//   calculateTotalHeight() {
//     // Each section is 100vh. The total scrollable height is the number of sections times the viewport height.
//     this.totalHeight = this.sections.length * window.innerHeight;
//     document.body.style.height = `${this.totalHeight}px`;
//   }

//   onScroll({ scroll }) {
//     const pageHeight = window.innerHeight;
//     const sectionIndex = Math.min(Math.floor(scroll / pageHeight), this.sections.length - 1);

//     if (this.pageLoader) {
//       // this.pageLoader.goToPage(sectionIndex);
//     }
//   }

//   raf(time) {
//     this.lenis.raf(time);
//     requestAnimationFrame(this.raf.bind(this));
//   }
// }
// // Remove the auto-initiation, as it's now handled in viewer.ejs
// // document.addEventListener('DOMContentLoaded', () => {
// //   window.addEventListener('sectionsloadedcomplete', () => {
// //        new SmoothScroller();
// //   });
// // });
// export default SmoothScroller;