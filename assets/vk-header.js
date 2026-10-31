/* vk-header.js — mega menu, search drawer, mobile menu drawer, country select */
(() => {
  const OPEN_DELAY = 80;
  const CLOSE_DELAY = 150;

  class VkHeader extends HTMLElement {
    connectedCallback() {
      this.items = [...this.querySelectorAll('[data-vk-mega-item]')];
      this.openItem = null;
      this.timer = null;

      this.items.forEach((item) => {
        const link = item.querySelector('.vk-header__link');
        item.addEventListener('mouseenter', () => this.schedule(() => this.open(item), OPEN_DELAY));
        item.addEventListener('mouseleave', () => this.schedule(() => this.close(), CLOSE_DELAY));
        item.addEventListener('focusin', () => { clearTimeout(this.timer); this.open(item); });
        link.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); this.open(item); item.querySelector('.vk-mega a')?.focus(); }
        });
      });
      this.addEventListener('focusout', (e) => {
        if (this.openItem && !this.openItem.contains(e.relatedTarget)) this.close();
      });
      this.onKey = (e) => { if (e.key === 'Escape' && this.openItem) { const l = this.openItem.querySelector('.vk-header__link'); this.close(); l.focus(); } };
      document.addEventListener('keydown', this.onKey);
      this.onOverlay = () => this.close();
      document.addEventListener('vk:overlay-click', this.onOverlay);

      const country = this.querySelector('[data-vk-country-select]');
      if (country) country.addEventListener('change', () => country.form.submit());

      document.addEventListener('vk:cart-count', (e) => this.setCount(e.detail.count));
    }
    disconnectedCallback() {
      document.removeEventListener('keydown', this.onKey);
      document.removeEventListener('vk:overlay-click', this.onOverlay);
    }
    schedule(fn, delay) { clearTimeout(this.timer); this.timer = setTimeout(fn, delay); }
    open(item) {
      if (this.openItem === item) return;
      if (this.openItem) this.closeItem(this.openItem);
      this.openItem = item;
      item.classList.add('is-open');
      item.querySelector('.vk-header__link').setAttribute('aria-expanded', 'true');
      window.vkOverlay?.show(this, { zIndex: 798 });
    }
    closeItem(item) {
      item.classList.remove('is-open');
      item.querySelector('.vk-header__link').setAttribute('aria-expanded', 'false');
    }
    close() {
      if (!this.openItem) return;
      this.closeItem(this.openItem);
      this.openItem = null;
      window.vkOverlay?.hide(this);
    }
    setCount(count) {
      const el = this.querySelector('[data-vk-cart-count]');
      if (!el) return;
      el.textContent = count < 100 ? count : '';
      el.classList.toggle('is-empty', !count);
    }
  }
  if (!customElements.get('vk-header')) customElements.define('vk-header', VkHeader);

  /* Search drawer ---------------------------------------------------------- */
  class VkSearchDrawer extends HTMLElement {
    connectedCallback() {
      this.input = this.querySelector('[data-vk-search-input]');
      this.results = this.querySelector('[data-vk-search-results]');
      this.clearBtn = this.querySelector('[data-vk-search-clear]');
      this.openers = [...document.querySelectorAll('[data-vk-search-open]')];
      this.cache = new Map();
      this.openers.forEach((btn) => btn.addEventListener('click', (e) => { e.preventDefault(); this.open(btn); }));
      this.querySelector('[data-vk-search-close]').addEventListener('click', () => this.close());
      this.clearBtn.addEventListener('click', () => { this.input.value = ''; this.render(''); this.input.focus(); });
      this.input.addEventListener('input', () => {
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => this.search(this.input.value.trim()), 250);
      });
      this.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
      this.onOverlay = () => this.close();
      document.addEventListener('vk:overlay-click', this.onOverlay);
    }
    disconnectedCallback() { document.removeEventListener('vk:overlay-click', this.onOverlay); }
    open(opener) {
      this.opener = opener;
      this.classList.add('is-open');
      this.setAttribute('aria-hidden', 'false');
      this.openers.forEach((b) => b.setAttribute('aria-expanded', 'true'));
      window.vkOverlay?.show(this, { zIndex: 899 });
      window.vkScrollLock?.lock();
      setTimeout(() => this.input.focus(), 50);
    }
    close() {
      if (!this.classList.contains('is-open')) return;
      this.classList.remove('is-open');
      this.setAttribute('aria-hidden', 'true');
      this.openers.forEach((b) => b.setAttribute('aria-expanded', 'false'));
      window.vkOverlay?.hide(this);
      window.vkScrollLock?.unlock();
      this.opener?.focus();
    }
    async search(term) {
      this.clearBtn.hidden = !term;
      if (!term) { this.render(''); return; }
      if (this.cache.has(term)) { this.render(this.cache.get(term)); return; }
      const root = (window.Shopify?.routes?.root || '/').replace(/\/$/, '');
      const url = `${root}/search/suggest?q=${encodeURIComponent(term)}&resources[type]=product&resources[limit]=8&resources[options][unavailable_products]=last&section_id=vk-predictive-search`;
      try {
        this.abort?.abort();
        this.abort = new AbortController();
        const res = await fetch(url, { signal: this.abort.signal });
        if (!res.ok) throw new Error(res.status);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const content = doc.querySelector('#vk-predictive-search')?.innerHTML || '';
        this.cache.set(term, content);
        if (this.input.value.trim() === term) this.render(content);
      } catch (err) {
        if (err.name !== 'AbortError') this.render('');
      }
    }
    render(html) { this.results.innerHTML = html; }
  }
  if (!customElements.get('vk-search-drawer')) customElements.define('vk-search-drawer', VkSearchDrawer);

  /* Mobile menu drawer ----------------------------------------------------- */
  class VkMenuDrawer extends HTMLElement {
    connectedCallback() {
      this.panel = this.querySelector('.vk-drawer__panel');
      this.openers = [...document.querySelectorAll('[data-vk-drawer-open]')];
      this.openers.forEach((b) => b.addEventListener('click', () => this.open(b)));
      this.querySelector('[data-vk-drawer-close]').addEventListener('click', () => this.close());
      this.addEventListener('click', (e) => { if (e.target === this) this.close(); });
      this.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
      this.tabs = [...this.querySelectorAll('[data-vk-drawer-tab]')];
      this.tabs.forEach((tab) => tab.addEventListener('click', () => this.selectTab(tab.dataset.vkDrawerTab)));
      this.onOverlay = () => this.close();
      document.addEventListener('vk:overlay-click', this.onOverlay);
      this.mq = window.matchMedia('(min-width: 990px)');
      this.mq.addEventListener('change', (e) => { if (e.matches) this.close(); });
    }
    disconnectedCallback() { document.removeEventListener('vk:overlay-click', this.onOverlay); }
    open(opener) {
      this.opener = opener;
      this.classList.add('is-open');
      this.setAttribute('aria-hidden', 'false');
      this.openers.forEach((b) => b.setAttribute('aria-expanded', 'true'));
      window.vkOverlay?.show(this, { zIndex: 899 });
      window.vkScrollLock?.lock();
      this.querySelectorAll('vk-carousel').forEach((c) => { c.init(); c.update(); });
      setTimeout(() => this.panel.focus(), 50);
    }
    close() {
      if (!this.classList.contains('is-open')) return;
      this.classList.remove('is-open');
      this.setAttribute('aria-hidden', 'true');
      this.openers.forEach((b) => b.setAttribute('aria-expanded', 'false'));
      window.vkOverlay?.hide(this);
      window.vkScrollLock?.unlock();
      this.opener?.focus();
    }
    selectTab(key) {
      this.tabs.forEach((t) => {
        const on = t.dataset.vkDrawerTab === key;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      this.querySelectorAll('[data-vk-drawer-panel]').forEach((p) => {
        const on = p.dataset.vkDrawerPanel === key;
        p.hidden = !on;
        p.classList.toggle('is-active', on);
        if (on) p.querySelectorAll('vk-carousel').forEach((c) => { c.init(); c.update(); });
      });
    }
  }
  if (!customElements.get('vk-menu-drawer')) customElements.define('vk-menu-drawer', VkMenuDrawer);
})();
