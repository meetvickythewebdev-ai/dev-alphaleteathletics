/* vk-athlete-edit.js — scroll-snap carousel + Shop the Look drawer (multi-add to cart) */
(() => {
  if (customElements.get('vk-athlete-edit')) return;

  const money = (cents, fmt) => {
    const format = fmt || '${{amount}}';
    const amount = (cents / 100).toFixed(2);
    return format.replace(/\{\{\s*amount\s*\}\}/, amount.replace(/\B(?=(\d{3})+(?!\d))/g, ','))
      .replace(/\{\{\s*amount_no_decimals\s*\}\}/, Math.round(cents / 100))
      .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/, amount.replace('.', ','));
  };
  const fill = (tpl, map) => Object.entries(map).reduce((t, [k, v]) => t.split(`[${k}]`).join(v), tpl || '');

  class VkAthleteEdit extends HTMLElement {
    connectedCallback() {
      this.sectionId = this.dataset.sectionId;
      this.track = this.querySelector('[data-ae-track]');
      this.prev = this.querySelector('[data-ae-prev]');
      this.next = this.querySelector('[data-ae-next]');
      document.querySelectorAll(`body > [data-ae-drawer][data-section-id="${this.sectionId}"]`).forEach((el) => el.remove());
      this.drawer = this.querySelector('[data-ae-drawer]');
      if (this.drawer) {
        document.body.appendChild(this.drawer);
        this.panel = this.drawer.querySelector('[data-ae-panel]');
        this.submit = this.drawer.querySelector('[data-ae-submit]');
        this.drawer.addEventListener('click', (e) => this.onDrawerClick(e));
        this.drawer.addEventListener('change', (e) => { if (e.target.matches('[data-ae-include]')) this.update(); });
        this.drawer.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
        this.submit.addEventListener('click', () => this.addToCart());
      }
      this.querySelectorAll('[data-ae-open]').forEach((btn) => btn.addEventListener('click', () => this.open(btn.dataset.aeOpen, btn)));
      this.initCarousel();
      if (window.Shopify && Shopify.designMode) {
        this.onBlockSelect = (e) => {
          if (e.detail?.sectionId !== this.sectionId) return;
          const card = this.querySelector(`[data-ae-card="${e.detail.blockId}"]`);
          if (card) this.track.scrollTo({ left: card.offsetLeft - this.track.offsetLeft, behavior: 'smooth' });
        };
        document.addEventListener('shopify:block:select', this.onBlockSelect);
      }
    }
    disconnectedCallback() {
      if (this.drawer && this.drawer.parentNode) this.drawer.remove();
      if (this.onBlockSelect) document.removeEventListener('shopify:block:select', this.onBlockSelect);
      if (this.ro) this.ro.disconnect();
    }
    initCarousel() {
      if (!this.track) return;
      const step = () => {
        const card = this.track.querySelector('.vk-ae__card');
        const gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
        return card ? card.getBoundingClientRect().width + gap : this.track.clientWidth;
      };
      this.prev?.addEventListener('click', () => this.track.scrollBy({ left: -step(), behavior: 'smooth' }));
      this.next?.addEventListener('click', () => this.track.scrollBy({ left: step(), behavior: 'smooth' }));
      let ticking = false;
      this.track.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => { this.updateNav(); ticking = false; });
      }, { passive: true });
      if ('ResizeObserver' in window) { this.ro = new ResizeObserver(() => this.updateNav()); this.ro.observe(this.track); }
      this.updateNav();
    }
    updateNav() {
      const { scrollLeft, scrollWidth, clientWidth } = this.track;
      if (this.prev) this.prev.disabled = scrollLeft <= 2;
      if (this.next) this.next.disabled = scrollLeft + clientWidth >= scrollWidth - 2;
    }
    open(lookId, opener) {
      if (!this.drawer) return;
      this.opener = opener;
      this.drawer.querySelectorAll('[data-ae-look]').forEach((l) => { l.hidden = l.dataset.aeLook !== lookId; });
      this.look = this.drawer.querySelector(`[data-ae-look="${lookId}"]`);
      this.setMessage('');
      this.update();
      this.drawer.classList.add('is-open');
      this.drawer.setAttribute('aria-hidden', 'false');
      window.vkScrollLock?.lock();
      setTimeout(() => this.panel.focus(), 50);
    }
    close() {
      if (!this.drawer?.classList.contains('is-open')) return;
      this.drawer.classList.remove('is-open');
      this.drawer.setAttribute('aria-hidden', 'true');
      window.vkScrollLock?.unlock();
      this.opener?.focus();
    }
    onDrawerClick(e) {
      if (e.target.closest('[data-ae-close]')) { this.close(); return; }
      const size = e.target.closest('.vk-ae-drawer__size');
      if (size && !size.disabled) {
        const item = size.closest('[data-ae-item]');
        item.querySelectorAll('.vk-ae-drawer__size').forEach((b) => b.setAttribute('aria-checked', b === size ? 'true' : 'false'));
        item.dataset.variant = size.dataset.variant;
        const include = item.querySelector('[data-ae-include]');
        if (include && !include.checked) include.checked = true;
        this.update();
      }
    }
    items() { return this.look ? [...this.look.querySelectorAll('[data-ae-item]')] : []; }
    update() {
      const items = this.items();
      let included = 0; let missing = 0; let total = 0;
      items.forEach((item) => {
        const on = item.querySelector('[data-ae-include]')?.checked;
        item.classList.toggle('is-excluded', !on);
        if (!on) return;
        included += 1;
        total += Number(item.dataset.price || 0);
        if (!item.dataset.variant) missing += 1;
      });
      const caption = this.drawer.querySelector('[data-ae-caption]');
      caption.textContent = fill(caption.dataset.template, { selected: included, count: items.length });
      this.drawer.querySelector('[data-ae-total]').textContent = money(total, this.dataset.moneyFormat);
      const s = this.submit;
      if (!included) { s.disabled = true; s.textContent = s.dataset.labelNone; }
      else if (missing) { s.disabled = true; s.textContent = fill(s.dataset.labelSelect, { n: missing }); }
      else { s.disabled = false; s.textContent = fill(s.dataset.labelAdd, { n: included }); }
    }
    setMessage(text, error) {
      const m = this.drawer.querySelector('[data-ae-message]');
      m.hidden = !text;
      m.textContent = text;
      m.classList.toggle('is-error', !!error);
    }
    async addToCart() {
      const ids = this.items()
        .filter((i) => i.querySelector('[data-ae-include]')?.checked && i.dataset.variant)
        .map((i) => ({ id: Number(i.dataset.variant), quantity: 1 }));
      if (!ids.length) return;
      const root = (window.Shopify?.routes?.root || '/').replace(/\/$/, '');
      this.submit.classList.add('is-loading');
      this.submit.disabled = true;
      try {
        const cartDrawer = document.querySelector('cart-drawer');
        const body = { items: ids };
        if (cartDrawer?.getSectionsToRender) {
          body.sections = cartDrawer.getSectionsToRender().map((x) => x.id);
          body.sections_url = window.location.pathname;
        }
        const res = await fetch(`${root}/cart/add.js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok || data.status) throw new Error(data.description || data.message);
        const cart = await fetch(`${root}/cart.js`).then((r) => r.json());
        document.dispatchEvent(new CustomEvent('vk:cart-count', { detail: { count: cart.item_count } }));
        document.dispatchEvent(new CustomEvent('vk:cart-added', { detail: { cart, response: data } }));
        this.close();
        if (cartDrawer?.renderContents && data.sections) {
          cartDrawer.classList.remove('is-empty');
          cartDrawer.renderContents({ ...data, sections: data.sections });
        }
      } catch (err) {
        this.setMessage(err.message || 'Error', true);
      } finally {
        this.submit.classList.remove('is-loading');
        this.update();
      }
    }
  }
  customElements.define('vk-athlete-edit', VkAthleteEdit);
})();
