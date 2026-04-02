(function () {
  const container = document.getElementById('slide-container');

  let config, notes;
  try {
    config = window.kioskAPI ? window.kioskAPI.getConfig() : null;
    notes = window.kioskAPI ? window.kioskAPI.getNotes() : null;
    console.log('Loaded config:', JSON.stringify(config));
    console.log('Loaded notes:', JSON.stringify(notes));
  } catch (e) {
    console.error('Failed to load from kioskAPI:', e);
  }

  if (!config) config = { calendarIntervalSeconds: 30, noteIntervalSeconds: 10, calendarEmbedUrl: '', port: 3000 };
  if (!notes) notes = [];
  let slides = [];
  let currentIndex = -1;
  let rotationTimer = null;
  const port = config.port || 3000;

  // Measure how a note body splits across pages
  function splitNoteBody(bodyHTML, title) {
    // Calculate max body height from known card dimensions:
    // Card = 100vh, padding = 80px top + 80px bottom = 160px
    const cardInnerHeight = window.innerHeight - 160;

    // Create offscreen measurement area with the same width as note-card
    // but no height constraint so we can measure natural heights
    const measureWidth = window.innerWidth - 200;
    const measure = document.createElement('div');
    measure.style.cssText = 'position:absolute;top:0;left:-9999px;width:' + measureWidth + 'px;';

    // Measure title height
    const titleEl = document.createElement('div');
    titleEl.className = 'note-title';
    titleEl.innerHTML = title;
    measure.appendChild(titleEl);
    document.body.appendChild(measure);
    const titleHeight = titleEl.offsetHeight + 24; // 24px margin-bottom

    const maxBodyHeight = cardInnerHeight - titleHeight;

    // Measure full body
    const bodyEl = document.createElement('div');
    bodyEl.className = 'note-body';
    bodyEl.style.cssText = 'flex:none;overflow:visible;';
    bodyEl.innerHTML = bodyHTML;
    measure.appendChild(bodyEl);

    // If it fits in one page, no split needed
    if (bodyEl.offsetHeight <= maxBodyHeight) {
      document.body.removeChild(measure);
      return [bodyHTML];
    }

    // Split by walking through all top-level elements, and if a single
    // element is too tall, split its text content by words.
    const children = Array.from(bodyEl.childNodes).map(c => c.cloneNode(true));
    const pages = [];
    bodyEl.innerHTML = '';

    function isOnlyHeadings() {
      const nodes = Array.from(bodyEl.children);
      return nodes.length > 0 && nodes.every(n => /^H[1-6]$/.test(n.tagName));
    }

    function flushPage(force) {
      if (bodyEl.innerHTML.trim() && (force || !isOnlyHeadings())) {
        pages.push(bodyEl.innerHTML);
        bodyEl.innerHTML = '';
      }
    }

    // Split a single oversized element by words
    function splitOversizedElement(el) {
      // Get all text content, split by words
      const fullText = el.textContent;
      const words = fullText.split(/\s+/);
      if (words.length <= 1) {
        // Can't split further, just push it
        bodyEl.innerHTML = '';
        bodyEl.appendChild(el.cloneNode(true));
        flushPage();
        return;
      }

      // Binary-search-style: add words until overflow, then split
      const tag = el.cloneNode(true);
      // Preserve the element's inner structure — find the deepest text node
      function setText(node, text) {
        if (node.childNodes.length === 0) {
          node.textContent = text;
        } else {
          // Set text on all text-containing children proportionally
          // Simplified: just set the full text on the first text leaf
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          const firstText = walker.nextNode();
          if (firstText) {
            // Clear all text nodes first
            const allTexts = [];
            let tn = firstText;
            while (tn) { allTexts.push(tn); tn = walker.nextNode(); }
            allTexts.forEach((t, i) => { t.textContent = i === 0 ? text : ''; });
          }
        }
      }

      // prefixHTML is any content already in bodyEl (e.g. headings) to keep on the first chunk
      let wordIdx = 0;
      let isFirst = true;
      while (wordIdx < words.length) {
        const chunk = tag.cloneNode(true);
        // For the first chunk, account for prefix already in bodyEl
        const prefixBefore = isFirst ? bodyEl.innerHTML : '';

        let lo = wordIdx + 1;
        let hi = words.length;
        let fit = wordIdx;

        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          const testText = words.slice(wordIdx, mid).join(' ');
          setText(chunk, testText);
          bodyEl.innerHTML = prefixBefore;
          bodyEl.appendChild(chunk.cloneNode(true));
          if (bodyEl.offsetHeight <= maxBodyHeight) {
            fit = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }

        if (fit <= wordIdx) fit = wordIdx + 1;

        const pageText = words.slice(wordIdx, fit).join(' ');
        const pageEl = tag.cloneNode(true);
        setText(pageEl, pageText);
        bodyEl.innerHTML = prefixBefore;
        bodyEl.appendChild(pageEl);
        flushPage(true);
        isFirst = false;
        wordIdx = fit;
      }
    }

    for (let i = 0; i < children.length; i++) {
      bodyEl.appendChild(children[i]);
      if (bodyEl.offsetHeight > maxBodyHeight) {
        // Remove the overflowing child
        bodyEl.removeChild(children[i]);

        if (bodyEl.innerHTML.trim()) {
          // Flush current page — but not if it's only headings (keep them for next page)
          flushPage();
        }

        // Add the overflowing element to bodyEl (may still contain unflushed headings)
        bodyEl.appendChild(children[i]);

        // If it still overflows, split the element by words
        // bodyEl may contain heading prefix + oversized element
        if (bodyEl.offsetHeight > maxBodyHeight) {
          bodyEl.removeChild(children[i]);
          // bodyEl may still have heading prefix — splitOversizedElement will preserve it
          splitOversizedElement(children[i]);
        }
        // Otherwise it fits with any prefix, keep accumulating
      }
    }
    // Push remaining content
    flushPage(true);

    document.body.removeChild(measure);
    return pages.length ? pages : [bodyHTML];
  }

  function buildSlides() {
    const newSlides = [];

    // Calendar slide
    newSlides.push({
      type: 'calendar',
      url: config.calendarEmbedUrl,
    });

    // Note slides — will be split after measuring in renderSlides
    for (const note of notes) {
      newSlides.push({
        type: 'note',
        id: note.id,
        title: note.title,
        body: note.body,
      });
    }

    return newSlides;
  }

  function renderSlides() {
    container.innerHTML = '';
    const rawSlides = buildSlides();

    // Split long notes into multiple slides by measuring rendered height
    slides = [];
    for (const slide of rawSlides) {
      if (slide.type === 'note') {
        const pages = splitNoteBody(slide.body, slide.title);
        for (const pageHTML of pages) {
          slides.push({ ...slide, body: pageHTML });
        }
      } else {
        slides.push(slide);
      }
    }

    // Now render all slides (including split ones)
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const el = document.createElement('div');
      el.className = 'slide';

      if (slide.type === 'calendar') {
        el.classList.add('slide-calendar');
        const isPlaceholder = !slide.url || slide.url.includes('YOUR_ID');
        if (isPlaceholder) {
          const loading = document.createElement('div');
          loading.className = 'calendar-error';
          loading.innerHTML =
            '<div class="calendar-loading-spinner"></div>' +
            '<div class="calendar-error-title">Loading Calendar...</div>';
          el.appendChild(loading);
        } else {
          const webview = document.createElement('webview');
          webview.src = slide.url;
          webview.setAttribute('partition', 'persist:google');
          webview.setAttribute('allowpopups', '');
          webview.style.width = '100%';
          webview.style.height = '100%';
          el.appendChild(webview);
        }
      } else {
        el.classList.add('slide-note');
        const card = document.createElement('div');
        card.className = 'note-card';

        const title = document.createElement('div');
        title.className = 'note-title';
        title.innerHTML = slide.title;

        const body = document.createElement('div');
        body.className = 'note-body';
        body.innerHTML = slide.body;

        card.appendChild(title);
        card.appendChild(body);
        el.appendChild(card);
      }

      container.appendChild(el);
    }

    // If current index is out of bounds, reset
    if (currentIndex >= slides.length) {
      currentIndex = 0;
    }
  }

  function showSlide(index) {
    const allSlides = container.querySelectorAll('.slide');
    allSlides.forEach((s) => s.classList.remove('active'));
    if (allSlides[index]) {
      allSlides[index].classList.add('active');
    }
    currentIndex = index;
  }

  function getCurrentSlideDuration() {
    if (currentIndex >= 0 && currentIndex < slides.length && slides[currentIndex].type === 'calendar') {
      return (config.calendarIntervalSeconds || 30) * 1000;
    }
    return (config.noteIntervalSeconds || 10) * 1000;
  }

  function scheduleNext() {
    if (rotationTimer) clearTimeout(rotationTimer);
    rotationTimer = setTimeout(() => {
      const next = (currentIndex + 1) % slides.length;
      showSlide(next);
      scheduleNext();
    }, getCurrentSlideDuration());
  }

  // Poll for changes
  async function poll() {
    try {
      const [notesRes, configRes] = await Promise.all([
        fetch(`http://localhost:${port}/api/notes`),
        fetch(`http://localhost:${port}/api/config`),
      ]);
      const newNotes = await notesRes.json();
      const newConfig = await configRes.json();

      const notesChanged = JSON.stringify(newNotes) !== JSON.stringify(notes);
      const configChanged = JSON.stringify(newConfig) !== JSON.stringify(config);

      if (notesChanged) {
        notes = newNotes;
      }

      if (configChanged) {
        config = newConfig;
        scheduleNext();
      }

      if (notesChanged || configChanged) {
        renderSlides();
        // Show current slide after re-render
        if (currentIndex >= 0 && currentIndex < slides.length) {
          showSlide(currentIndex);
        } else {
          showSlide(0);
        }
      }
    } catch (e) {
      // Server not ready yet, ignore
    }
  }

  // Initial render
  renderSlides();
  showSlide(0);
  scheduleNext();

  // Poll every 10 seconds
  setInterval(poll, 10000);

  // Reload calendar webview after Google sign-in
  if (window.kioskAPI && window.kioskAPI.onReloadCalendar) {
    window.kioskAPI.onReloadCalendar(() => {
      const webview = document.querySelector('webview');
      if (webview) webview.reload();
    });
  }
})();
