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

  function buildSlides() {
    const newSlides = [];

    // Calendar slide
    newSlides.push({
      type: 'calendar',
      url: config.calendarEmbedUrl,
    });

    // Note slides
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
    slides = buildSlides();

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const el = document.createElement('div');
      el.className = 'slide';

      if (slide.type === 'calendar') {
        el.classList.add('slide-calendar');
        const isPlaceholder = !slide.url || slide.url.includes('YOUR_ID');
        if (isPlaceholder) {
          const err = document.createElement('div');
          err.className = 'calendar-error';
          err.innerHTML =
            '<div class="calendar-error-icon">&#128197;</div>' +
            '<div class="calendar-error-title">Google Calendar not configured</div>' +
            '<div class="calendar-error-body">Open the management UI and set your Google Calendar embed URL in the Config section.</div>';
          el.appendChild(err);
        } else {
          const iframe = document.createElement('iframe');
          iframe.src = slide.url;
          iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
          el.appendChild(iframe);
        }
      } else {
        el.classList.add('slide-note');
        const rotation = (Math.random() * 2 - 1).toFixed(2);
        const card = document.createElement('div');
        card.className = 'note-card';
        card.style.transform = `rotate(${rotation}deg)`;

        const title = document.createElement('div');
        title.className = 'note-title';
        title.textContent = slide.title;

        const body = document.createElement('div');
        body.className = 'note-body';
        body.textContent = slide.body;

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
})();
