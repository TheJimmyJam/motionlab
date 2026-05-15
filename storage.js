/**
 * Jankless — History storage abstraction
 *
 * Two backends behind one interface:
 *   - LocalHistoryStore     (active by default; uses localStorage)
 *   - SupabaseHistoryStore  (activates when window.JANKLESS_CONFIG.supabase
 *                            is present AND the @supabase/supabase-js client
 *                            has been loaded onto the page)
 *
 * To enable Supabase later:
 *   1. Add the supabase-js script to index.html:
 *        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   2. Set the config before app.js runs:
 *        window.JANKLESS_CONFIG = {
 *          supabase: { url: '…', anonKey: '…', table: 'jankless_history' }
 *        };
 *   3. Create the table:
 *        create table jankless_history (
 *          id          uuid primary key default gen_random_uuid(),
 *          user_id     uuid references auth.users(id),
 *          prompt      text not null,
 *          code        text not null,
 *          duration    numeric,
 *          ease        text,
 *          stagger     numeric,
 *          loop        boolean,
 *          yoyo        boolean,
 *          created_at  timestamptz default now()
 *        );
 *      -- Optional RLS: each user sees only their own rows.
 *
 * The interface every store implements:
 *   name                 → 'local' | 'supabase'
 *   async list()         → Entry[]   (newest first)
 *   async add(entry)     → Entry
 *   async remove(id)     → void
 *   async clear()        → void
 *
 * Entry shape:
 *   { id, prompt, code, duration, ease, stagger, loop, yoyo, createdAt }
 */

(function () {
  const LOCAL_KEY = 'jankless-history';
  const MAX_LOCAL = 50;

  // ─── Local (browser) backend ────────────────────────────────────────────────

  class LocalHistoryStore {
    constructor() { this.name = 'local'; }

    async list() {
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        console.warn('[Jankless] localStorage read failed:', e);
        return [];
      }
    }

    async add(entry) {
      const list = await this.list();
      const newEntry = {
        id:        'l_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        createdAt: Date.now(),
        ...entry,
      };
      list.unshift(newEntry);
      if (list.length > MAX_LOCAL) list.length = MAX_LOCAL;
      this._save(list);
      return newEntry;
    }

    async remove(id) {
      const list = await this.list();
      this._save(list.filter(e => e.id !== id));
    }

    async clear() {
      localStorage.removeItem(LOCAL_KEY);
    }

    _save(list) {
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
      } catch (e) {
        console.warn('[Jankless] localStorage write failed (quota?):', e);
      }
    }
  }

  // ─── Supabase backend (stub-ready) ──────────────────────────────────────────

  class SupabaseHistoryStore {
    constructor(client, table) {
      this.name   = 'supabase';
      this.client = client;
      this.table  = table || 'jankless_history';
    }

    async list() {
      const { data, error } = await this.client
        .from(this.table)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []).map(this._fromRow);
    }

    async add(entry) {
      const row = {
        prompt:   entry.prompt,
        code:     entry.code,
        duration: entry.duration,
        ease:     entry.ease,
        stagger:  entry.stagger,
        loop:     entry.loop,
        yoyo:     entry.yoyo,
      };
      const { data, error } = await this.client
        .from(this.table)
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      return this._fromRow(data);
    }

    async remove(id) {
      const { error } = await this.client.from(this.table).delete().eq('id', id);
      if (error) throw error;
    }

    async clear() {
      // Deletes the current user's rows. Tighten/loosen via Supabase RLS.
      const { error } = await this.client.from(this.table).delete().neq('id', '');
      if (error) throw error;
    }

    _fromRow(r) {
      return {
        id:        r.id,
        prompt:    r.prompt,
        code:      r.code,
        duration:  r.duration,
        ease:      r.ease,
        stagger:   r.stagger,
        loop:      r.loop,
        yoyo:      r.yoyo,
        createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      };
    }
  }

  // ─── Factory ────────────────────────────────────────────────────────────────

  function createStore() {
    const cfg = (window.JANKLESS_CONFIG && window.JANKLESS_CONFIG.supabase) || null;

    if (cfg && cfg.url && cfg.anonKey) {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        try {
          const client = window.supabase.createClient(cfg.url, cfg.anonKey);
          return new SupabaseHistoryStore(client, cfg.table);
        } catch (e) {
          console.warn('[Jankless] Supabase init failed — using local store. Error:', e);
        }
      } else {
        console.warn('[Jankless] Supabase config present but supabase-js not loaded — using local store.');
      }
    }
    return new LocalHistoryStore();
  }

  window.JanklessStorage = {
    createStore,
    LocalHistoryStore,
    SupabaseHistoryStore,
  };
})();
