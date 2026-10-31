/* vk-product-card.js — colour swatches (siblings by sid tag), swatch switching, quick add */
(() => {
  if (customElements.get('vk-product-card')) return;

  const root = (window.Shopify?.routes?.root || '/').replace(/\/$/, '');
  const feedCache = new Map();

  const loadFeed = (sid) => {
    if (feedCache.has(sid)) return feedCache.get(sid);
    const key = `vk-sw:${sid}`;
    let cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) { cached = null; }
    if (cached && Date.now() - cached.t < 10 * 60 * 1000) {
      const p = Promise.resolve(cached.d);
      feedCache.set(sid, p);
      return p;
    }
    const url = `${root}/search?type=product&view=vk-swatches&q=${encodeURIComponent(`tag:"${sid}"`)}`;
    const p = fetch(url)
      .then((r) => (r.ok ? r.text() : '[]'))
      .then((t) => { try { return JSON.parse(t); } catch (e) { return []; } })
      .then((list) => {
        try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: list })); } catch (e) { /* storage full or blocked */ }
        return list;
      })
      .catch(() => []);
    feedCache.set(sid, p);
    return p;
  };

  const sortSwatches = (list) => list
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const aOut = !a.s.available; const bOut = !b.s.available;
      if (aOut !== bOut) return aOut ? 1 : -1;
      if (a.s.isNew !== b.s.isNew) return a.s.isNew ? -1 : 1;
      if (b.s.stock !== a.s.stock) return b.s.stock - a.s.stock;
      const n = (a.s.colorName || '').localeCompare(b.s.colorName || '');
      return n !== 0 ? n : a.i - b.i;
    })
    .map((x) => x.s);

  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { observer.unobserve(e.target); e.target.loadSwatches(); }
        });
      }, { rootMargin: '200px 0px' })
    : null;

  const cartAdd = async (variantId) => {
    const cartDrawer = document.querySelector('cart-drawer');
    const body = { items: [{ id: Number(variantId), quantity: 1 }] };
    if (cartDrawer && typeof cartDrawer.getSectionsToRender === 'function') {
      body.sections = cartDrawer.getSectionsToRender().map((s) => s.id);
      body.sections_url = window.location.pathname;
    }
    const res = await fetch(`${root}/cart/add.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.status) throw new Error(data.description || data.message || 'Add to cart failed');
    const cart = await fetch(`${root}/cart.js`).then((r) => r.json());
    document.dispatchEvent(new CustomEvent('vk:cart-count', { detail: { count: cart.item_count } }));
    document.dispatchEvent(new CustomEvent('vk:cart-added', { detail: { cart, response: data } }));
    if (window.publish && window.PUB_SUB_EVENTS) window.publish(window.PUB_SUB_EVENTS.cartUpdate, { source: 'vk-product-card', cartData: cart });
    if (cartDrawer && typeof cartDrawer.renderContents === 'function' && data.sections) {
      cartDrawer.classList.remove('is-empty');
      cartDrawer.renderContents({ ...data, id: variantId, sections: data.sections });
    }
    return cart;
  };
  window.vkCartAdd = cartAdd;

  const WISH_KEY = 'vk:wishlist';
  const wishList = () => { try { return JSON.parse(localStorage.getItem(WISH_KEY) || '[]'); } catch (e) { return []; } };
  const wishSave = (list) => { try { localStorage.setItem(WISH_KEY, JSON.stringify(list)); } catch (e) { /* storage blocked */ } };
  const wishSync = (btn) => btn && btn.setAttribute('aria-pressed', wishList().includes(btn.dataset.vkWish) ? 'true' : 'false');

  class VkProductCard extends HTMLElement {
    connectedCallback() {
      this.qa = this.querySelector('[data-vk-qa]');
      this.toggle = this.querySelector('[data-vk-qa-toggle]');
      this.swatchesEl = this.querySelector('[data-vk-swatches]');
      this.wish = this.querySelector('[data-vk-wish]');
      wishSync(this.wish);
      if (this.toggle) this.toggle.addEventListener('click', (e) => { e.preventDefault(); this.setOpen(!this.qa.classList.contains('is-open')); });
      this.addEventListener('click', (e) => this.onClick(e));
      if (this.dataset.sid && this.swatchesEl) {
        if (observer) observer.observe(this);
        else this.loadSwatches();
      }
    }
    disconnectedCallback() {
      if (observer) observer.unobserve(this);
      if (this.swiper) { this.swiper.destroy(true, true); this.swiper = null; }
    }
    setOpen(open) {
      if (!this.qa) return;
      this.qa.classList.toggle('is-open', open);
      this.toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    async onClick(e) {
      const wish = e.target.closest('[data-vk-wish]');
      if (wish) {
        e.preventDefault();
        const list = wishList();
        const i = list.indexOf(wish.dataset.vkWish);
        if (i > -1) list.splice(i, 1); else list.push(wish.dataset.vkWish);
        wishSave(list);
        wishSync(wish);
        document.dispatchEvent(new CustomEvent('vk:wishlist-change', { detail: { list } }));
        return;
      }
      const size = e.target.closest('.vk-card__size');
      if (size && !size.disabled) {
        e.preventDefault();
        size.classList.add('is-loading');
        try {
          await cartAdd(size.dataset.variantId);
          size.classList.remove('is-loading');
          size.classList.add('is-added');
          setTimeout(() => size.classList.remove('is-added'), 1500);
          this.setOpen(false);
        } catch (err) {
          size.classList.remove('is-loading');
          console.warn('[vk] quick add', err);
        }
        return;
      }
      const sw = e.target.closest('.vk-swatch');
      if (sw && this.feed) {
        e.preventDefault();
        const item = this.feed.find((p) => p.handle === sw.dataset.handle);
        if (item) this.applyProduct(item);
      }
    }
    async loadSwatches() {
      if (this.loading || this.feed) return;
      this.loading = true;
      const list = await loadFeed(this.dataset.sid);
      this.loading = false;
      if (!list || !list.length) return;
      this.feed = sortSwatches(list.filter((p) => p.color));
      this.renderSwatches();
    }
    renderSwatches() {
      const wrapper = this.swatchesEl.querySelector('.swiper-wrapper');
      const current = this.dataset.handle;
      wrapper.innerHTML = this.feed.map((p) => `
        <div class="swiper-slide">
          <a href="${p.url}" class="vk-swatch is-fade${p.handle === current ? ' is-selected' : ''}${p.available ? '' : ' is-unavailable'}"
             style="background-color:${p.color}" data-handle="${p.handle}"${p.refined ? ' data-refined="true"' : ''}
             aria-label="${(p.colorName || '').replace(/"/g, '&quot;')}" title="${(p.colorName || '').replace(/"/g, '&quot;')}"></a>
        </div>`).join('');
      requestAnimationFrame(() => {
        wrapper.querySelectorAll('.vk-swatch').forEach((el, i) => setTimeout(() => el.classList.add('is-in'), i * 30));
      });
      if (window.Swiper && !this.swiper) {
        this.swiper = new window.Swiper(this.swatchesEl, { slidesPerView: 'auto', spaceBetween: 8, freeMode: true, nested: true });
      } else if (this.swiper) {
        this.swiper.update();
      }
    }
    applyProduct(p) {
      this.dataset.handle = p.handle;
      this.dataset.productId = p.id;
      this.classList.toggle('vk-card--sold-out', !p.available);
      this.querySelectorAll('[data-vk-card-link]').forEach((a) => { a.href = p.url; a.setAttribute('aria-label', p.alt); });
      const img = this.querySelector('[data-vk-card-img]');
      const img2 = this.querySelector('[data-vk-card-img2]');
      if (img && p.img) { img.removeAttribute('srcset'); img.src = p.img; img.alt = p.alt; }
      if (img2) {
        if (p.img2) { img2.removeAttribute('srcset'); img2.src = p.img2; }
        else { img2.removeAttribute('srcset'); img2.src = p.img; }
      }
      const title = this.querySelector('[data-vk-card-title]');
      if (title) title.textContent = p.title;
      const color = this.querySelector('[data-vk-card-color]');
      if (color) color.textContent = p.colorName;
      const type = this.querySelector('[data-vk-card-type]');
      if (type) type.textContent = p.type;
      const price = this.querySelector('[data-vk-card-price]');
      if (price) {
        price.innerHTML = p.compareAt
          ? `<span class="vk-card__price-sale">${p.price}</span><s class="vk-card__price-compare">${p.compareAt}</s>`
          : p.price;
      }
      const badge = this.querySelector('[data-vk-card-badge]');
      if (badge) badge.hidden = !p.isNew;
      const sizes = this.querySelector('[data-vk-qa-sizes]');
      if (sizes) {
        sizes.innerHTML = p.variants.map((v) => `<button type="button" class="vk-reset-btn vk-card__size${v.title === 'Default Title' ? ' vk-card__size--single' : ''}${v.available ? '' : ' vk-card__size--unavailable'}" data-variant-id="${v.id}"${v.available ? '' : ' disabled'}>${v.title === 'Default Title' ? (window.vkStrings?.addToCart || 'Add to cart') : v.title}</button>`).join('');
      }
      this.querySelectorAll('.vk-swatch').forEach((s) => s.classList.toggle('is-selected', s.dataset.handle === p.handle));
      if (this.wish) { this.wish.dataset.vkWish = p.handle; wishSync(this.wish); }
    }
  }
  customElements.define('vk-product-card', VkProductCard);
})();
