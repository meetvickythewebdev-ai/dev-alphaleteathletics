/* vk-global.js — shared behaviour for vk- sections (tabs, carousels, reveal, overlay). */
(() => {
  if (window.vkGlobalLoaded) return;
  window.vkGlobalLoaded = true;

  /* Page overlay ----------------------------------------------------------- */
  const overlay = () => document.querySelector('[data-vk-overlay]');
  window.vkOverlay = {
    owner: null,
    show(owner, { zIndex } = {}) {
      const el = overlay();
      if (!el) return;
      this.owner = owner;
      el.style.zIndex = zIndex || '';
      el.classList.add('is-active');
    },
    hide(owner) {
      const el = overlay();
      if (!el || (owner && this.owner && owner !== this.owner)) return;
      this.owner = null;
      el.classList.remove('is-active');
    },
  };
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-vk-overlay]')) {
      document.dispatchEvent(new CustomEvent('vk:overlay-click'));
    }
  });

  /* Scroll lock ------------------------------------------------------------- */
  let locks = 0;
  window.vkScrollLock = {
    lock() { locks += 1; document.body.classList.add('vk-scroll-lock'); },
    unlock() { locks = Math.max(0, locks - 1); if (!locks) document.body.classList.remove('vk-scroll-lock'); },
  };

  /* Reveal on scroll -------------------------------------------------------- */
  const revealObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -10% 0px' })
    : null;
  const initReveal = (root = document) => {
    root.querySelectorAll('.vk-reveal:not(.is-visible)').forEach((el) => {
      if (revealObserver && !Shopify.designMode) revealObserver.observe(el);
      else el.classList.add('is-visible');
    });
  };
  window.vkInitReveal = initReveal;

  /* Carousel (Swiper wrapper) ---------------------------------------------- */
  class VkCarousel extends HTMLElement {
    connectedCallback() {
      if (this.swiper) return;
      const start = () => this.init();
      if (window.Swiper) start();
      else window.addEventListener('load', start, { once: true });
    }
    init() {
      if (this.swiper || !window.Swiper) return;
      let options = {};
      try { options = JSON.parse(this.dataset.options || '{}'); } catch (e) { options = {}; }
      const scope = this.closest('[data-vk-carousel-scope]') || this.parentElement;
      const prev = this.dataset.prev ? scope.querySelector(this.dataset.prev) : null;
      const next = this.dataset.next ? scope.querySelector(this.dataset.next) : null;
      if (prev && next) options.navigation = { prevEl: prev, nextEl: next };
      options.watchOverflow = true;
      this.swiper = new window.Swiper(this, options);
      this.classList.add('is-ready');
    }
    disconnectedCallback() {
      if (this.swiper) { this.swiper.destroy(true, true); this.swiper = null; }
    }
    update() { if (this.swiper) this.swiper.update(); }
  }
  if (!customElements.get('vk-carousel')) customElements.define('vk-carousel', VkCarousel);

  /* Tabs (segmented pill) --------------------------------------------------- */
  class VkTabs extends HTMLElement {
    connectedCallback() {
      this.buttons = [...this.querySelectorAll('[data-vk-tab]')];
      this.pill = this.querySelector('.vk-tabs__pill');
      const scopeSel = this.dataset.scope;
      this.scope = scopeSel ? this.closest(scopeSel) : this.closest('section, .shopify-section');
      this.buttons.forEach((btn) => btn.addEventListener('click', () => this.select(btn.dataset.vkTab)));
      const active = this.buttons.find((b) => b.getAttribute('aria-selected') === 'true') || this.buttons[0];
      requestAnimationFrame(() => {
        this.movePill(active, false);
        this.classList.add('is-ready');
      });
      this.resizeObserver = new ResizeObserver(() => this.movePill(this.current, false));
      this.resizeObserver.observe(this);
    }
    disconnectedCallback() { if (this.resizeObserver) this.resizeObserver.disconnect(); }
    select(key) {
      const btn = this.buttons.find((b) => b.dataset.vkTab === key);
      if (!btn) return;
      this.buttons.forEach((b) => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'));
      this.movePill(btn, true);
      if (!this.scope) return;
      this.scope.querySelectorAll('[data-vk-panel]').forEach((panel) => {
        const show = panel.dataset.vkPanel === key;
        panel.hidden = !show;
        panel.classList.toggle('is-active', show);
        if (show) panel.querySelectorAll('vk-carousel').forEach((c) => { c.init(); c.update(); });
        if (show) panel.dispatchEvent(new CustomEvent('vk:panel-shown', { bubbles: true }));
      });
      const viewAll = this.scope.querySelector('[data-vk-view-all]');
      if (viewAll && btn.dataset.url) viewAll.href = btn.dataset.url;
      this.scope.dispatchEvent(new CustomEvent('vk:tab-change', { detail: { key }, bubbles: true }));
    }
    movePill(btn, animate) {
      if (!btn || !this.pill) return;
      this.current = btn;
      this.pill.style.transition = animate ? '' : 'none';
      this.pill.style.width = `${btn.offsetWidth}px`;
      this.pill.style.transform = `translateX(${btn.offsetLeft}px)`;
      if (!animate) requestAnimationFrame(() => { this.pill.style.transition = ''; });
    }
  }
  if (!customElements.get('vk-tabs')) customElements.define('vk-tabs', VkTabs);

  document.addEventListener('DOMContentLoaded', () => initReveal());
  document.addEventListener('shopify:section:load', (e) => initReveal(e.target));
})();
