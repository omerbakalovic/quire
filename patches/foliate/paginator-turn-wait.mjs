/**
 * Applied by scripts/bundle-reader.mjs to the pinned paginator.js at bundle time.
 * The vendored file stays the pinned bytes.
 *
 * #turnPage holds its lock for a fixed 100 ms after every turn when the
 * `animated` attribute is off. Nothing waits on that time: the scroll is set
 * synchronously and #afterScroll has already run. The phone run measured the
 * move itself at 0-16 ms, so the 100 ms was most of every turn. The lock is
 * kept, so a burst of taps still cannot stack turns, but it is released after
 * the next animation frame, once the new page has been painted.
 */
export default {
  file: "paginator.js",
  find: "        if (shouldGo || !this.hasAttribute('animated')) await wait(100)\n",
  replace:
    "        if (shouldGo || !this.hasAttribute('animated')) await new Promise(resolve => requestAnimationFrame(() => resolve()))\n",
};
