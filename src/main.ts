// Starts the calculator in every element marked data-compare-heaters, so the
// same bundle runs as the full page or as an embed on another site.
import { mount } from './page/app.ts';

// The rate snapshot sits next to the bundle: this file is at src/ in
// development and assets/ once built, so ../rates/ works in both.
const ratesUrl = new URL(/* @vite-ignore */ '../rates/', import.meta.url);

for (const element of document.querySelectorAll<HTMLElement>('[data-compare-heaters]')) mount(element, { ratesUrl });
