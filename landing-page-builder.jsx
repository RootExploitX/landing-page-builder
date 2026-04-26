import { useState, useEffect, useRef, useCallback } from "react";

// ─── DB Layer (localStorage-based, mirrors SQLite schema) ──────────────────
const DB = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  init() {
    if (!this.get("lpb_stores")) this.set("lpb_stores", []);
    if (!this.get("lpb_pages")) this.set("lpb_pages", []);
    if (!this.get("lpb_orders")) this.set("lpb_orders", []);
    if (!this.get("lpb_analytics")) this.set("lpb_analytics", {});
  },
  stores: {
    all: () => DB.get("lpb_stores") || [],
    save: (s) => { const arr = DB.stores.all(); const i = arr.findIndex(x => x.id === s.id); if (i >= 0) arr[i] = s; else arr.push(s); DB.set("lpb_stores", arr); return s; },
    delete: (id) => DB.set("lpb_stores", DB.stores.all().filter(s => s.id !== id)),
  },
  pages: {
    all: () => DB.get("lpb_pages") || [],
    byStore: (sid) => DB.pages.all().filter(p => p.storeId === sid),
    bySlug: (slug) => DB.pages.all().find(p => p.slug === slug),
    save: (p) => { const arr = DB.pages.all(); const i = arr.findIndex(x => x.id === p.id); if (i >= 0) arr[i] = p; else arr.push(p); DB.set("lpb_pages", arr); return p; },
    delete: (id) => DB.set("lpb_pages", DB.pages.all().filter(p => p.id !== id)),
  },
  orders: {
    all: () => DB.get("lpb_orders") || [],
    save: (o) => { const arr = DB.orders.all(); arr.push(o); DB.set("lpb_orders", arr); return o; },
    update: (o) => { const arr = DB.orders.all(); const i = arr.findIndex(x => x.id === o.id); if (i >= 0) arr[i] = o; DB.set("lpb_orders", arr); },
    delete: (id) => DB.set("lpb_orders", DB.orders.all().filter(o => o.id !== id)),
  },
  analytics: {
    visit: (pageId) => { const a = DB.get("lpb_analytics") || {}; a[pageId] = a[pageId] || { visits: 0, orders: 0 }; a[pageId].visits++; DB.set("lpb_analytics", a); },
    order: (pageId) => { const a = DB.get("lpb_analytics") || {}; a[pageId] = a[pageId] || { visits: 0, orders: 0 }; a[pageId].orders++; DB.set("lpb_analytics", a); },
    get: (pageId) => (DB.get("lpb_analytics") || {})[pageId] || { visits: 0, orders: 0 },
  },
};

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const now = () => new Date().toISOString();
const fmt = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

// ─── Default Page Config ───────────────────────────────────────────────────
const defaultPage = (storeId) => ({
  id: uid(), storeId, slug: "page-" + uid().slice(0, 6),
  name: "New Landing Page", status: "draft",
  createdAt: now(), updatedAt: now(),
  seo: { title: "", description: "" },
  product: { name: "Product Name", description: "Your amazing product description goes here.", price: 99, discount: 0, discountType: "percent", stock: "", showStock: false },
  design: {
    primary: "#6c47ff", secondary: "#ff6b6b", accent: "#ffd93d",
    bg: "#0a0a0f", bgGradient: true, surface: "#16161f",
    text: "#f0f0f8", textMuted: "#8888a8", fontFamily: "Sora",
    fontBody: "DM Sans", borderRadius: "12", buttonStyle: "rounded",
    darkMode: true, customCss: "",
  },
  sections: {
    hero: { enabled: true, headline: "The Product That Changes Everything", sub: "Limited time offer — don't miss out", ctaText: "Order Now", ctaSecondary: "Learn More", bgImage: "" },
    gallery: { enabled: true, images: [], video: "" },
    features: { enabled: true, items: [
      { icon: "✦", title: "Premium Quality", desc: "Built to last with top-tier materials." },
      { icon: "⚡", title: "Fast Delivery", desc: "Ships within 24 hours to your door." },
      { icon: "🛡️", title: "Money-Back Guarantee", desc: "Full refund if you're not satisfied." },
    ]},
    testimonials: { enabled: true, items: [
      { name: "Sarah K.", rating: 5, text: "Absolutely love this product! Best purchase this year.", avatar: "" },
      { name: "Mike R.", rating: 5, text: "Quality exceeded my expectations. Highly recommended!", avatar: "" },
    ]},
    faq: { enabled: true, items: [
      { q: "How long does shipping take?", a: "Standard shipping takes 3-5 business days." },
      { q: "What is your return policy?", a: "We offer a 30-day no-questions-asked return policy." },
    ]},
    countdown: { enabled: false, label: "Offer ends in:", endDate: "" },
    offerBanner: { enabled: true, text: "🔥 Limited Offer — Save 30% Today Only!", },
    trustBadges: { enabled: true },
  },
  form: {
    fields: {
      fullName: { enabled: true, required: true, label: "Full Name" },
      phone: { enabled: true, required: true, label: "Phone Number" },
      whatsapp: { enabled: false, required: false, label: "WhatsApp Number" },
      phone2: { enabled: false, required: false, label: "Secondary Phone" },
      landline: { enabled: false, required: false, label: "Landline" },
      address: { enabled: true, required: false, label: "Address" },
      city: { enabled: true, required: false, label: "City / Region" },
      notes: { enabled: true, required: false, label: "Notes" },
    },
    cities: ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"],
    successMsg: "🎉 Order placed successfully! We'll contact you soon.",
    redirectUrl: "",
    submitLabel: "Place Order",
  },
});

const defaultStore = () => ({
  id: uid(), name: "My Store", logo: "", currency: "USD",
  whatsapp: "", createdAt: now(),
});

// ─── STYLES ────────────────────────────────────────────────────────────────
const G = {
  fonts: `@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=DM+Sans:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');`,
  css: `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #07070f; --surface: #111120; --surface2: #1a1a2e;
      --border: #2a2a45; --text: #e8e8f8; --muted: #7070a0;
      --accent: #6c47ff; --accent2: #ff6b6b; --accent3: #ffd93d;
      --radius: 12px; --font: 'Sora', sans-serif; --font-body: 'DM Sans', sans-serif;
    }
    body { background: var(--bg); color: var(--text); font-family: var(--font-body); min-height: 100vh; }
    ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: var(--surface); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    .app { display: flex; min-height: 100vh; }
    /* Sidebar */
    .sidebar { width: 240px; min-height: 100vh; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; position: fixed; left: 0; top: 0; z-index: 100; }
    .sidebar-logo { padding: 20px; border-bottom: 1px solid var(--border); }
    .sidebar-logo h1 { font-family: var(--font); font-size: 18px; font-weight: 800; background: linear-gradient(135deg, var(--accent), var(--accent2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .sidebar-logo span { font-size: 11px; color: var(--muted); font-family: 'Space Mono', monospace; }
    .sidebar-nav { flex: 1; padding: 12px 0; overflow-y: auto; }
    .nav-section { padding: 8px 16px 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: var(--muted); font-family: 'Space Mono', monospace; }
    .nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 20px; cursor: pointer; color: var(--muted); font-size: 13.5px; transition: all .15s; border-left: 3px solid transparent; }
    .nav-item:hover { color: var(--text); background: var(--surface2); }
    .nav-item.active { color: var(--accent); background: rgba(108,71,255,.08); border-left-color: var(--accent); }
    .nav-item .ni { font-size: 16px; width: 20px; text-align: center; }
    /* Main */
    .main { margin-left: 240px; flex: 1; min-height: 100vh; }
    .topbar { height: 56px; background: var(--surface); border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 28px; gap: 16px; position: sticky; top: 0; z-index: 50; }
    .topbar h2 { font-family: var(--font); font-size: 16px; font-weight: 700; flex: 1; }
    .content { padding: 28px; }
    /* Cards */
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
    .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    /* Buttons */
    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: all .15s; font-family: var(--font-body); }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: #5535e0; transform: translateY(-1px); box-shadow: 0 4px 20px rgba(108,71,255,.4); }
    .btn-danger { background: rgba(255,107,107,.15); color: var(--accent2); border: 1px solid rgba(255,107,107,.3); }
    .btn-danger:hover { background: rgba(255,107,107,.25); }
    .btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
    .btn-ghost:hover { color: var(--text); border-color: var(--muted); }
    .btn-sm { padding: 6px 12px; font-size: 12px; }
    .btn-success { background: rgba(50,200,130,.15); color: #32c882; border: 1px solid rgba(50,200,130,.3); }
    /* Inputs */
    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; font-weight: 500; text-transform: uppercase; letter-spacing: .8px; }
    input, textarea, select { background: var(--surface2); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 9px 13px; font-size: 13.5px; font-family: var(--font-body); width: 100%; outline: none; transition: border .15s; }
    input:focus, textarea:focus, select:focus { border-color: var(--accent); }
    textarea { resize: vertical; min-height: 80px; }
    select option { background: var(--surface2); }
    /* Toggle */
    .toggle { position: relative; width: 40px; height: 22px; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-slider { position: absolute; inset: 0; background: var(--border); border-radius: 22px; cursor: pointer; transition: .2s; }
    .toggle-slider:before { content: ''; position: absolute; height: 16px; width: 16px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .2s; }
    .toggle input:checked + .toggle-slider { background: var(--accent); }
    .toggle input:checked + .toggle-slider:before { transform: translateX(18px); }
    /* Badges */
    .badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
    .badge-draft { background: rgba(150,150,180,.15); color: var(--muted); }
    .badge-published { background: rgba(50,200,130,.15); color: #32c882; }
    .badge-new { background: rgba(108,71,255,.15); color: var(--accent); }
    .badge-confirmed { background: rgba(50,200,130,.15); color: #32c882; }
    .badge-shipped { background: rgba(255,200,50,.15); color: #ffd93d; }
    .badge-cancelled { background: rgba(255,107,107,.15); color: var(--accent2); }
    /* Stats */
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; }
    .stat-card .num { font-family: var(--font); font-size: 28px; font-weight: 800; }
    .stat-card .lbl { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
    /* Table */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 10px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); border-bottom: 1px solid var(--border); font-family: 'Space Mono', monospace; }
    td { padding: 12px 14px; border-bottom: 1px solid rgba(42,42,69,.5); vertical-align: middle; }
    tr:hover td { background: rgba(255,255,255,.02); }
    /* Tabs */
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
    .tab { padding: 10px 18px; cursor: pointer; font-size: 13px; color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all .15s; }
    .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
    /* Modal */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .modal { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; width: 100%; max-width: 540px; max-height: 90vh; overflow-y: auto; }
    .modal-header { padding: 20px 24px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; background: var(--surface); z-index: 1; }
    .modal-header h3 { font-family: var(--font); font-size: 16px; font-weight: 700; }
    .modal-body { padding: 24px; }
    .modal-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; gap: 10px; justify-content: flex-end; }
    /* Page Builder Layout */
    .builder-layout { display: grid; grid-template-columns: 280px 1fr; gap: 0; min-height: calc(100vh - 56px); }
    .builder-panel { background: var(--surface); border-right: 1px solid var(--border); overflow-y: auto; }
    .builder-preview { background: var(--bg); overflow-y: auto; padding: 0; }
    .panel-section { border-bottom: 1px solid var(--border); }
    .panel-section-header { padding: 14px 18px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; }
    .panel-section-body { padding: 14px 18px; }
    /* Color Swatch */
    .color-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
    .color-label { font-size: 12px; color: var(--muted); width: 90px; flex-shrink: 0; }
    .color-input-wrap { display: flex; gap: 6px; align-items: center; flex: 1; }
    input[type=color] { width: 36px; height: 36px; border-radius: 6px; padding: 2px; cursor: pointer; border: 1px solid var(--border); }
    /* Drag handle */
    .drag-item { display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--surface2); border-radius: 8px; margin-bottom: 6px; cursor: grab; }
    .drag-handle { color: var(--muted); font-size: 14px; cursor: grab; }
    /* Preview iframe style */
    .preview-frame { width: 100%; height: calc(100vh - 56px); border: none; }
    /* Section toggle row */
    .section-toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(42,42,69,.5); }
    .section-toggle-row:last-child { border-bottom: none; }
    /* Misc */
    .flex { display: flex; } .items-center { align-items: center; } .gap-2 { gap: 8px; } .gap-3 { gap: 12px; } .flex-1 { flex: 1; }
    .mt-2 { margin-top: 8px; } .mt-4 { margin-top: 16px; } .mb-4 { margin-bottom: 16px; }
    .text-muted { color: var(--muted); font-size: 12px; }
    .text-sm { font-size: 12px; }
    .font-mono { font-family: 'Space Mono', monospace; }
    .empty-state { text-align: center; padding: 60px 20px; color: var(--muted); }
    .empty-state .icon { font-size: 40px; margin-bottom: 12px; }
    .chip { display: inline-flex; align-items: center; padding: 3px 10px; background: rgba(108,71,255,.1); color: var(--accent); border-radius: 20px; font-size: 11px; font-weight: 600; }
    /* Analytics mini chart */
    .mini-bar { height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; margin-top: 6px; }
    .mini-bar-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width .5s; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
    input[type=range] { padding: 0; }
    .section-chip { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; background: rgba(108,71,255,.08); color: var(--accent); border: 1px solid rgba(108,71,255,.2); }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .fade-in { animation: fadeIn .2s ease; }
    .lp-preview { font-family: 'DM Sans', sans-serif; }
    .search-input { max-width: 280px; }
  `,
};

// ─── LANDING PAGE RENDERER ─────────────────────────────────────────────────
function LandingPagePreview({ page, onOrder, preview = false }) {
  const { design: d, sections: s, product: p, form: f } = page;
  const [formData, setFormData] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});
  const [openFaq, setOpenFaq] = useState(null);
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0 });
  const [currentImg, setCurrentImg] = useState(0);
  const formRef = useRef(null);

  const finalPrice = p.discountType === "percent"
    ? p.price * (1 - p.discount / 100)
    : p.price - p.discount;

  const btnStyle = {
    rounded: "50px", square: "4px", soft: "12px"
  }[d.buttonStyle] || "10px";

  const css = `
    .lp { --p: ${d.primary}; --s: ${d.secondary}; --a: ${d.accent};
      --bg: ${d.bg}; --surf: ${d.surface}; --txt: ${d.text}; --muted: ${d.textMuted};
      --ff: '${d.fontFamily}', sans-serif; --fb: '${d.fontBody}', sans-serif;
      --r: ${d.borderRadius}px; --btn-r: ${btnStyle};
      background: ${d.bgGradient ? `linear-gradient(135deg, ${d.bg} 0%, ${d.surface} 100%)` : d.bg};
      color: var(--txt); min-height: 100vh; font-family: var(--fb); }
    .lp * { box-sizing: border-box; }
    .lp h1,h2,h3 { font-family: var(--ff); }
    .lp .hero { padding: 80px 20px 60px; text-align: center; max-width: 800px; margin: auto; }
    .lp .hero h1 { font-size: clamp(28px,5vw,52px); font-weight: 800; line-height: 1.15; margin-bottom: 18px;
      background: linear-gradient(135deg, var(--txt) 0%, var(--p) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .lp .hero p { font-size: 17px; color: var(--muted); margin-bottom: 32px; max-width: 500px; margin-left: auto; margin-right: auto; }
    .lp .cta-btn { display: inline-flex; align-items: center; gap: 8px; padding: 16px 36px; background: var(--p); color: white;
      border-radius: var(--btn-r); font-size: 16px; font-weight: 700; cursor: pointer; border: none; font-family: var(--fb);
      box-shadow: 0 8px 32px rgba(0,0,0,.3); transition: all .2s; text-decoration: none; }
    .lp .cta-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,.4); filter: brightness(1.1); }
    .lp .cta-sec { display: inline-flex; align-items: center; gap: 6px; padding: 12px 24px; background: transparent;
      color: var(--txt); border: 1px solid rgba(255,255,255,.2); border-radius: var(--btn-r); font-size: 14px; cursor: pointer;
      margin-left: 12px; font-family: var(--fb); transition: all .2s; text-decoration: none; }
    .lp .cta-sec:hover { border-color: var(--p); color: var(--p); }
    .lp .section { padding: 60px 20px; max-width: 1000px; margin: auto; }
    .lp .section-title { font-size: 28px; font-weight: 800; margin-bottom: 8px; }
    .lp .section-sub { color: var(--muted); margin-bottom: 40px; font-size: 15px; }
    .lp .features-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; }
    .lp .feature-card { background: var(--surf); border: 1px solid rgba(255,255,255,.06); border-radius: var(--r); padding: 24px; transition: transform .2s; }
    .lp .feature-card:hover { transform: translateY(-4px); }
    .lp .feature-icon { font-size: 28px; margin-bottom: 12px; }
    .lp .feature-title { font-size: 16px; font-weight: 700; margin-bottom: 6px; font-family: var(--ff); }
    .lp .feature-desc { color: var(--muted); font-size: 14px; line-height: 1.6; }
    .lp .gallery { display: flex; flex-direction: column; align-items: center; }
    .lp .gallery-main { width: 100%; max-width: 500px; aspect-ratio: 1; background: var(--surf); border-radius: var(--r); display: flex; align-items: center; justify-content: center; font-size: 80px; border: 1px solid rgba(255,255,255,.06); overflow: hidden; }
    .lp .gallery-main img { width: 100%; height: 100%; object-fit: cover; }
    .lp .gallery-thumbs { display: flex; gap: 10px; margin-top: 12px; }
    .lp .gallery-thumb { width: 60px; height: 60px; border-radius: 8px; background: var(--surf); cursor: pointer; border: 2px solid transparent; overflow: hidden; }
    .lp .gallery-thumb.active { border-color: var(--p); }
    .lp .gallery-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .lp .price-block { display: flex; align-items: center; gap: 14px; margin: 20px 0; }
    .lp .price-main { font-size: 36px; font-weight: 800; font-family: var(--ff); color: var(--p); }
    .lp .price-orig { font-size: 20px; text-decoration: line-through; color: var(--muted); }
    .lp .price-badge { background: var(--s); color: white; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 700; }
    .lp .testimonials-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    .lp .testi-card { background: var(--surf); border: 1px solid rgba(255,255,255,.06); border-radius: var(--r); padding: 20px; }
    .lp .testi-name { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
    .lp .testi-stars { color: var(--a); font-size: 14px; margin-bottom: 10px; }
    .lp .testi-text { color: var(--muted); font-size: 14px; line-height: 1.6; font-style: italic; }
    .lp .faq-item { border-bottom: 1px solid rgba(255,255,255,.06); }
    .lp .faq-q { padding: 16px 0; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 15px; }
    .lp .faq-a { padding: 0 0 16px; color: var(--muted); font-size: 14px; line-height: 1.7; }
    .lp .countdown-bar { background: var(--s); padding: 12px; text-align: center; font-weight: 700; font-size: 15px; border-radius: var(--r); margin-bottom: 20px; }
    .lp .countdown-digits { font-size: 20px; font-family: monospace; }
    .lp .offer-banner { background: linear-gradient(90deg, var(--p), var(--s)); padding: 12px 20px; text-align: center; font-weight: 700; font-size: 14px; color: white; position: sticky; top: 0; z-index: 10; }
    .lp .trust-badges { display: flex; justify-content: center; flex-wrap: wrap; gap: 20px; padding: 20px; }
    .lp .trust-badge { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; }
    .lp .form-section { max-width: 560px; margin: 0 auto; }
    .lp .form-card { background: var(--surf); border: 1px solid rgba(255,255,255,.06); border-radius: var(--r); padding: 32px; }
    .lp .form-title { font-size: 24px; font-weight: 800; margin-bottom: 24px; font-family: var(--ff); }
    .lp .form-field { margin-bottom: 16px; }
    .lp .form-label { display: block; font-size: 13px; margin-bottom: 6px; color: var(--muted); font-weight: 500; }
    .lp .form-input { width: 100%; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); color: var(--txt); border-radius: 8px; padding: 11px 14px; font-size: 14px; font-family: var(--fb); outline: none; transition: border .15s; }
    .lp .form-input:focus { border-color: var(--p); }
    .lp .form-input.error { border-color: var(--s); }
    .lp .form-error { color: var(--s); font-size: 12px; margin-top: 4px; }
    .lp .submit-btn { width: 100%; padding: 16px; background: var(--p); color: white; border: none; border-radius: var(--btn-r); font-size: 16px; font-weight: 700; cursor: pointer; font-family: var(--fb); transition: all .2s; margin-top: 8px; }
    .lp .submit-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
    .lp .success-box { background: rgba(50,200,130,.1); border: 1px solid rgba(50,200,130,.3); color: #32c882; border-radius: var(--r); padding: 24px; text-align: center; font-size: 16px; font-weight: 600; }
    .lp .sticky-cta { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 100; box-shadow: 0 8px 40px rgba(0,0,0,.5); }
    .lp .stock-badge { display: inline-flex; align-items: center; gap: 6px; color: var(--s); font-size: 13px; font-weight: 600; margin-top: 8px; }
    ${d.customCss || ""}
  `;

  useEffect(() => {
    if (!s.countdown.enabled || !s.countdown.endDate) return;
    const tick = () => {
      const diff = new Date(s.countdown.endDate) - Date.now();
      if (diff <= 0) { setTimeLeft({ h: 0, m: 0, s: 0 }); return; }
      setTimeLeft({ h: Math.floor(diff / 3600000), m: Math.floor((diff % 3600000) / 60000), s: Math.floor((diff % 60000) / 1000) });
    };
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, [s.countdown]);

  const handleSubmit = () => {
    const errs = {};
    Object.entries(f.fields).forEach(([key, field]) => {
      if (field.enabled && field.required && !formData[key]?.trim()) errs[key] = `${field.label} is required`;
    });
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const order = {
      id: uid(), pageId: page.id, storeId: page.storeId, createdAt: now(),
      status: "new", product: p.name, price: finalPrice,
      customer: formData,
    };
    if (onOrder) onOrder(order);
    else { DB.orders.save(order); DB.analytics.order(page.id); }
    setSubmitted(true);
    if (f.redirectUrl) setTimeout(() => window.location.href = f.redirectUrl, 2000);
  };

  const pad = (n) => String(n).padStart(2, "0");

  return (
    <div className="lp">
      <style>{css}</style>
      {s.offerBanner.enabled && <div className="lp offer-banner">{s.offerBanner.text}</div>}
      {s.countdown.enabled && (
        <div style={{ padding: "20px 20px 0", maxWidth: 1000, margin: "0 auto" }}>
          <div className="lp countdown-bar">
            {s.countdown.label} <span className="lp countdown-digits">{pad(timeLeft.h)}:{pad(timeLeft.m)}:{pad(timeLeft.s)}</span>
          </div>
        </div>
      )}
      {s.hero.enabled && (
        <div className="lp hero">
          <h1>{s.hero.headline}</h1>
          <p>{s.hero.sub}</p>
          <div className="lp price-block" style={{ justifyContent: "center" }}>
            <span className="lp price-main">${finalPrice.toFixed(2)}</span>
            {p.discount > 0 && <span className="lp price-orig">${p.price.toFixed(2)}</span>}
            {p.discount > 0 && <span className="lp price-badge">-{p.discount}{p.discountType === "percent" ? "%" : "$"}</span>}
          </div>
          {p.showStock && p.stock && <div className="lp stock-badge">⚠️ Only {p.stock} left!</div>}
          <div style={{ marginTop: 24 }}>
            <button className="lp cta-btn" onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}>{s.hero.ctaText}</button>
            <button className="lp cta-sec">{s.hero.ctaSecondary}</button>
          </div>
        </div>
      )}
      {s.trustBadges.enabled && (
        <div className="lp trust-badges">
          {["🔒 Secure Checkout", "🚚 Free Shipping", "↩️ Easy Returns", "⭐ 4.9/5 Rating"].map(b => (
            <div key={b} className="lp trust-badge">{b}</div>
          ))}
        </div>
      )}
      {s.gallery.enabled && (
        <div className="lp section">
          <div className="lp gallery">
            <div className="lp gallery-main">
              {s.gallery.images[currentImg]
                ? <img src={s.gallery.images[currentImg]} alt="" />
                : "🖼️"}
            </div>
            {s.gallery.images.length > 1 && (
              <div className="lp gallery-thumbs">
                {s.gallery.images.map((img, i) => (
                  <div key={i} className={`lp gallery-thumb ${i === currentImg ? "active" : ""}`} onClick={() => setCurrentImg(i)}>
                    <img src={img} alt="" />
                  </div>
                ))}
              </div>
            )}
            {s.gallery.video && (
              <div style={{ width: "100%", maxWidth: 560, marginTop: 20 }}>
                <iframe src={`https://www.youtube.com/embed/${s.gallery.video}`} style={{ width: "100%", aspectRatio: "16/9", border: "none", borderRadius: 12 }} allowFullScreen />
              </div>
            )}
          </div>
        </div>
      )}
      {s.features.enabled && (
        <div className="lp section">
          <h2 className="lp section-title">Why Choose Us</h2>
          <p className="lp section-sub">Everything you need, nothing you don't</p>
          <div className="lp features-grid">
            {s.features.items.map((item, i) => (
              <div key={i} className="lp feature-card">
                <div className="lp feature-icon">{item.icon}</div>
                <div className="lp feature-title">{item.title}</div>
                <div className="lp feature-desc">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {s.testimonials.enabled && (
        <div className="lp section">
          <h2 className="lp section-title">What Customers Say</h2>
          <p className="lp section-sub">Thousands of happy customers worldwide</p>
          <div className="lp testimonials-grid">
            {s.testimonials.items.map((t, i) => (
              <div key={i} className="lp testi-card">
                <div className="lp testi-stars">{"★".repeat(t.rating)}</div>
                <div className="lp testi-text">"{t.text}"</div>
                <div className="lp testi-name" style={{ marginTop: 12 }}>— {t.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {s.faq.enabled && (
        <div className="lp section">
          <h2 className="lp section-title">Frequently Asked Questions</h2>
          {s.faq.items.map((item, i) => (
            <div key={i} className="lp faq-item">
              <div className="lp faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {item.q}<span>{openFaq === i ? "−" : "+"}</span>
              </div>
              {openFaq === i && <div className="lp faq-a">{item.a}</div>}
            </div>
          ))}
        </div>
      )}
      <div className="lp section">
        <div className="lp form-section" ref={formRef}>
          {submitted ? (
            <div className="lp success-box">{f.successMsg}</div>
          ) : (
            <div className="lp form-card">
              <div className="lp form-title">Complete Your Order</div>
              <div className="lp price-block">
                <span className="lp price-main">${finalPrice.toFixed(2)}</span>
                {p.discount > 0 && <span className="lp price-orig">${p.price.toFixed(2)}</span>}
              </div>
              {Object.entries(f.fields).map(([key, field]) => {
                if (!field.enabled) return null;
                if (key === "city") return (
                  <div key={key} className="lp form-field">
                    <label className="lp form-label">{field.label}{field.required ? " *" : ""}</label>
                    <select className={`lp form-input ${errors[key] ? "error" : ""}`} value={formData[key] || ""} onChange={e => { setFormData({ ...formData, [key]: e.target.value }); setErrors({ ...errors, [key]: "" }); }}>
                      <option value="">Select city...</option>
                      {f.cities.map(c => <option key={c}>{c}</option>)}
                    </select>
                    {errors[key] && <div className="lp form-error">{errors[key]}</div>}
                  </div>
                );
                if (key === "notes") return (
                  <div key={key} className="lp form-field">
                    <label className="lp form-label">{field.label}</label>
                    <textarea className="lp form-input" rows={3} value={formData[key] || ""} onChange={e => setFormData({ ...formData, [key]: e.target.value })} />
                  </div>
                );
                return (
                  <div key={key} className="lp form-field">
                    <label className="lp form-label">{field.label}{field.required ? " *" : ""}</label>
                    <input className={`lp form-input ${errors[key] ? "error" : ""}`} value={formData[key] || ""} onChange={e => { setFormData({ ...formData, [key]: e.target.value }); setErrors({ ...errors, [key]: "" }); }} placeholder={field.label} />
                    {errors[key] && <div className="lp form-error">{errors[key]}</div>}
                  </div>
                );
              })}
              <button className="lp submit-btn" onClick={handleSubmit}>{f.submitLabel} →</button>
            </div>
          )}
        </div>
      </div>
      {!preview && <a href="#order" className="lp cta-btn sticky-cta" onClick={e => { e.preventDefault(); formRef.current?.scrollIntoView({ behavior: "smooth" }); }}>{s.hero.ctaText} ↓</a>}
    </div>
  );
}

// ─── VIEWS ─────────────────────────────────────────────────────────────────
function Dashboard({ stores, pages, orders, onNavigate }) {
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.price || 0), 0);
  const newOrders = orders.filter(o => o.status === "new").length;
  const analytics = DB.get("lpb_analytics") || {};
  const totalVisits = Object.values(analytics).reduce((s, a) => s + a.visits, 0);

  return (
    <div className="fade-in">
      <div className="stat-grid">
        {[
          { num: stores.length, lbl: "Stores", icon: "🏪", color: "#6c47ff" },
          { num: pages.length, lbl: "Landing Pages", icon: "📄", color: "#ff6b6b" },
          { num: totalOrders, lbl: "Total Orders", icon: "📦", color: "#32c882" },
          { num: newOrders, lbl: "New Orders", icon: "🔔", color: "#ffd93d" },
          { num: `$${totalRevenue.toFixed(0)}`, lbl: "Revenue", icon: "💰", color: "#00d4ff" },
          { num: totalVisits, lbl: "Page Visits", icon: "👁️", color: "#ff9f50" },
        ].map(s => (
          <div key={s.lbl} className="stat-card">
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div className="num" style={{ color: s.color }}>{s.num}</div>
            <div className="lbl">{s.lbl}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="card">
          <div className="flex items-center gap-2 mb-4" style={{ marginBottom: 16 }}>
            <span style={{ fontFamily: "var(--font)", fontWeight: 700 }}>Recent Orders</span>
            <span className="chip">{newOrders} new</span>
          </div>
          {orders.slice(-5).reverse().map(o => (
            <div key={o.id} className="flex items-center gap-2" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{o.customer?.fullName || "—"}</div>
                <div className="text-muted">{o.product} · {fmt(o.createdAt)}</div>
              </div>
              <span className={`badge badge-${o.status}`}>{o.status}</span>
            </div>
          ))}
          {!orders.length && <div className="empty-state"><div className="icon">📭</div>No orders yet</div>}
        </div>
        <div className="card">
          <div style={{ fontFamily: "var(--font)", fontWeight: 700, marginBottom: 16 }}>Top Pages by Visits</div>
          {pages.map(p => {
            const a = analytics[p.id] || { visits: 0, orders: 0 };
            const maxV = Math.max(...pages.map(pg => (analytics[pg.id] || {}).visits || 0), 1);
            return (
              <div key={p.id} style={{ marginBottom: 14 }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 13, flex: 1 }}>{p.name}</span>
                  <span className="text-muted">{a.visits} visits</span>
                </div>
                <div className="mini-bar"><div className="mini-bar-fill" style={{ width: `${(a.visits / maxV) * 100}%` }} /></div>
              </div>
            );
          })}
          {!pages.length && <div className="empty-state"><div className="icon">📊</div>No pages yet</div>}
        </div>
      </div>
    </div>
  );
}

function StoresView({ stores, pages, onEdit, onCreate, onDelete, onSelectStore }) {
  return (
    <div className="fade-in">
      <div className="flex items-center gap-2 mb-4" style={{ marginBottom: 20 }}>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={onCreate}>+ New Store</button>
      </div>
      {!stores.length && <div className="empty-state"><div className="icon">🏪</div><div>No stores yet. Create your first store!</div></div>}
      <div className="card-grid">
        {stores.map(store => {
          const storePages = pages.filter(p => p.storeId === store.id);
          return (
            <div key={store.id} className="card" style={{ cursor: "pointer" }} onClick={() => onSelectStore(store.id)}>
              <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏪</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontFamily: "var(--font)" }}>{store.name}</div>
                  <div className="text-muted">{store.currency}</div>
                </div>
              </div>
              <div className="flex items-center gap-2" style={{ color: "var(--muted)", fontSize: 13 }}>
                <span>📄 {storePages.length} pages</span>
                <span>·</span>
                <span>Created {new Date(store.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex gap-2 mt-2" style={{ marginTop: 14 }} onClick={e => e.stopPropagation()}>
                <button className="btn btn-ghost btn-sm" onClick={() => onEdit(store)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => onDelete(store.id)}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PagesView({ pages, stores, onEdit, onCreate, onDelete, onPreview, onClone, filterStore }) {
  const [search, setSearch] = useState("");
  const filtered = pages.filter(p =>
    (!filterStore || p.storeId === filterStore) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.slug.includes(search))
  );
  return (
    <div className="fade-in">
      <div className="flex items-center gap-2 mb-4" style={{ marginBottom: 20 }}>
        <input className="search-input" placeholder="Search pages..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 240 }} />
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={onCreate}>+ New Page</button>
      </div>
      {!filtered.length && <div className="empty-state"><div className="icon">📄</div><div>No pages found</div></div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Page</th><th>Store</th><th>Slug</th><th>Status</th><th>Visits</th><th>Orders</th><th></th></tr></thead>
          <tbody>
            {filtered.map(p => {
              const store = stores.find(s => s.id === p.storeId);
              const a = DB.analytics.get(p.id);
              return (
                <tr key={p.id}>
                  <td><div style={{ fontWeight: 600 }}>{p.name}</div><div className="text-muted">{p.product?.name}</div></td>
                  <td><div className="text-muted">{store?.name || "—"}</div></td>
                  <td><span className="font-mono text-sm" style={{ color: "var(--accent)" }}>/{p.slug}</span></td>
                  <td><span className={`badge badge-${p.status}`}>{p.status}</span></td>
                  <td>{a.visits}</td>
                  <td>{a.orders}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => onEdit(p)}>✏️ Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => onPreview(p)}>👁️</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => onClone(p)}>⧉</button>
                      <button className="btn btn-danger btn-sm" onClick={() => onDelete(p.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrdersView({ orders, pages, stores, onUpdate, onDelete }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPage, setFilterPage] = useState("");
  const [filterStore, setFilterStore] = useState("");
  const [editOrder, setEditOrder] = useState(null);

  const statuses = ["new", "confirmed", "shipped", "cancelled"];
  const filtered = orders.filter(o => {
    const term = search.toLowerCase();
    return (!filterStatus || o.status === filterStatus)
      && (!filterPage || o.pageId === filterPage)
      && (!filterStore || o.storeId === filterStore)
      && (!search || o.customer?.fullName?.toLowerCase().includes(term) || o.customer?.phone?.includes(term));
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const exportXLSX = () => {
    const rows = [["ID", "Date", "Product", "Store", "Name", "Phone", "City", "Price", "Status"],
      ...filtered.map(o => [o.id.slice(0, 8), fmt(o.createdAt), o.product, stores.find(s => s.id === o.storeId)?.name || "", o.customer?.fullName || "", o.customer?.phone || "", o.customer?.city || "", o.price, o.status])];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `orders-${Date.now()}.csv`; a.click();
  };

  return (
    <div className="fade-in">
      <div className="flex items-center gap-2 mb-4" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <input placeholder="Search name/phone..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 200 }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ maxWidth: 140 }}>
          <option value="">All Status</option>
          {statuses.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterStore} onChange={e => setFilterStore(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="">All Stores</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterPage} onChange={e => setFilterPage(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="">All Pages</option>
          {pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn btn-success btn-sm" onClick={exportXLSX}>⬇️ Export CSV</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Customer</th><th>Product</th><th>Phone</th><th>City</th><th>Price</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id}>
                <td className="text-muted" style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmt(o.createdAt)}</td>
                <td style={{ fontWeight: 600 }}>{o.customer?.fullName || "—"}</td>
                <td className="text-muted">{o.product}</td>
                <td className="font-mono" style={{ fontSize: 12 }}>{o.customer?.phone || "—"}</td>
                <td className="text-muted">{o.customer?.city || "—"}</td>
                <td style={{ fontWeight: 700, color: "var(--accent)" }}>${o.price?.toFixed(2)}</td>
                <td><span className={`badge badge-${o.status}`}>{o.status}</span></td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditOrder({ ...o })}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => onDelete(o.id)}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className="empty-state"><div className="icon">📭</div>No orders found</div>}
      </div>
      {editOrder && (
        <div className="modal-overlay" onClick={() => setEditOrder(null)}>
          <div className="modal fade-in" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Order</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditOrder(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field"><label>Customer Name</label><input value={editOrder.customer?.fullName || ""} onChange={e => setEditOrder({ ...editOrder, customer: { ...editOrder.customer, fullName: e.target.value } })} /></div>
              <div className="field"><label>Phone</label><input value={editOrder.customer?.phone || ""} onChange={e => setEditOrder({ ...editOrder, customer: { ...editOrder.customer, phone: e.target.value } })} /></div>
              <div className="field"><label>City</label><input value={editOrder.customer?.city || ""} onChange={e => setEditOrder({ ...editOrder, customer: { ...editOrder.customer, city: e.target.value } })} /></div>
              <div className="field"><label>Status</label>
                <select value={editOrder.status} onChange={e => setEditOrder({ ...editOrder, status: e.target.value })}>
                  {["new", "confirmed", "shipped", "cancelled"].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field"><label>Notes</label><textarea value={editOrder.customer?.notes || ""} onChange={e => setEditOrder({ ...editOrder, customer: { ...editOrder.customer, notes: e.target.value } })} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditOrder(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { onUpdate(editOrder); setEditOrder(null); }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PAGE BUILDER ──────────────────────────────────────────────────────────
function PageBuilder({ page: initialPage, stores, onSave, onBack }) {
  const [page, setPage] = useState(initialPage);
  const [activeTab, setActiveTab] = useState("design");
  const [previewMode, setPreviewMode] = useState("desktop");
  const [openSections, setOpenSections] = useState({ design: true });

  const update = useCallback((path, value) => {
    setPage(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      next.updatedAt = now();
      return next;
    });
  }, []);

  const toggleSection = (k) => setOpenSections(s => ({ ...s, [k]: !s[k] }));

  const sectionKeys = ["hero", "gallery", "features", "testimonials", "faq", "countdown", "offerBanner", "trustBadges"];
  const sectionLabels = { hero: "Hero", gallery: "Gallery", features: "Features", testimonials: "Testimonials", faq: "FAQ", countdown: "Countdown", offerBanner: "Offer Banner", trustBadges: "Trust Badges" };

  const tabs = [
    { id: "design", label: "🎨 Design" },
    { id: "product", label: "📦 Product" },
    { id: "sections", label: "🧱 Sections" },
    { id: "form", label: "📋 Form" },
    { id: "seo", label: "🔍 SEO" },
  ];

  const ColorRow = ({ label, path }) => (
    <div className="color-row">
      <span className="color-label">{label}</span>
      <div className="color-input-wrap">
        <input type="color" value={path.split(".").reduce((o, k) => o?.[k], page)} onChange={e => update(path, e.target.value)} />
        <input value={path.split(".").reduce((o, k) => o?.[k], page)} onChange={e => update(path, e.target.value)} style={{ fontFamily: "monospace", fontSize: 12 }} />
      </div>
    </div>
  );

  const Field = ({ label, path, type = "text", options }) => {
    const val = path.split(".").reduce((o, k) => o?.[k], page);
    return (
      <div className="field">
        {label && <label>{label}</label>}
        {type === "select" ? <select value={val || ""} onChange={e => update(path, e.target.value)}>{options.map(o => <option key={o.v || o} value={o.v || o}>{o.l || o}</option>)}</select>
          : type === "textarea" ? <textarea value={val || ""} onChange={e => update(path, e.target.value)} />
          : type === "toggle" ? (
            <label className="toggle"><input type="checkbox" checked={!!val} onChange={e => update(path, e.target.checked)} /><span className="toggle-slider" /></label>
          ) : <input type={type} value={val ?? ""} onChange={e => update(path, type === "number" ? Number(e.target.value) : e.target.value)} />}
      </div>
    );
  };

  const PanelSection = ({ id, title, children }) => (
    <div className="panel-section">
      <div className="panel-section-header" onClick={() => toggleSection(id)}>
        <span>{title}</span>
        <span style={{ color: "var(--muted)" }}>{openSections[id] ? "−" : "+"}</span>
      </div>
      {openSections[id] && <div className="panel-section-body">{children}</div>}
    </div>
  );

  const ArrayEditor = ({ path, newItem, renderItem }) => {
    const arr = path.split(".").reduce((o, k) => o?.[k], page) || [];
    const addItem = () => update(path, [...arr, newItem]);
    const removeItem = (i) => update(path, arr.filter((_, idx) => idx !== i));
    const updateItem = (i, item) => { const next = [...arr]; next[i] = item; update(path, next); };
    return (
      <div>
        {arr.map((item, i) => <div key={i}>{renderItem(item, i, (item) => updateItem(i, item), () => removeItem(i))}</div>)}
        <button className="btn btn-ghost btn-sm mt-2" style={{ marginTop: 8 }} onClick={addItem}>+ Add</button>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 56px)" }}>
      {/* Builder Topbar */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "0 16px", display: "flex", alignItems: "center", gap: 12, height: 48, flexShrink: 0 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <input value={page.name} onChange={e => update("name", e.target.value)} style={{ background: "transparent", border: "none", fontFamily: "var(--font)", fontWeight: 700, fontSize: 14, width: 200 }} />
        <div className="flex gap-2 items-center" style={{ marginLeft: 8 }}>
          <span className="font-mono text-sm" style={{ color: "var(--muted)" }}>/{page.slug}</span>
        </div>
        <div style={{ flex: 1 }} />
        <select value={page.status} onChange={e => update("status", e.target.value)} style={{ maxWidth: 120 }}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        <button className="btn btn-primary btn-sm" onClick={() => onSave(page)}>💾 Save</button>
      </div>
      {/* Tabs */}
      <div style={{ display: "flex", background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "0 8px", flexShrink: 0 }}>
        {tabs.map(t => <div key={t.id} className={`tab ${activeTab === t.id ? "active" : ""}`} style={{ fontSize: 12 }} onClick={() => setActiveTab(t.id)}>{t.label}</div>)}
        <div style={{ flex: 1 }} />
        {["desktop", "mobile"].map(m => <div key={m} className={`tab ${previewMode === m ? "active" : ""}`} style={{ fontSize: 12 }} onClick={() => setPreviewMode(m)}>{m === "desktop" ? "🖥️" : "📱"}</div>)}
      </div>
      {/* Layout */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Panel */}
        <div style={{ width: 300, background: "var(--surface)", borderRight: "1px solid var(--border)", overflowY: "auto", flexShrink: 0 }}>
          {activeTab === "design" && (
            <>
              <PanelSection id="colors" title="Colors">
                <ColorRow label="Primary" path="design.primary" />
                <ColorRow label="Secondary" path="design.secondary" />
                <ColorRow label="Accent" path="design.accent" />
                <ColorRow label="Background" path="design.bg" />
                <ColorRow label="Surface" path="design.surface" />
                <ColorRow label="Text" path="design.text" />
                <ColorRow label="Text Muted" path="design.textMuted" />
                <div className="field" style={{ marginTop: 12 }}>
                  <label>BG Gradient</label>
                  <label className="toggle"><input type="checkbox" checked={!!page.design.bgGradient} onChange={e => update("design.bgGradient", e.target.checked)} /><span className="toggle-slider" /></label>
                </div>
              </PanelSection>
              <PanelSection id="typography" title="Typography">
                <Field label="Display Font" path="design.fontFamily" type="select" options={["Sora", "Playfair Display", "Space Grotesk", "Bebas Neue", "Oswald", "Raleway"].map(f => ({ v: f, l: f }))} />
                <Field label="Body Font" path="design.fontBody" type="select" options={["DM Sans", "Lato", "Nunito", "Source Sans Pro", "Open Sans"].map(f => ({ v: f, l: f }))} />
              </PanelSection>
              <PanelSection id="buttons" title="Buttons & Layout">
                <Field label="Button Style" path="design.buttonStyle" type="select" options={[{ v: "rounded", l: "Rounded (Pill)" }, { v: "soft", l: "Soft (12px)" }, { v: "square", l: "Square" }]} />
                <Field label="Border Radius (px)" path="design.borderRadius" type="number" />
              </PanelSection>
              <PanelSection id="customcss" title="Custom CSS">
                <Field path="design.customCss" type="textarea" />
              </PanelSection>
            </>
          )}
          {activeTab === "product" && (
            <>
              <PanelSection id="prod" title="Product Info">
                <Field label="Product Name" path="product.name" />
                <Field label="Description" path="product.description" type="textarea" />
                <Field label="Price ($)" path="product.price" type="number" />
              </PanelSection>
              <PanelSection id="pricing" title="Pricing & Discount">
                <Field label="Discount" path="product.discount" type="number" />
                <Field label="Discount Type" path="product.discountType" type="select" options={[{ v: "percent", l: "Percentage (%)" }, { v: "fixed", l: "Fixed Amount ($)" }]} />
              </PanelSection>
              <PanelSection id="stock" title="Stock">
                <Field label="Show Stock Warning" path="product.showStock" type="toggle" />
                <Field label="Stock Label (e.g. Only 5 left)" path="product.stock" />
              </PanelSection>
              <PanelSection id="slug" title="URL Slug">
                <Field label="Slug" path="slug" />
                <div className="text-muted">Public URL: /{page.slug}</div>
              </PanelSection>
            </>
          )}
          {activeTab === "sections" && (
            <>
              <PanelSection id="sectoggle" title="Enable/Disable Sections">
                {sectionKeys.map(k => (
                  <div key={k} className="section-toggle-row">
                    <span style={{ fontSize: 13 }}>{sectionLabels[k]}</span>
                    <label className="toggle"><input type="checkbox" checked={!!page.sections[k]?.enabled} onChange={e => update(`sections.${k}.enabled`, e.target.checked)} /><span className="toggle-slider" /></label>
                  </div>
                ))}
              </PanelSection>
              {page.sections.hero.enabled && (
                <PanelSection id="hero" title="Hero Section">
                  <Field label="Headline" path="sections.hero.headline" type="textarea" />
                  <Field label="Sub-headline" path="sections.hero.sub" />
                  <Field label="CTA Button" path="sections.hero.ctaText" />
                  <Field label="Secondary Button" path="sections.hero.ctaSecondary" />
                </PanelSection>
              )}
              {page.sections.gallery.enabled && (
                <PanelSection id="gallery" title="Gallery">
                  <Field label="YouTube Video ID" path="sections.gallery.video" />
                  <div className="text-muted">Image URLs (one per line)</div>
                  <textarea value={(page.sections.gallery.images || []).join("\n")} onChange={e => update("sections.gallery.images", e.target.value.split("\n").filter(Boolean))} placeholder="https://example.com/img.jpg" style={{ marginTop: 6 }} />
                </PanelSection>
              )}
              {page.sections.features.enabled && (
                <PanelSection id="features" title="Features">
                  <ArrayEditor path="sections.features.items" newItem={{ icon: "✦", title: "Feature", desc: "Description" }}
                    renderItem={(item, i, update, remove) => (
                      <div key={i} style={{ background: "var(--surface2)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                        <div className="grid-2">
                          <input value={item.icon} onChange={e => update({ ...item, icon: e.target.value })} placeholder="Icon" />
                          <input value={item.title} onChange={e => update({ ...item, title: e.target.value })} placeholder="Title" />
                        </div>
                        <input value={item.desc} onChange={e => update({ ...item, desc: e.target.value })} placeholder="Description" style={{ marginTop: 6 }} />
                        <button className="btn btn-danger btn-sm" style={{ marginTop: 6 }} onClick={remove}>Remove</button>
                      </div>
                    )}
                  />
                </PanelSection>
              )}
              {page.sections.testimonials.enabled && (
                <PanelSection id="testimonials" title="Testimonials">
                  <ArrayEditor path="sections.testimonials.items" newItem={{ name: "Customer", rating: 5, text: "Great product!" }}
                    renderItem={(item, i, upd, remove) => (
                      <div key={i} style={{ background: "var(--surface2)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                        <div className="grid-2">
                          <input value={item.name} onChange={e => upd({ ...item, name: e.target.value })} placeholder="Name" />
                          <input type="number" value={item.rating} min={1} max={5} onChange={e => upd({ ...item, rating: Number(e.target.value) })} placeholder="Rating" />
                        </div>
                        <textarea value={item.text} onChange={e => upd({ ...item, text: e.target.value })} placeholder="Review" style={{ marginTop: 6 }} />
                        <button className="btn btn-danger btn-sm" style={{ marginTop: 6 }} onClick={remove}>Remove</button>
                      </div>
                    )}
                  />
                </PanelSection>
              )}
              {page.sections.faq.enabled && (
                <PanelSection id="faq" title="FAQ">
                  <ArrayEditor path="sections.faq.items" newItem={{ q: "Question?", a: "Answer." }}
                    renderItem={(item, i, upd, remove) => (
                      <div key={i} style={{ background: "var(--surface2)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                        <input value={item.q} onChange={e => upd({ ...item, q: e.target.value })} placeholder="Question" />
                        <textarea value={item.a} onChange={e => upd({ ...item, a: e.target.value })} placeholder="Answer" style={{ marginTop: 6 }} />
                        <button className="btn btn-danger btn-sm" style={{ marginTop: 6 }} onClick={remove}>Remove</button>
                      </div>
                    )}
                  />
                </PanelSection>
              )}
              {page.sections.countdown.enabled && (
                <PanelSection id="countdown" title="Countdown Timer">
                  <Field label="Label" path="sections.countdown.label" />
                  <Field label="End Date/Time" path="sections.countdown.endDate" type="datetime-local" />
                </PanelSection>
              )}
              {page.sections.offerBanner.enabled && (
                <PanelSection id="offerBanner" title="Offer Banner">
                  <Field label="Banner Text" path="sections.offerBanner.text" />
                </PanelSection>
              )}
            </>
          )}
          {activeTab === "form" && (
            <>
              <PanelSection id="formfields" title="Form Fields">
                {Object.entries(page.form.fields).map(([key, field]) => (
                  <div key={key} style={{ background: "var(--surface2)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                    <div className="flex items-center gap-2">
                      <label className="toggle"><input type="checkbox" checked={field.enabled} onChange={e => update(`form.fields.${key}.enabled`, e.target.checked)} /><span className="toggle-slider" /></label>
                      <span style={{ fontSize: 13, flex: 1, fontWeight: 600 }}>{field.label}</span>
                      {field.enabled && <label className="toggle"><input type="checkbox" checked={field.required} onChange={e => update(`form.fields.${key}.required`, e.target.checked)} /><span className="toggle-slider" /></label>}
                      {field.enabled && <span className="text-muted text-sm">req</span>}
                    </div>
                    {field.enabled && <input value={field.label} onChange={e => update(`form.fields.${key}.label`, e.target.value)} style={{ marginTop: 8 }} placeholder="Field label" />}
                  </div>
                ))}
              </PanelSection>
              <PanelSection id="formcities" title="City Options">
                <div className="text-muted text-sm" style={{ marginBottom: 6 }}>One city per line</div>
                <textarea value={(page.form.cities || []).join("\n")} onChange={e => update("form.cities", e.target.value.split("\n").filter(Boolean))} />
              </PanelSection>
              <PanelSection id="formsettings" title="Form Settings">
                <Field label="Submit Button Label" path="form.submitLabel" />
                <Field label="Success Message" path="form.successMsg" type="textarea" />
                <Field label="Redirect URL (optional)" path="form.redirectUrl" />
              </PanelSection>
            </>
          )}
          {activeTab === "seo" && (
            <PanelSection id="seo" title="SEO">
              <Field label="Meta Title" path="seo.title" />
              <Field label="Meta Description" path="seo.description" type="textarea" />
              <Field label="Page Slug" path="slug" />
            </PanelSection>
          )}
        </div>
        {/* Preview */}
        <div style={{ flex: 1, overflowY: "auto", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", padding: previewMode === "mobile" ? "20px" : "0" }}>
          <div style={previewMode === "mobile" ? { width: 390, border: "8px solid var(--border)", borderRadius: 40, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.5)" } : { width: "100%" }}>
            <LandingPagePreview page={page} preview={true} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MODALS ────────────────────────────────────────────────────────────────
function StoreModal({ store, onSave, onClose }) {
  const [s, setS] = useState(store || defaultStore());
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal fade-in" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{store ? "Edit Store" : "New Store"}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field"><label>Store Name</label><input value={s.name} onChange={e => setS({ ...s, name: e.target.value })} /></div>
          <div className="field"><label>Currency</label><select value={s.currency} onChange={e => setS({ ...s, currency: e.target.value })}>{["USD", "EUR", "GBP", "SAR", "AED", "EGP"].map(c => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label>WhatsApp Number</label><input value={s.whatsapp} onChange={e => setS({ ...s, whatsapp: e.target.value })} placeholder="+1234567890" /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(s)}>Save Store</button>
        </div>
      </div>
    </div>
  );
}

function NewPageModal({ stores, onSave, onClose }) {
  const [name, setName] = useState("New Landing Page");
  const [storeId, setStoreId] = useState(stores[0]?.id || "");
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal fade-in" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Landing Page</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field"><label>Page Name</label><input value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="field"><label>Store</label><select value={storeId} onChange={e => setStoreId(e.target.value)}>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          {!stores.length && <div style={{ color: "var(--accent2)", fontSize: 13 }}>⚠️ Create a store first</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!storeId} onClick={() => { const p = defaultPage(storeId); p.name = name; onSave(p); }}>Create Page</button>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ page, onClose, onOrder }) {
  const url = `${window.location.origin}${window.location.pathname}#/page/${page.slug}`;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal fade-in" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Preview & Share: {page.name}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            <input value={url} readOnly style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }} />
            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(url)}>📋 Copy</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(url)}`} target="_blank" className="btn btn-success btn-sm">WhatsApp</a>
          </div>
        </div>
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          <LandingPagePreview page={page} preview={true} onOrder={onOrder} />
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────────────────────
export default function App() {
  const [stores, setStores] = useState([]);
  const [pages, setPages] = useState([]);
  const [orders, setOrders] = useState([]);
  const [view, setView] = useState("dashboard");
  const [editingPage, setEditingPage] = useState(null);
  const [editingStore, setEditingStore] = useState(null);
  const [showNewPage, setShowNewPage] = useState(false);
  const [showNewStore, setShowNewStore] = useState(false);
  const [previewPage, setPreviewPage] = useState(null);
  const [filterStore, setFilterStore] = useState("");
  const [publicPage, setPublicPage] = useState(null);

  useEffect(() => {
    DB.init();
    // Seed demo data if empty
    if (!DB.stores.all().length) {
      const store = defaultStore();
      store.name = "Demo Store";
      DB.stores.save(store);
      const page = defaultPage(store.id);
      page.name = "Demo Product Page";
      page.status = "published";
      DB.pages.save(page);
    }
    reload();
    // Check for public page route
    const hash = window.location.hash;
    if (hash.startsWith("#/page/")) {
      const slug = hash.replace("#/page/", "");
      const p = DB.pages.bySlug(slug);
      if (p) { DB.analytics.visit(p.id); setPublicPage(p); }
    }
  }, []);

  const reload = () => {
    setStores(DB.stores.all());
    setPages(DB.pages.all());
    setOrders(DB.orders.all());
  };

  const saveStore = (s) => { DB.stores.save(s); reload(); setEditingStore(null); setShowNewStore(false); };
  const deleteStore = (id) => { if (confirm("Delete store and all its pages?")) { DB.stores.delete(id); DB.pages.byStore(id).forEach(p => DB.pages.delete(p.id)); reload(); } };
  const savePage = (p) => { DB.pages.save(p); reload(); setEditingPage(null); };
  const deletePage = (id) => { if (confirm("Delete this page?")) { DB.pages.delete(id); reload(); } };
  const clonePage = (p) => { const clone = JSON.parse(JSON.stringify(p)); clone.id = uid(); clone.name += " (Copy)"; clone.slug += "-copy"; clone.status = "draft"; clone.createdAt = now(); clone.updatedAt = now(); DB.pages.save(clone); reload(); };
  const updateOrder = (o) => { DB.orders.update(o); reload(); };
  const deleteOrder = (id) => { if (confirm("Delete this order?")) { DB.orders.delete(id); reload(); } };

  if (publicPage) {
    return (
      <div>
        <style>{G.fonts}</style>
        <LandingPagePreview page={publicPage} onOrder={(o) => { DB.orders.save(o); DB.analytics.order(publicPage.id); }} />
      </div>
    );
  }

  if (editingPage) {
    return (
      <div>
        <style>{G.fonts + G.css}</style>
        <PageBuilder page={editingPage} stores={stores} onSave={p => { savePage(p); }} onBack={() => setEditingPage(null)} />
      </div>
    );
  }

  const navItems = [
    { id: "dashboard", icon: "⬡", label: "Dashboard" },
    { id: "stores", icon: "🏪", label: "Stores" },
    { id: "pages", icon: "📄", label: "Pages" },
    { id: "orders", icon: "📦", label: "Orders" },
  ];

  const titleMap = { dashboard: "Dashboard", stores: "Stores", pages: "Landing Pages", orders: "Orders" };

  return (
    <div>
      <style>{G.fonts + G.css}</style>
      <div className="app">
        <div className="sidebar">
          <div className="sidebar-logo">
            <h1>PageForge</h1>
            <span>Landing Page Builder</span>
          </div>
          <nav className="sidebar-nav">
            <div className="nav-section">Navigation</div>
            {navItems.map(item => (
              <div key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => setView(item.id)}>
                <span className="ni">{item.icon}</span>
                <span>{item.label}</span>
                {item.id === "orders" && orders.filter(o => o.status === "new").length > 0 && (
                  <span style={{ marginLeft: "auto", background: "var(--accent)", color: "#fff", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{orders.filter(o => o.status === "new").length}</span>
                )}
              </div>
            ))}
            <div className="nav-section" style={{ marginTop: 16 }}>Stores</div>
            {stores.map(s => (
              <div key={s.id} className={`nav-item ${filterStore === s.id && view === "pages" ? "active" : ""}`} onClick={() => { setFilterStore(s.id); setView("pages"); }}>
                <span className="ni">🏪</span>
                <span style={{ fontSize: 13 }}>{s.name}</span>
                <span className="text-muted" style={{ marginLeft: "auto", fontSize: 11 }}>{pages.filter(p => p.storeId === s.id).length}</span>
              </div>
            ))}
          </nav>
          <div style={{ padding: 16, borderTop: "1px solid var(--border)" }}>
            <div className="text-muted text-sm" style={{ marginBottom: 8 }}>PageForge v1.0</div>
            <button className="btn btn-ghost btn-sm" style={{ width: "100%" }} onClick={() => {
              const bk = { stores: DB.stores.all(), pages: DB.pages.all(), orders: DB.orders.all() };
              const blob = new Blob([JSON.stringify(bk, null, 2)], { type: "application/json" });
              const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
              a.download = `pageforge-backup-${Date.now()}.json`; a.click();
            }}>⬇️ Backup Data</button>
          </div>
        </div>
        <div className="main">
          <div className="topbar">
            <h2>{titleMap[view]}</h2>
            {view === "pages" && filterStore && (
              <span className="chip">{stores.find(s => s.id === filterStore)?.name} <button style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", marginLeft: 4 }} onClick={() => setFilterStore("")}>✕</button></span>
            )}
            <div style={{ flex: 1 }} />
            {view === "stores" && <button className="btn btn-primary btn-sm" onClick={() => setShowNewStore(true)}>+ Store</button>}
            {view === "pages" && <button className="btn btn-primary btn-sm" onClick={() => setShowNewPage(true)}>+ Page</button>}
          </div>
          <div className="content">
            {view === "dashboard" && <Dashboard stores={stores} pages={pages} orders={orders} onNavigate={setView} />}
            {view === "stores" && <StoresView stores={stores} pages={pages} onEdit={s => setEditingStore(s)} onCreate={() => setShowNewStore(true)} onDelete={deleteStore} onSelectStore={id => { setFilterStore(id); setView("pages"); }} />}
            {view === "pages" && <PagesView pages={pages} stores={stores} filterStore={filterStore} onEdit={p => setEditingPage(p)} onCreate={() => setShowNewPage(true)} onDelete={deletePage} onPreview={p => setPreviewPage(p)} onClone={clonePage} />}
            {view === "orders" && <OrdersView orders={orders} pages={pages} stores={stores} onUpdate={updateOrder} onDelete={deleteOrder} />}
          </div>
        </div>
      </div>
      {showNewStore && <StoreModal onSave={saveStore} onClose={() => setShowNewStore(false)} />}
      {editingStore && <StoreModal store={editingStore} onSave={saveStore} onClose={() => setEditingStore(null)} />}
      {showNewPage && <NewPageModal stores={stores} onSave={p => { DB.pages.save(p); reload(); setShowNewPage(false); setEditingPage(p); }} onClose={() => setShowNewPage(false)} />}
      {previewPage && <PreviewModal page={previewPage} onClose={() => setPreviewPage(null)} onOrder={o => { DB.orders.save(o); DB.analytics.order(previewPage.id); reload(); }} />}
    </div>
  );
}
