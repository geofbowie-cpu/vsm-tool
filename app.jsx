// ═══════════════════════════════════════════════════════════════
// VSG Flow Tracker · app.jsx
// Vanilla React 18 + Babel + Supabase JS v2
// ═══════════════════════════════════════════════════════════════

const { useState, useEffect, useRef, useCallback, useMemo } = React;

// ─── Supabase init ───────────────────────────────────────────
let _sb = null;

const getCfg = () => {
  try { return JSON.parse(localStorage.getItem('vsm-cfg') || '{}'); }
  catch { return {}; }
};

const initSb = (url, key) => {
  _sb = supabase.createClient(url, key);
  return _sb;
};

const savedCfg = getCfg();
if (savedCfg.url && savedCfg.key) initSb(savedCfg.url, savedCfg.key);

// ─── Duration & stats helpers ────────────────────────────────
const stageDuration = (stage) => {
  if (stage.touch_time_min) return stage.touch_time_min;
  if (!stage.started_at) return 0;
  const end = stage.ended_at ? new Date(stage.ended_at) : new Date();
  return Math.max(0, Math.round((end - new Date(stage.started_at)) / 60000));
};

const fmtDur = (min) => {
  if (!min) return '—';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr ? `${d}d ${hr}h` : `${d}d`;
};

const campaignStats = (stages) => {
  if (!stages || !stages.length) return { total: 0, wait: 0, value: 0, efficiency: 0 };
  const total = stages.reduce((s, st) => s + stageDuration(st), 0);
  const wait  = stages.filter(s => s.status === 'wait').reduce((s, st) => s + stageDuration(st), 0);
  const value = total - wait;
  const efficiency = total > 0 ? Math.round((value / total) * 100) : 0;
  return { total, wait, value, efficiency };
};

const effClass = (pct) => pct >= 60 ? 'good' : pct >= 40 ? 'warn' : 'bad';

// ─── Data layer ──────────────────────────────────────────────
const db = {
  async getCampaigns() {
    const { data, error } = await _sb.from('campaigns')
      .select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async createCampaign(fields) {
    const { data, error } = await _sb.from('campaigns')
      .insert(fields).select().single();
    if (error) throw error;
    return data;
  },
  async updateCampaign(id, fields) {
    const { data, error } = await _sb.from('campaigns')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteCampaign(id) {
    const { error } = await _sb.from('campaigns').delete().eq('id', id);
    if (error) throw error;
  },
  async getStages(campaignId) {
    const { data, error } = await _sb.from('stages')
      .select('*').eq('campaign_id', campaignId).order('order_index');
    if (error) throw error;
    return data;
  },
  async createStage(fields) {
    const { data, error } = await _sb.from('stages').insert(fields).select().single();
    if (error) throw error;
    return data;
  },
  async updateStage(id, fields) {
    const { data, error } = await _sb.from('stages').update(fields).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteStage(id) {
    const { error } = await _sb.from('stages').delete().eq('id', id);
    if (error) throw error;
  },
  async getTemplates() {
    const { data, error } = await _sb.from('phase_templates')
      .select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async createTemplate(fields) {
    const { data, error } = await _sb.from('phase_templates').insert(fields).select().single();
    if (error) throw error;
    return data;
  },
  async deleteTemplate(id) {
    const { error } = await _sb.from('phase_templates').delete().eq('id', id);
    if (error) throw error;
  },
};

// ─── Ideal campaign targets ───────────────────────────────────
// Best-practice target durations per stage (in days).
// These define what "good" looks like for future campaigns.
const IDEAL_MAP = {
  'Reddy Ice ABM': [
    { name: 'Brief & Strategy', days: 2,  status: 'active' },
    { name: 'Creative',         days: 5,  status: 'active' },
    { name: 'Digital / Web',    days: 3,  status: 'active' },
    { name: 'Collateral',       days: 2,  status: 'active' },
    { name: 'Ad Build',         days: 3,  status: 'active' },
    { name: 'Review',           days: 1,  status: 'wait'   },
  ],
};

// ─── ClickUp sync ────────────────────────────────────────────
const CU_LIST_ID = '901113342672'; // Marketing Team › Campaigns › Campaign Tasks

// Campaign definitions: tag → name + stage groupings
// Each stage lists the ClickUp task IDs that belong to it.
// Add new campaigns here as the team tags more work in ClickUp.
const CAMPAIGN_DEFS = [
  {
    tag:   'reddy-ice-campaign',
    name:  'Reddy Ice ABM',
    owner: 'Andrea Gorder, Lexi Del Rosso, grace baker',
    stages: [
      { name: 'Brief & Strategy', ids: ['868jk3yh7','868jggwdu','868jghc1p'], order: 0 },
      { name: 'Creative',         ids: ['868jm577q','868jhkh7g','868jhkgyy','868jhkfua'], order: 1 },
      { name: 'Digital / Web',    ids: ['868jdqb8a','868j8a6tb'], order: 2 },
      { name: 'Collateral',       ids: ['868jdp28a'], order: 3 },
      { name: 'Ad Build',         ids: ['868jnw2nh'], order: 4 },
      { name: 'Review',           ids: ['868jp1j39'], order: 5 },
    ],
  },
];

const getCuKey = () => {
  try { return JSON.parse(localStorage.getItem('vsm-cu') || '{}').key || ''; }
  catch { return ''; }
};
const saveCuKey = (key) => localStorage.setItem('vsm-cu', JSON.stringify({ key }));

const cuHeaders = (key) => ({ Authorization: key, 'Content-Type': 'application/json' });

const msToIso = (ms) => ms ? new Date(parseInt(ms)).toISOString() : null;

// Compute stage timing and status from a group of ClickUp tasks
function stageFromTasks(tasks) {
  const statuses = tasks.map(t => t.status?.status || 'to do');
  const created  = tasks.map(t => parseInt(t.date_created)).filter(Boolean);
  const allDone  = statuses.every(s => s === 'complete' || s === 'closed');
  const dones    = allDone
    ? tasks.map(t => parseInt(t.date_done) || parseInt(t.date_closed) || parseInt(t.due_date)).filter(Boolean)
    : [];

  const vstatus  = statuses.some(s => s === 'in progress') ? 'active'
                 : statuses.every(s => s === 'to do' || s === 'on hold') ? 'wait'
                 : 'active';

  return {
    status:     vstatus,
    started_at: created.length ? new Date(Math.min(...created)).toISOString() : null,
    ended_at:   dones.length   ? new Date(Math.max(...dones)).toISOString()   : null,
  };
}

async function syncClickUp(key, onProgress) {
  onProgress('Fetching tasks from ClickUp…');

  // Fetch all tasks in the list (we need them to look up by ID)
  const allTasks = [];
  let page = 0;
  while (true) {
    const res = await fetch(
      `https://api.clickup.com/api/v2/list/${CU_LIST_ID}/task?subtasks=true&include_closed=true&page=${page}`,
      { headers: cuHeaders(key) }
    );
    if (!res.ok) throw new Error(`ClickUp API ${res.status}`);
    const data = await res.json();
    if (!data.tasks?.length) break;
    allTasks.push(...data.tasks);
    if (data.tasks.length < 100) break;
    page++;
  }
  const byId = Object.fromEntries(allTasks.map(t => [t.id, t]));

  // Wipe campaigns that were auto-synced (clickup_id is a task ID, not a tag)
  // Keep any manually created campaigns (no clickup_id)
  const { data: existing } = await _sb.from('campaigns').select('id, clickup_id');
  const toDelete = (existing || []).filter(c => c.clickup_id && !c.clickup_id.includes('-campaign'));
  for (const c of toDelete) {
    await _sb.from('campaigns').delete().eq('id', c.id);
  }

  let synced = 0;
  for (const def of CAMPAIGN_DEFS) {
    onProgress(`Building "${def.name}"…`);

    // Upsert the campaign itself
    const { data: existingCamp } = await _sb.from('campaigns')
      .select('id').eq('clickup_id', def.tag).maybeSingle();

    const campStatus = def.stages.some(s =>
      s.ids.some(id => byId[id]?.status?.status === 'in progress')
    ) ? 'active' : 'active';

    const campFields = {
      name: def.name, status: campStatus, owner: def.owner,
      clickup_id: def.tag, updated_at: new Date().toISOString(),
    };

    let campaign;
    if (existingCamp) {
      const { data, error } = await _sb.from('campaigns').update(campFields).eq('id', existingCamp.id).select().single();
      if (error) throw error;
      campaign = data;
    } else {
      const { data, error } = await _sb.from('campaigns').insert(campFields).select().single();
      if (error) throw error;
      campaign = data;
    }

    // Rebuild stages
    await _sb.from('stages').delete().eq('campaign_id', campaign.id);

    const stageRows = def.stages.map(stage => {
      const tasks = stage.ids.map(id => byId[id]).filter(Boolean);
      const { status, started_at, ended_at } = stageFromTasks(tasks);
      return {
        campaign_id: campaign.id,
        name:        stage.name,
        status,
        order_index: stage.order,
        started_at,
        ended_at,
        clickup_id:  `${def.tag}:${stage.name}`,
        notes:       tasks.map(t => t.name).join(' · '),
      };
    });

    const { error } = await _sb.from('stages').insert(stageRows);
    if (error) throw error;
    synced++;
    onProgress(`Done — ${def.name} synced`);
  }

  return synced;
}

// ─── Icon helpers (inline SVG, stroke 1.6 round) ────────────
const Icon = ({ d, size = 16, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    strokeLinejoin="round" style={style}>
    <path d={d} />
  </svg>
);

const ICONS = {
  campaigns: 'M4 6h16M4 10h16M4 14h8',
  templates: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  settings:  'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  plus:      'M12 5v14M5 12h14',
  close:     'M18 6L6 18M6 6l12 12',
  trash:     'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  back:      'M15 18l-6-6 6-6',
  download:  'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  tweaks:    'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
  up:        'M5 15l7-7 7 7',
  down:      'M19 9l-7 7-7-7',
  stamp:     'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
  check:     'M5 13l4 4L19 7',
  alert:     'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  sync:      'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
};

// ─── Reusable: EditableCell ───────────────────────────────────
function EditableCell({ value, onSave, type = 'text', placeholder = '—', width }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const save = () => {
    setEditing(false);
    const v = type === 'number' ? (draft === '' ? null : Number(draft)) : (draft || null);
    if (v !== (value || null)) onSave(v);
  };

  if (!editing) return (
    <span className="editable-cell" onClick={() => { setDraft(value || ''); setEditing(true); }}>
      {value || <span style={{ color: 'var(--text-muted)' }}>{placeholder}</span>}
    </span>
  );

  return (
    <input
      autoFocus
      type={type}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
      style={{
        border: '1px solid var(--accent)', borderRadius: 'var(--r-1)',
        padding: '3px 6px', background: 'var(--bg)', color: 'var(--text)',
        font: 'inherit', width: width || 'auto', minWidth: 80, outline: 'none',
      }}
    />
  );
}

// ─── Efficiency bar ───────────────────────────────────────────
function EffBar({ pct }) {
  const cls = effClass(pct);
  return (
    <div className="eff-bar-wrap">
      <div className="eff-bar-track">
        <div className="eff-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className={`eff-pct ${cls}`}>{pct}%</span>
    </div>
  );
}

// ─── Stage type toggle ────────────────────────────────────────
function StageTypeToggle({ value, onChange }) {
  return (
    <div className="stage-type-toggle">
      <button
        className={`stage-type-btn ${value === 'active' ? 'on-active' : ''}`}
        onClick={() => onChange('active')}
      >Work</button>
      <button
        className={`stage-type-btn ${value === 'wait' ? 'on-wait' : ''}`}
        onClick={() => onChange('wait')}
      >Wait</button>
    </div>
  );
}

// ─── Setup Screen ─────────────────────────────────────────────
function SetupScreen({ onReady }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    if (!url.trim() || !key.trim()) { setErr('Both fields are required.'); return; }
    setLoading(true); setErr('');
    try {
      const client = initSb(url.trim(), key.trim());
      const { error } = await client.from('campaigns').select('id').limit(1);
      if (error) throw error;
      localStorage.setItem('vsm-cfg', JSON.stringify({ url: url.trim(), key: key.trim() }));
      onReady();
    } catch (e) {
      _sb = null;
      setErr(e.message.includes('relation')
        ? 'Connected, but tables not found. Run schema.sql in your Supabase SQL editor first.'
        : (e.message || 'Connection failed. Check URL and key.'));
    }
    setLoading(false);
  };

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg)' }}>
      <div className="card" style={{ width: 440, padding: 36 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:28 }}>
          <div style={{ width:44, height:36, background:"url('brand/vsg-badge.png') no-repeat center/contain", flexShrink:0 }} />
          <div>
            <div style={{ fontWeight:700, fontSize:16, letterSpacing:'-0.01em' }}>VSG Flow Tracker</div>
            <div style={{ fontSize:12, color:'var(--text-soft)', marginTop:1 }}>Connect your Supabase project to continue</div>
          </div>
        </div>

        <div className="field" style={{ marginBottom:12 }}>
          <label>Supabase Project URL</label>
          <input type="text" placeholder="https://xxxxxxxxxxxx.supabase.co"
            value={url} onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && connect()} />
        </div>
        <div className="field" style={{ marginBottom:20 }}>
          <label>Anon Public Key</label>
          <input type="password" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
            value={key} onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && connect()} />
        </div>

        {err && (
          <div style={{ display:'flex', gap:8, alignItems:'flex-start', background:'var(--bad-bg)', border:'1px solid color-mix(in oklab, var(--bad), transparent 60%)', borderRadius:'var(--r-2)', padding:'10px 12px', marginBottom:14, fontSize:12.5, color:'var(--bad)' }}>
            <Icon d={ICONS.alert} size={14} style={{ marginTop:1, flexShrink:0 }} />
            {err}
          </div>
        )}

        <button className="btn primary" style={{ width:'100%', justifyContent:'center', padding:'9px' }}
          onClick={connect} disabled={loading}>
          {loading ? 'Connecting…' : 'Connect to Supabase'}
        </button>

        <div style={{ marginTop:20, padding:'14px 16px', background:'var(--bg-soft)', borderRadius:'var(--r-2)', fontSize:12, color:'var(--text-soft)', lineHeight:1.6 }}>
          <strong style={{ color:'var(--text)', display:'block', marginBottom:4 }}>First time setup</strong>
          1. Create a project at <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" style={{ color:'var(--accent)' }}>supabase.com</a><br/>
          2. Open the SQL Editor and run <code style={{ color:'var(--accent)' }}>schema.sql</code> from this folder<br/>
          3. Paste your project URL + anon key above
        </div>
      </div>
    </div>
  );
}

// ─── Tweaks Panel ─────────────────────────────────────────────
function TweaksPanel({ onClose, onSyncDone }) {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'dark');
  const [density, setDensity] = useState(document.documentElement.dataset.density || 'regular');
  const [cuKey, setCuKey] = useState(getCuKey());
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const setT = (t) => { document.documentElement.dataset.theme = t; setTheme(t); localStorage.setItem('vsm-theme', t); };
  const setD = (d) => { document.documentElement.dataset.density = d; setDensity(d); localStorage.setItem('vsm-density', d); };

  const saveKey = () => { saveCuKey(cuKey.trim()); setSyncMsg('API key saved.'); };

  const runSync = async () => {
    const key = cuKey.trim() || getCuKey();
    if (!key) { setSyncMsg('Enter your ClickUp API key first.'); return; }
    saveCuKey(key);
    setSyncing(true); setSyncMsg('');
    try {
      const n = await syncClickUp(key, setSyncMsg);
      setSyncMsg(`Done — ${n} campaign${n !== 1 ? 's' : ''} synced.`);
      if (onSyncDone) onSyncDone();
    } catch(e) {
      setSyncMsg('Error: ' + (e.message || 'Unknown error'));
    }
    setSyncing(false);
  };

  const disconnect = () => {
    localStorage.removeItem('vsm-cfg');
    window.location.reload();
  };

  return (
    <div className="tweaks-panel" style={{ position:'fixed', bottom:24, right:24, width:240, background:'var(--bg-elev)', border:'1px solid var(--line)', borderRadius:'var(--r-3)', boxShadow:'var(--shadow-pop)', zIndex:200, overflow:'hidden' }}>
      <div style={{ padding:'12px 14px 10px', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontWeight:600, fontSize:13 }}>Display</span>
        <button className="btn ghost" style={{ padding:'2px 4px' }} onClick={onClose}>
          <Icon d={ICONS.close} size={13} />
        </button>
      </div>
      <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:12 }}>
        <div>
          <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:6 }}>Theme</div>
          <div className="daterange">
            <button className={theme === 'dark' ? 'on' : ''} onClick={() => setT('dark')}>Dark</button>
            <button className={theme === 'light' ? 'on' : ''} onClick={() => setT('light')}>Light</button>
          </div>
        </div>
        <div>
          <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:6 }}>Density</div>
          <div className="daterange">
            <button className={density === 'compact' ? 'on' : ''} onClick={() => setD('compact')}>Compact</button>
            <button className={density === 'regular' ? 'on' : ''} onClick={() => setD('regular')}>Regular</button>
            <button className={density === 'comfy' ? 'on' : ''} onClick={() => setD('comfy')}>Comfy</button>
          </div>
        </div>
        <div style={{ borderTop:'1px solid var(--line)', paddingTop:10 }}>
          <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:6 }}>ClickUp Sync</div>
          <input
            type="password"
            placeholder="pk_xxxxxxxx_…"
            value={cuKey}
            onChange={e => setCuKey(e.target.value)}
            onBlur={saveKey}
            style={{ width:'100%', border:'1px solid var(--line)', borderRadius:'var(--r-2)', padding:'6px 8px', background:'var(--bg)', color:'var(--text)', font:'inherit', fontSize:11.5, outline:'none', marginBottom:6 }}
          />
          <button className="btn primary" style={{ width:'100%', justifyContent:'center', fontSize:12 }}
            onClick={runSync} disabled={syncing}>
            <Icon d={ICONS.sync} size={12} />
            {syncing ? 'Syncing…' : 'Sync from ClickUp'}
          </button>
          {syncMsg && (
            <div style={{ fontSize:11, color: syncMsg.startsWith('Error') ? 'var(--bad)' : 'var(--text-soft)', marginTop:6, lineHeight:1.4 }}>
              {syncMsg}
            </div>
          )}
        </div>
        <div style={{ borderTop:'1px solid var(--line)', paddingTop:10 }}>
          <button className="btn ghost" style={{ width:'100%', justifyContent:'center', color:'var(--bad)', fontSize:12 }} onClick={disconnect}>
            Disconnect Supabase
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────
function Sidebar({ page, setPage, counts }) {
  const nav = [
    { id:'campaigns', label:'Campaigns', icon: ICONS.campaigns, badge: counts.campaigns },
    { id:'templates', label:'Phase Templates', icon: ICONS.templates, badge: counts.templates },
  ];

  const initials = initialsOf('VSG User');

  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-logo" style={{ backgroundImage:"url('brand/vsg-badge.png')" }} />
        <div className="sb-brand-text">
          <div className="t1">Visual Solutions Group</div>
          <div className="t2">Flow Tracker</div>
        </div>
      </div>

      <div className="sb-section">Workspace</div>
      <nav className="sb-nav">
        {nav.map(item => (
          <div key={item.id}
            className={`sb-item ${page === item.id ? 'active' : ''}`}
            onClick={() => setPage(item.id)}>
            <svg className="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d={item.icon} />
            </svg>
            <span>{item.label}</span>
            {item.badge > 0 && <span className="badge">{item.badge}</span>}
          </div>
        ))}
      </nav>

      <div className="sb-foot">
        <div className="sb-user">
          <div className="sb-avatar" style={{ background:'var(--vsg-blue)' }}>V</div>
          <div className="sb-user-text">
            <div className="t1">VSG Team</div>
            <div className="t2">Flow Tracker</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── KPI Strip ────────────────────────────────────────────────
function KpiStrip({ campaigns, stagesMap }) {
  const active = campaigns.filter(c => c.status === 'active').length;
  const allStats = campaigns.map(c => campaignStats(stagesMap[c.id] || []));
  const n = allStats.length || 1;

  const avgTotal = Math.round(allStats.reduce((s, st) => s + st.total, 0) / n);
  const avgWait  = Math.round(allStats.reduce((s, st) => s + st.wait,  0) / n);
  const avgEff   = Math.round(allStats.reduce((s, st) => s + st.efficiency, 0) / n);

  return (
    <div className="kpis">
      <div className="kpi">
        <div className="label">Active Campaigns</div>
        <div className="value">{active}</div>
        <div className="delta">{campaigns.length} total</div>
      </div>
      <div className="kpi">
        <div className="label">Avg Total Time</div>
        <div className="value" style={{ fontFamily:'var(--f-mono)', fontSize:22 }}>{fmtDur(avgTotal)}</div>
        <div className="delta">across all campaigns</div>
      </div>
      <div className="kpi">
        <div className="label">Avg Wait Time</div>
        <div className="value" style={{ fontFamily:'var(--f-mono)', fontSize:22, color: avgWait > 0 ? 'var(--bad)' : 'var(--text)' }}>
          {fmtDur(avgWait)}
        </div>
        <div className="delta">time in blocked states</div>
      </div>
      <div className="kpi">
        <div className="label">Avg Efficiency</div>
        <div className="value" style={{ fontFamily:'var(--f-mono)', fontSize:24, color:`var(--${effClass(avgEff)})` }}>
          {avgEff}%
        </div>
        <div className="delta" style={{ color:`var(--${effClass(avgEff)})` }}>
          {avgEff >= 60 ? 'On track' : avgEff >= 40 ? 'At risk' : 'Needs attention'}
        </div>
      </div>
    </div>
  );
}

// ─── Campaign Table ───────────────────────────────────────────
function CampaignTable({ campaigns, stagesMap, onSelect, onDelete }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = campaigns.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="card">
      <div className="card-hd">
        <h3>Campaigns</h3>
        <div className="card-hd-spacer" />
        <div className="search" style={{ width:200 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input placeholder="Search campaigns…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="daterange" style={{ marginLeft:0 }}>
          {['all','active','complete','archived'].map(s => (
            <button key={s} className={statusFilter === s ? 'on' : ''}
              onClick={() => setStatusFilter(s)}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Owner</th>
              <th>Stages</th>
              <th className="num">Total Time</th>
              <th className="num">Wait Time</th>
              <th>Efficiency</th>
              <th>Status</th>
              <th>Created</th>
              <th style={{ width:32 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr className="vsm-empty-row">
                <td colSpan="9">{campaigns.length === 0 ? 'No campaigns yet — create your first one.' : 'No campaigns match your filters.'}</td>
              </tr>
            )}
            {filtered.map(c => {
              const stages = stagesMap[c.id] || [];
              const stats = campaignStats(stages);
              const cls = effClass(stats.efficiency);
              const inProgress = stages.some(s => s.started_at && !s.ended_at && !s.touch_time_min);

              return (
                <tr key={c.id} className="leaf lb-row-click" onClick={() => onSelect(c)}>
                  <td>
                    <span className="cust-link cust-link-inline">{c.name}</span>
                  </td>
                  <td style={{ color:'var(--text-soft)' }}>{c.owner || '—'}</td>
                  <td style={{ color:'var(--text-soft)', fontFamily:'var(--f-mono)', fontSize:12 }}>{stages.length}</td>
                  <td className="num">{fmtDur(stats.total)}</td>
                  <td className="num" style={{ color: stats.wait > 0 ? 'var(--bad)' : 'var(--text-soft)' }}>{fmtDur(stats.wait)}</td>
                  <td><EffBar pct={stats.efficiency} /></td>
                  <td>
                    <span className={`cs-status ${c.status === 'active' ? (inProgress ? 'warn' : 'ok') : 'muted'}`}>
                      <span className="dot" />
                      {c.status === 'active' && inProgress ? 'In progress' : c.status}
                    </span>
                  </td>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>{fmtDate(c.created_at)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn ghost" style={{ padding:'3px', color:'var(--text-muted)' }}
                      onClick={() => { if (confirm(`Delete "${c.name}"?`)) onDelete(c.id); }}>
                      <Icon d={ICONS.trash} size={13} />
                    </button>
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

// ─── Build timeline segments (stages + inter-stage gaps) ──────
function buildSegments(sortedStages, hasTime) {
  if (!hasTime) return sortedStages.map(s => ({ type:'stage', stage:s, dur: 1 }));
  const segs = [];
  for (let i = 0; i < sortedStages.length; i++) {
    const s = sortedStages[i];
    const dur = stageDuration(s);
    segs.push({ type:'stage', stage:s, dur });
    // Gap = time between this stage ending and next stage starting
    if (i < sortedStages.length - 1 && s.ended_at && sortedStages[i+1].started_at) {
      const gapMin = Math.round(
        (new Date(sortedStages[i+1].started_at) - new Date(s.ended_at)) / 60000
      );
      if (gapMin > 120) { // only show gaps > 2 hours
        segs.push({ type:'gap', dur: gapMin });
      }
    }
  }
  return segs;
}

// ─── Shared timeline row renderer ─────────────────────────────
function ActualTrack({ segments, effectiveTotal, hasTime, bottleneck, height = 72 }) {
  return (
    <div style={{ display:'flex', gap:3, height, alignItems:'stretch' }}>
      {segments.map((seg, i) => {
        const pct = (seg.dur / effectiveTotal) * 100;
        if (seg.type === 'gap') {
          return (
            <div key={`gap-${i}`} className="vsm-gap"
              style={{ width:`${Math.max(pct, 2)}%` }}
              title={`Dead time: ${fmtDur(seg.dur)}`}>
              <div className="vsm-gap-label">Gap</div>
              <div className="vsm-gap-dur">{fmtDur(seg.dur)}</div>
            </div>
          );
        }
        const { stage } = seg;
        const isBottleneck = bottleneck && stage.id === bottleneck.id;
        const isInProgress = stage.started_at && !stage.ended_at && !stage.touch_time_min;
        const blockCls = isBottleneck ? 'wait' : isInProgress ? 'in-progress' : stage.status;
        return (
          <div key={stage.id}
            className={`vsm-block ${blockCls} ${isBottleneck ? 'bottleneck' : ''}`}
            style={{ width:`${Math.max(pct, 3)}%` }}
            title={`${stage.name}${hasTime ? '\n' + fmtDur(seg.dur) : ''}${isBottleneck ? '\n⚠ Bottleneck' : ''}`}
          >
            {isInProgress && <div className="vsm-pulse" />}
            {isBottleneck && <div className="vsm-bottleneck-tag">Bottleneck</div>}
            <div className="vsm-block-name">{stage.name}</div>
            {hasTime && seg.dur > 0 && <div className="vsm-block-dur">{fmtDur(seg.dur)}</div>}
          </div>
        );
      })}
    </div>
  );
}

function IdealTrack({ ideal, height = 40 }) {
  if (!ideal?.length) return null;
  const totalMin = ideal.reduce((s, st) => s + st.days * 24 * 60, 0);
  return (
    <div style={{ display:'flex', gap:3, height, alignItems:'stretch' }}>
      {ideal.map((st, i) => {
        const pct = (st.days * 24 * 60 / totalMin) * 100;
        return (
          <div key={i} className={`vsm-ideal-block ${st.status}`}
            style={{ width:`${Math.max(pct, 3)}%` }}
            title={`Target: ${st.name} — ${st.days}d`}>
            <div className="vsm-ideal-name">{st.name}</div>
            <div className="vsm-ideal-dur">{st.days}d</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Phase Card (column-based VSM card) ───────────────────────
function PhaseCard({ stage, isBottleneck, compact = false }) {
  const dur = stageDuration(stage);
  const isInProgress = stage.started_at && !stage.ended_at && !stage.touch_time_min;
  const tasks = (stage.notes || '').split(' · ').filter(Boolean);

  const bg     = isBottleneck ? 'var(--bad-bg)'
               : stage.status === 'wait' ? 'color-mix(in oklab, var(--bad-bg), transparent 40%)'
               : 'var(--bg-elev)';
  const border = isBottleneck ? '2px solid var(--bad)'
               : stage.status === 'wait' ? '1px dashed color-mix(in oklab, var(--bad), transparent 50%)'
               : '1px solid var(--line)';
  const nameColor = isBottleneck ? 'var(--bad)' : stage.status === 'wait' ? 'var(--bad)' : 'var(--text)';
  const durColor  = isBottleneck ? 'var(--bad)'
                  : isInProgress ? 'var(--warn)'
                  : dur > 0      ? 'var(--good)'
                  : 'var(--text-muted)';

  return (
    <div style={{ background:bg, border, borderRadius:'var(--r-3)', padding: compact ? '10px 12px' : '14px 14px', display:'flex', flexDirection:'column', gap: compact ? 6 : 8, minWidth: compact ? 120 : 150, flex:1 }}>
      {/* Phase name */}
      <div style={{ fontWeight:700, fontSize: compact ? 10 : 11, letterSpacing:'0.06em', textTransform:'uppercase', color:nameColor, lineHeight:1.3 }}>
        {isBottleneck && '⚠ '}{stage.name}
      </div>

      {/* Task list */}
      {!compact && tasks.length > 0 && (
        <div style={{ flex:1, fontSize:10, color:'var(--text-soft)', lineHeight:1.6 }}>
          {tasks.slice(0, 4).map((t, i) => (
            <div key={i} style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>• {t}</div>
          ))}
          {tasks.length > 4 && <div style={{ color:'var(--text-muted)' }}>+{tasks.length - 4} more</div>}
        </div>
      )}

      {/* Status tag */}
      {!compact && (
        <div style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background: isInProgress ? 'var(--warn)' : stage.status === 'wait' ? 'var(--bad)' : 'var(--good)', flexShrink:0 }} />
          <span style={{ fontSize:10, color:'var(--text-muted)' }}>{isInProgress ? 'In progress' : stage.status === 'wait' ? 'Blocked' : 'Complete'}</span>
        </div>
      )}

      {/* Duration */}
      <div style={{ borderTop:`1px solid ${isBottleneck ? 'color-mix(in oklab, var(--bad), transparent 60%)' : 'var(--line)'}`, paddingTop: compact ? 5 : 7 }}>
        <div style={{ fontSize:9, fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:2 }}>
          {isInProgress ? 'Elapsed' : stage.status === 'wait' ? 'Waiting' : 'Duration'}
        </div>
        <div style={{ fontFamily:'var(--f-mono)', fontSize: compact ? 12 : 14, fontWeight:700, color:durColor }}>
          {dur > 0 ? fmtDur(dur) : '—'}
        </div>
      </div>
    </div>
  );
}

// ─── Wait indicator between phases ────────────────────────────
function WaitArrow({ waitMin, compact = false }) {
  const hasWait = waitMin > 120; // >2h worth noting
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', width: compact ? 28 : 40, flexShrink:0, gap:3 }}>
      {hasWait ? (
        <>
          <div style={{ fontSize: compact ? 13 : 18, color:'var(--bad)', lineHeight:1 }}>▶</div>
          <div style={{ fontSize:9, fontFamily:'var(--f-mono)', fontWeight:700, color:'var(--bad)', textAlign:'center', lineHeight:1.2 }}>{fmtDur(waitMin)}</div>
          <div style={{ fontSize:8, color:'var(--bad)', opacity:0.7 }}>wait</div>
        </>
      ) : (
        <div style={{ fontSize: compact ? 13 : 16, color:'var(--line-strong)' }}>▶</div>
      )}
    </div>
  );
}

// ─── Overall campaign timeline bar ────────────────────────────
function OverallTimeline({ stages, ideal, compact = false }) {
  const withStart = stages.filter(s => s.started_at);
  if (!withStart.length) return null;

  const starts = withStart.map(s => new Date(s.started_at).getTime());
  const ends   = stages.filter(s => s.ended_at).map(s => new Date(s.ended_at).getTime());
  const overallStart = new Date(Math.min(...starts));
  const overallEnd   = ends.length === stages.length ? new Date(Math.max(...ends)) : new Date();
  const totalMs      = overallEnd - overallStart;
  const totalDays    = Math.round(totalMs / 86400000);
  const idealDays    = ideal.reduce((s, st) => s + st.days, 0);

  return (
    <div style={{ marginTop: compact ? 10 : 14 }}>
      {/* Date labels */}
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--text-muted)', marginBottom:5 }}>
        <span>{fmtShortDate(overallStart.toISOString())}</span>
        <span style={{ fontFamily:'var(--f-mono)', fontWeight:700, fontSize:11, color:`var(--${effClass(idealDays > 0 ? Math.round((idealDays/totalDays)*100) : 50)})` }}>
          {totalDays}d total{idealDays > 0 ? ` · target ${idealDays}d` : ''}
        </span>
        <span>{overallEnd <= new Date() + 1000 ? 'Today' : fmtShortDate(overallEnd.toISOString())}</span>
      </div>

      {/* Segmented timeline bar */}
      <div style={{ display:'flex', height: compact ? 8 : 12, borderRadius:6, overflow:'hidden', background:'var(--bg-soft)', position:'relative' }}>
        {stages.map(stage => {
          if (!stage.started_at) return null;
          const left  = (new Date(stage.started_at) - overallStart) / totalMs;
          const end   = stage.ended_at ? new Date(stage.ended_at) : overallEnd;
          const width = (end - new Date(stage.started_at)) / totalMs;
          const color = stage.status === 'wait' ? 'var(--bad)' : 'var(--good)';
          return (
            <div key={stage.id} title={`${stage.name}: ${fmtDur(stageDuration(stage))}`} style={{
              position:'absolute',
              left:`${Math.max(0, left*100)}%`,
              width:`${Math.max(width*100, 1)}%`,
              height:'100%',
              background: color,
              opacity:0.85,
            }} />
          );
        })}
        {/* Today marker */}
        {overallEnd >= new Date() - 86400000 && (
          <div style={{ position:'absolute', right:0, top:-2, bottom:-2, width:2, background:'var(--text)', borderRadius:1, opacity:0.4 }} />
        )}
      </div>

      {/* Ideal comparison bar */}
      {idealDays > 0 && !compact && (
        <div style={{ marginTop:6 }}>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:3, letterSpacing:'0.06em', textTransform:'uppercase', fontWeight:600 }}>Target ({idealDays}d)</div>
          <div style={{ display:'flex', height:8, borderRadius:6, overflow:'hidden', width:`${Math.min((idealDays/totalDays)*100, 100)}%`, background:'var(--bg-soft)' }}>
            {ideal.map((st, i) => {
              const w = (st.days / idealDays) * 100;
              return <div key={i} style={{ width:`${w}%`, height:'100%', background: st.status === 'wait' ? 'var(--bad)' : 'var(--good)', opacity:0.5 }} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Full VSM phase map (column cards) ────────────────────────
function VSMPhaseMap({ stages, campaignName, compact = false }) {
  const ideal  = IDEAL_MAP[campaignName] || [];
  const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);

  if (!sorted.length) return (
    <div className="empty" style={{ padding:'30px 0' }}>
      <div className="lg">No stages yet</div>
      <div style={{ marginTop:4, fontSize:13 }}>Sync from ClickUp or add stages in detail view.</div>
    </div>
  );

  const waitStages = sorted.filter(s => s.status === 'wait');
  const bottleneck = waitStages.length > 0
    ? waitStages.reduce((a, b) => stageDuration(a) > stageDuration(b) ? a : b)
    : null;

  return (
    <div style={{ padding: compact ? '10px 16px 12px' : '16px 18px 20px' }}>
      {/* Phase cards row */}
      <div style={{ display:'flex', alignItems:'stretch', overflowX:'auto', gap:0, paddingBottom:4 }}>
        {sorted.map((stage, i) => {
          const next = sorted[i + 1];
          const waitMin = (next && stage.ended_at && next.started_at)
            ? Math.max(0, Math.round((new Date(next.started_at) - new Date(stage.ended_at)) / 60000))
            : 0;
          return (
            <React.Fragment key={stage.id}>
              <PhaseCard stage={stage} isBottleneck={bottleneck?.id === stage.id} compact={compact} />
              {i < sorted.length - 1 && <WaitArrow waitMin={waitMin} compact={compact} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Overall timeline */}
      <OverallTimeline stages={sorted} ideal={ideal} compact={compact} />

      {/* Legend */}
      {!compact && (
        <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:12, flexWrap:'wrap' }}>
          <div className="vsm-legend-item" style={{ fontSize:11 }}><span className="vsm-legend-dot active" />Work complete</div>
          <div className="vsm-legend-item" style={{ fontSize:11 }}><span className="vsm-legend-dot in-progress" />In progress</div>
          <div className="vsm-legend-item" style={{ fontSize:11 }}><span className="vsm-legend-dot wait" />Wait / blocked</div>
          {bottleneck && (
            <span style={{ marginLeft:'auto', fontSize:11, color:'var(--bad)', fontWeight:600 }}>⚠ Bottleneck: {bottleneck.name}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Timeline Visualization (detail view) ─────────────────────
function TimelineViz({ stages, campaignName }) {
  return <VSMPhaseMap stages={stages} campaignName={campaignName} compact={false} />;
}

// ─── Stages Card ─────────────────────────────────────────────
function StagesCard({ campaign, stages, onStagesChange }) {
  const [saving, setSaving] = useState({});
  const [addingName, setAddingName] = useState('');
  const [addingType, setAddingType] = useState('active');
  const [showAddRow, setShowAddRow] = useState(false);

  const updateStage = async (id, fields) => {
    setSaving(s => ({ ...s, [id]: true }));
    try {
      const updated = await db.updateStage(id, fields);
      onStagesChange(stages.map(s => s.id === id ? updated : s));
    } catch(e) { alert(e.message); }
    setSaving(s => ({ ...s, [id]: false }));
  };

  const deleteStage = async (id) => {
    if (!confirm('Delete this stage?')) return;
    try {
      await db.deleteStage(id);
      const remaining = stages.filter(s => s.id !== id);
      onStagesChange(remaining);
    } catch(e) { alert(e.message); }
  };

  const moveStage = async (id, dir) => {
    const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);
    const idx = sorted.findIndex(s => s.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const a = sorted[idx], b = sorted[swapIdx];
    const aNew = { ...a, order_index: b.order_index };
    const bNew = { ...b, order_index: a.order_index };

    try {
      await Promise.all([
        db.updateStage(a.id, { order_index: b.order_index }),
        db.updateStage(b.id, { order_index: a.order_index }),
      ]);
      onStagesChange(stages.map(s => s.id === a.id ? aNew : s.id === b.id ? bNew : s));
    } catch(e) { alert(e.message); }
  };

  const addStage = async () => {
    if (!addingName.trim()) return;
    const maxOrder = stages.reduce((m, s) => Math.max(m, s.order_index), -1);
    try {
      const newStage = await db.createStage({
        campaign_id: campaign.id,
        name: addingName.trim(),
        status: addingType,
        order_index: maxOrder + 1,
      });
      onStagesChange([...stages, newStage]);
      setAddingName('');
      setAddingType('active');
      setShowAddRow(false);
    } catch(e) { alert(e.message); }
  };

  const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="card">
      <div className="card-hd">
        <h3>Stages</h3>
        <span className="card-hd-spacer" />
        <button className="btn" onClick={() => setShowAddRow(true)}>
          <Icon d={ICONS.plus} size={13} /> Add Stage
        </button>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width:60 }}></th>
              <th>Stage Name</th>
              <th>Type</th>
              <th>Started</th>
              <th>Ended</th>
              <th className="num">Manual (min)</th>
              <th className="num">Duration</th>
              <th>Notes</th>
              <th style={{ width:36 }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && !showAddRow && (
              <tr className="vsm-empty-row"><td colSpan="9">No stages yet. Add your first stage to start mapping the flow.</td></tr>
            )}
            {sorted.map((stage, i) => (
              <tr key={stage.id} className="leaf">
                <td>
                  <div style={{ display:'flex', gap:2 }}>
                    <button className="btn ghost" style={{ padding:'2px 4px' }} disabled={i === 0}
                      onClick={() => moveStage(stage.id, -1)}>
                      <Icon d={ICONS.up} size={12} />
                    </button>
                    <button className="btn ghost" style={{ padding:'2px 4px' }} disabled={i === sorted.length - 1}
                      onClick={() => moveStage(stage.id, 1)}>
                      <Icon d={ICONS.down} size={12} />
                    </button>
                  </div>
                </td>
                <td>
                  <EditableCell value={stage.name} placeholder="Stage name"
                    onSave={v => v && updateStage(stage.id, { name: v })} />
                </td>
                <td>
                  <StageTypeToggle value={stage.status}
                    onChange={v => updateStage(stage.id, { status: v })} />
                </td>
                <td style={{ fontFamily:'var(--f-mono)', fontSize:11 }}>
                  <EditableCell value={stage.started_at ? stage.started_at.slice(0,16) : ''} type="datetime-local"
                    placeholder="not started"
                    onSave={v => updateStage(stage.id, { started_at: v || null })} />
                </td>
                <td style={{ fontFamily:'var(--f-mono)', fontSize:11 }}>
                  <EditableCell value={stage.ended_at ? stage.ended_at.slice(0,16) : ''} type="datetime-local"
                    placeholder="ongoing"
                    onSave={v => updateStage(stage.id, { ended_at: v || null })} />
                </td>
                <td className="num">
                  <EditableCell value={stage.touch_time_min} type="number" placeholder="—" width={60}
                    onSave={v => updateStage(stage.id, { touch_time_min: v })} />
                </td>
                <td className="num" style={{ color:'var(--text-soft)' }}>
                  {fmtDur(stageDuration(stage))}
                </td>
                <td>
                  <EditableCell value={stage.notes} placeholder="add note…"
                    onSave={v => updateStage(stage.id, { notes: v })} />
                </td>
                <td>
                  <button className="btn ghost" style={{ padding:'3px', color:'var(--text-muted)' }}
                    onClick={() => deleteStage(stage.id)}>
                    <Icon d={ICONS.trash} size={13} />
                  </button>
                </td>
              </tr>
            ))}

            {showAddRow && (
              <tr className="leaf" style={{ background:'var(--accent-soft)' }}>
                <td></td>
                <td>
                  <input autoFocus placeholder="Stage name" value={addingName}
                    onChange={e => setAddingName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addStage(); if (e.key === 'Escape') setShowAddRow(false); }}
                    style={{ border:'1px solid var(--accent)', borderRadius:'var(--r-1)', padding:'4px 8px', background:'var(--bg)', color:'var(--text)', font:'inherit', outline:'none', width:200 }} />
                </td>
                <td>
                  <StageTypeToggle value={addingType} onChange={setAddingType} />
                </td>
                <td colSpan="5" style={{ color:'var(--text-muted)', fontSize:12 }}>↵ Enter to save, Esc to cancel</td>
                <td>
                  <button className="btn ghost" style={{ padding:'3px', color:'var(--text-muted)' }} onClick={() => setShowAddRow(false)}>
                    <Icon d={ICONS.close} size={13} />
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Campaign Detail ──────────────────────────────────────────
function CampaignDetail({ campaign, onBack, onCampaignUpdate }) {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const timelineRef = useRef(null);

  useEffect(() => {
    db.getStages(campaign.id).then(data => { setStages(data); setLoading(false); });
  }, [campaign.id]);

  const stats = campaignStats(stages);

  const updateStatus = async (status) => {
    try {
      const updated = await db.updateCampaign(campaign.id, { status });
      onCampaignUpdate(updated);
    } catch(e) { alert(e.message); }
  };

  const exportPng = async () => {
    if (!timelineRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(timelineRef.current, { backgroundColor: null, scale: 2 });
      const link = document.createElement('a');
      link.download = `${campaign.name.replace(/\s+/g, '-')}-vsm.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch(e) { alert('Export failed: ' + e.message); }
    setExporting(false);
  };

  const inProgress = stages.some(s => s.started_at && !s.ended_at && !s.touch_time_min);
  const statusCls  = campaign.status === 'active' ? (inProgress ? 'warn' : 'ok') : 'muted';

  return (
    <div className="content">
      <button className="cust-back" onClick={onBack}>
        <Icon d={ICONS.back} size={13} /> Back to Campaigns
      </button>

      {/* Hero card */}
      <div className="cust-hero" style={{ marginBottom:16 }}>
        <div className="cust-hero-id">
          <div className="cust-hero-mark"
            style={{ background: colorOf(campaign.name), width:56, height:56, fontSize:20, borderRadius:12 }}>
            {initialsOf(campaign.name)}
          </div>
          <div>
            <h2 className="cust-hero-name">{campaign.name}</h2>
            <div className="cust-hero-meta">
              <span className={`health-pill ${statusCls}`}>
                <span className="dot" />
                {campaign.status === 'active' && inProgress ? 'In Progress' : campaign.status}
              </span>
              {campaign.owner && <span style={{ color:'var(--text-soft)', fontSize:12 }}>Owned by {campaign.owner}</span>}
              <span style={{ color:'var(--text-muted)', fontSize:12 }}>Created {fmtDate(campaign.created_at)}</span>
            </div>
            {campaign.description && (
              <div style={{ fontSize:13, color:'var(--text-soft)', marginTop:6, maxWidth:500 }}>{campaign.description}</div>
            )}
          </div>
        </div>

        <div className="cust-hero-stats">
          <div className="cust-stat">
            <div className="lbl">Total Time</div>
            <div className="val" style={{ fontFamily:'var(--f-mono)', fontSize:20 }}>{fmtDur(stats.total)}</div>
          </div>
          <div className="cust-stat">
            <div className="lbl">Wait Time</div>
            <div className="val" style={{ fontFamily:'var(--f-mono)', fontSize:20, color: stats.wait > 0 ? 'var(--bad)' : 'var(--text-muted)' }}>{fmtDur(stats.wait)}</div>
          </div>
          <div className="cust-stat">
            <div className="lbl">Efficiency</div>
            <div className={`val ${effClass(stats.efficiency)}`} style={{ fontFamily:'var(--f-mono)', fontSize:20, color:`var(--${effClass(stats.efficiency)})` }}>
              {stats.efficiency}%
            </div>
          </div>
          <div className="cust-stat">
            <div className="lbl">Stages</div>
            <div className="val" style={{ fontFamily:'var(--f-mono)', fontSize:20 }}>{stages.length}</div>
          </div>
        </div>
      </div>

      {/* Status controls + export */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
        <span style={{ fontSize:12, color:'var(--text-muted)' }}>Mark as:</span>
        {['active','complete','archived'].map(s => (
          <button key={s} className={`btn ${campaign.status === s ? 'primary' : ''}`} style={{ fontSize:12, padding:'5px 10px' }}
            onClick={() => updateStatus(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <button className="btn" onClick={exportPng} disabled={exporting}>
          <Icon d={ICONS.download} size={13} />
          {exporting ? 'Exporting…' : 'Export PNG'}
        </button>
      </div>

      {/* Timeline card */}
      <div className="card" style={{ marginBottom:16 }} ref={timelineRef}>
        <div className="card-hd">
          <h3>Value Stream Map</h3>
          <span className="card-hd-spacer" />
          <span className="card-hd sub">{stages.length} stage{stages.length !== 1 ? 's' : ''}</span>
        </div>
        {loading ? (
          <div style={{ padding:32, textAlign:'center', color:'var(--text-muted)' }}>Loading…</div>
        ) : (
          <TimelineViz stages={stages} campaignName={campaign.name} />
        )}
      </div>

      {/* Stages editor */}
      {!loading && (
        <StagesCard campaign={campaign} stages={stages} onStagesChange={setStages} />
      )}
    </div>
  );
}

// ─── New Campaign Drawer ──────────────────────────────────────
function NewCampaignDrawer({ onClose, onCreate, templates }) {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const campaign = await db.createCampaign({
        name: name.trim(),
        owner: owner.trim() || null,
        description: description.trim() || null,
        status: 'active',
      });

      // Stamp template stages if selected
      if (templateId) {
        const tmpl = templates.find(t => t.id === templateId);
        if (tmpl && tmpl.stages) {
          const stageInserts = tmpl.stages.map((s, i) => ({
            campaign_id: campaign.id,
            name: s.name,
            status: s.status,
            order_index: i,
          }));
          await Promise.all(stageInserts.map(s => db.createStage(s)));
        }
      }

      onCreate(campaign);
      onClose();
    } catch(e) { alert(e.message); }
    setSaving(false);
  };

  return (
    <div className="vsm-drawer-overlay" onClick={onClose}>
      <div className="vsm-drawer" onClick={e => e.stopPropagation()}>
        <div className="vsm-drawer-hd">
          <h2>New Campaign</h2>
          <button className="btn ghost" style={{ padding:'4px' }} onClick={onClose}>
            <Icon d={ICONS.close} size={14} />
          </button>
        </div>
        <div className="vsm-drawer-body">
          <div className="field">
            <label>Campaign Name *</label>
            <input autoFocus placeholder="e.g. Reddy Ice Summer Push"
              value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()} />
          </div>
          <div className="field">
            <label>Owner</label>
            <input placeholder="e.g. Jane Smith"
              value={owner} onChange={e => setOwner(e.target.value)} />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea placeholder="Brief campaign description…" rows={3}
              value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          {templates.length > 0 && (
            <div className="field">
              <label>Phase Template (optional)</label>
              <select value={templateId} onChange={e => setTemplateId(e.target.value)}>
                <option value="">— Start empty —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {templateId && (
                <div style={{ marginTop:8 }}>
                  {templates.find(t => t.id === templateId)?.stages?.map((s, i) => (
                    <span key={i} className={`tmpl-stage-chip ${s.status}`} style={{ marginRight:4, marginBottom:4, display:'inline-block' }}>{s.name}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="vsm-drawer-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving || !name.trim()}>
            {saving ? 'Creating…' : 'Create Campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Campaign Map Card ────────────────────────────────────────
function CampaignMapCard({ campaign, stages, onSelect, onDelete }) {
  const inProgress = stages.some(s => s.started_at && !s.ended_at && !s.touch_time_min);
  const statusCls  = campaign.status === 'active' ? (inProgress ? 'warn' : 'ok') : 'muted';

  return (
    <div className="card" style={{ marginBottom:16 }}>
      <div className="card-hd" style={{ padding:'14px 18px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0 }}>
          <div style={{ width:32, height:32, borderRadius:8, flexShrink:0, background:colorOf(campaign.name), display:'grid', placeItems:'center', color:'white', fontWeight:700, fontSize:12 }}>
            {initialsOf(campaign.name)}
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontWeight:600, fontSize:14, letterSpacing:'-0.01em', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {campaign.name}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:2 }}>
              <span className={`cs-status ${statusCls}`} style={{ fontSize:11 }}>
                <span className="dot" />{inProgress ? 'In progress' : campaign.status}
              </span>
              {campaign.owner && <span style={{ fontSize:11, color:'var(--text-muted)' }}>{campaign.owner}</span>}
              <span style={{ fontSize:11, color:'var(--text-muted)' }}>{stages.length} stages</span>
            </div>
          </div>
        </div>
        <div className="card-hd-spacer" />
        <button className="btn ghost" style={{ padding:'4px 8px', fontSize:12 }} onClick={() => onSelect(campaign)}>Details →</button>
        <button className="btn ghost" style={{ padding:'4px', color:'var(--text-muted)' }}
          onClick={() => { if (confirm(`Delete "${campaign.name}"?`)) onDelete(campaign.id); }}>
          <Icon d={ICONS.trash} size={13} />
        </button>
      </div>
      <VSMPhaseMap stages={stages} campaignName={campaign.name} compact={true} />
    </div>
  );
}

// ─── Campaigns Page ───────────────────────────────────────────
function CampaignsPage({ onSelectCampaign }) {
  const [campaigns, setCampaigns] = useState([]);
  const [stagesMap, setStagesMap] = useState({});
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [camps, tmpls] = await Promise.all([db.getCampaigns(), db.getTemplates()]);
      setCampaigns(camps);
      setTemplates(tmpls);
      const stageResults = await Promise.all(camps.map(c => db.getStages(c.id)));
      const map = {};
      camps.forEach((c, i) => { map[c.id] = stageResults[i]; });
      setStagesMap(map);
    } catch(e) { alert('Failed to load: ' + e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = (campaign) => {
    setCampaigns(prev => [campaign, ...prev]);
    setStagesMap(prev => ({ ...prev, [campaign.id]: [] }));
    onSelectCampaign(campaign);
  };

  const handleDelete = async (id) => {
    try {
      await db.deleteCampaign(id);
      setCampaigns(prev => prev.filter(c => c.id !== id));
      setStagesMap(prev => { const m = { ...prev }; delete m[id]; return m; });
    } catch(e) { alert(e.message); }
  };

  const filtered = campaigns.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Flow Maps</h1>
          <div className="crumb">Campaign value stream — work vs. wait at a glance</div>
        </div>
        <div className="topbar-spacer" />
        <div className="search" style={{ width:180 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input placeholder="Filter campaigns…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="daterange">
          {['all','active','complete','archived'].map(s => (
            <button key={s} className={statusFilter === s ? 'on' : ''}
              onClick={() => setStatusFilter(s)}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={() => setShowDrawer(true)}>
          <Icon d={ICONS.plus} size={13} /> New
        </button>
      </div>

      <div className="content">
        {loading ? (
          <div style={{ padding:60, textAlign:'center', color:'var(--text-muted)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="lg">{campaigns.length === 0 ? 'No campaigns yet' : 'No matches'}</div>
            <div style={{ marginTop:4 }}>
              {campaigns.length === 0
                ? 'Sync from ClickUp (tweaks panel) or create one manually.'
                : 'Try a different filter.'}
            </div>
          </div>
        ) : (
          <>
            <KpiStrip campaigns={filtered} stagesMap={stagesMap} />
            {filtered.map(c => (
              <CampaignMapCard
                key={c.id}
                campaign={c}
                stages={stagesMap[c.id] || []}
                onSelect={onSelectCampaign}
                onDelete={handleDelete}
              />
            ))}
          </>
        )}
      </div>

      {showDrawer && (
        <NewCampaignDrawer
          templates={templates}
          onClose={() => setShowDrawer(false)}
          onCreate={handleCreate}
        />
      )}
    </>
  );
}

// ─── Templates Page ───────────────────────────────────────────
function TemplatesPage({ onCountChange }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStages, setNewStages] = useState([
    { name: 'Strategy', status: 'active' },
    { name: 'Creative', status: 'active' },
    { name: 'Client Review', status: 'wait' },
    { name: 'Revisions', status: 'active' },
    { name: 'Final Approval', status: 'wait' },
    { name: 'Launch', status: 'active' },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.getTemplates().then(data => { setTemplates(data); setLoading(false); onCountChange(data.length); });
  }, []);

  const save = async () => {
    if (!newName.trim() || !newStages.length) return;
    setSaving(true);
    try {
      const tmpl = await db.createTemplate({
        name: newName.trim(),
        stages: newStages.map((s, i) => ({ ...s, order_index: i })),
      });
      const updated = [tmpl, ...templates];
      setTemplates(updated);
      onCountChange(updated.length);
      setNewName(''); setShowNew(false);
    } catch(e) { alert(e.message); }
    setSaving(false);
  };

  const del = async (id) => {
    if (!confirm('Delete this template?')) return;
    try {
      await db.deleteTemplate(id);
      const updated = templates.filter(t => t.id !== id);
      setTemplates(updated);
      onCountChange(updated.length);
    } catch(e) { alert(e.message); }
  };

  const updateStageName = (i, val) => setNewStages(prev => prev.map((s, idx) => idx === i ? { ...s, name: val } : s));
  const updateStageType = (i, val) => setNewStages(prev => prev.map((s, idx) => idx === i ? { ...s, status: val } : s));
  const removeStageRow  = (i)      => setNewStages(prev => prev.filter((_, idx) => idx !== i));
  const addStageRow     = ()       => setNewStages(prev => [...prev, { name: '', status: 'active' }]);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Phase Templates</h1>
          <div className="crumb">Reusable stage sequences — stamp onto any new campaign</div>
        </div>
        <div className="topbar-spacer" />
        <button className="btn primary" onClick={() => setShowNew(true)}>
          <Icon d={ICONS.plus} size={13} /> New Template
        </button>
      </div>
      <div className="content">
        {loading ? (
          <div style={{ padding:60, textAlign:'center', color:'var(--text-muted)' }}>Loading…</div>
        ) : templates.length === 0 && !showNew ? (
          <div className="empty">
            <div className="lg">No templates yet</div>
            <div style={{ marginTop:4 }}>Templates let you pre-define a stage sequence and stamp it onto any new campaign.</div>
            <button className="btn primary" style={{ marginTop:16 }} onClick={() => setShowNew(true)}>
              <Icon d={ICONS.plus} size={13} /> Create your first template
            </button>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:14 }}>
            {templates.map(t => (
              <div key={t.id} className="tmpl-card">
                <div className="tmpl-card-hd">
                  <div className="tmpl-card-name">{t.name}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:11, color:'var(--text-muted)' }}>{(t.stages || []).length} stages</span>
                    <button className="btn ghost" style={{ padding:'2px', color:'var(--text-muted)' }} onClick={() => del(t.id)}>
                      <Icon d={ICONS.trash} size={12} />
                    </button>
                  </div>
                </div>
                <div className="tmpl-stages-preview">
                  {(t.stages || []).map((s, i) => (
                    <span key={i} className={`tmpl-stage-chip ${s.status}`}>{s.name}</span>
                  ))}
                </div>
                <div style={{ padding:'6px 14px 12px', fontSize:11, color:'var(--text-muted)' }}>
                  Created {fmtDate(t.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}

        {showNew && (
          <div className="card" style={{ marginTop: templates.length > 0 ? 20 : 0 }}>
            <div className="card-hd">
              <h3>New Template</h3>
              <span className="card-hd-spacer" />
              <button className="btn ghost" onClick={() => setShowNew(false)}>
                <Icon d={ICONS.close} size={13} />
              </button>
            </div>
            <div style={{ padding:20 }}>
              <div className="field" style={{ marginBottom:16 }}>
                <label>Template Name</label>
                <input autoFocus placeholder="e.g. Standard Campaign" value={newName}
                  onChange={e => setNewName(e.target.value)} style={{ width:320 }} />
              </div>

              <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:8 }}>Stages</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
                {newStages.map((s, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--f-mono)', width:18, textAlign:'right' }}>{i+1}</span>
                    <input placeholder="Stage name" value={s.name}
                      onChange={e => updateStageName(i, e.target.value)}
                      style={{ border:'1px solid var(--line)', borderRadius:'var(--r-1)', padding:'5px 8px', background:'var(--bg)', color:'var(--text)', font:'inherit', fontSize:13, outline:'none', width:200 }} />
                    <StageTypeToggle value={s.status} onChange={v => updateStageType(i, v)} />
                    <button className="btn ghost" style={{ padding:'3px', color:'var(--text-muted)' }} onClick={() => removeStageRow(i)}>
                      <Icon d={ICONS.close} size={12} />
                    </button>
                  </div>
                ))}
                <button className="btn ghost" style={{ alignSelf:'flex-start', fontSize:12 }} onClick={addStageRow}>
                  <Icon d={ICONS.plus} size={12} /> Add stage
                </button>
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button className="btn ghost" onClick={() => setShowNew(false)}>Cancel</button>
                <button className="btn primary" onClick={save} disabled={saving || !newName.trim()}>
                  {saving ? 'Saving…' : 'Save Template'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── App Root ─────────────────────────────────────────────────
function App() {
  const [ready, setReady] = useState(!!_sb);
  const [page, setPage] = useState('campaigns');
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showTweaks, setShowTweaks] = useState(false);
  const [counts, setCounts] = useState({ campaigns: 0, templates: 0 });
  const [syncTick, setSyncTick] = useState(0); // bump to force CampaignsPage reload

  // Restore theme/density from localStorage
  useEffect(() => {
    const theme = localStorage.getItem('vsm-theme');
    const density = localStorage.getItem('vsm-density');
    if (theme) document.documentElement.dataset.theme = theme;
    if (density) document.documentElement.dataset.density = density;
  }, []);

  // Pre-fill ClickUp key if already saved
  useEffect(() => {
    const key = getCuKey();
    if (key) saveCuKey(key); // no-op but confirms it's loaded
  }, []);

  if (!ready) return <SetupScreen onReady={() => setReady(true)} />;

  return (
    <div className="app">
      <Sidebar page={selectedCampaign ? 'campaigns' : page} setPage={(p) => { setPage(p); setSelectedCampaign(null); }} counts={counts} />

      <main className="main">
        {selectedCampaign ? (
          <CampaignDetail
            campaign={selectedCampaign}
            onBack={() => setSelectedCampaign(null)}
            onCampaignUpdate={(updated) => setSelectedCampaign(updated)}
          />
        ) : page === 'campaigns' ? (
          <CampaignsPage key={syncTick} onSelectCampaign={setSelectedCampaign} />
        ) : (
          <TemplatesPage onCountChange={n => setCounts(c => ({ ...c, templates: n }))} />
        )}

        {/* Tweaks toggle */}
        <button className="iconbtn" style={{ position:'fixed', bottom:24, right:24, zIndex:150 }}
          onClick={() => setShowTweaks(s => !s)}>
          <Icon d={ICONS.tweaks} size={15} />
        </button>

        {showTweaks && (
          <TweaksPanel
            onClose={() => setShowTweaks(false)}
            onSyncDone={() => { setSyncTick(t => t + 1); setShowTweaks(false); }}
          />
        )}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
