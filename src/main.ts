// Starts the calculator in the element marked data-compare-heaters, so the
// same bundle runs as the full page or as an embed on another site. One per
// page: its inputs live in the page's query string.
import { mount } from './page/app.ts';

// The rate snapshot sits next to the bundle: this file is at src/ in
// development and assets/ once built, so ../rates/ works in both.
const ratesUrl = new URL(/* @vite-ignore */ '../rates/', import.meta.url);

const element = document.querySelector<HTMLElement>('[data-compare-heaters]');
if (element) mount(element, { ratesUrl });
