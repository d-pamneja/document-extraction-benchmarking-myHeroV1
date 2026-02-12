import './style.css';
import { marked } from 'marked';

// ============================================
// MyHero Document AI Benchmark v3 — Main App
// ============================================

// Document configurations — PDF URLs come from metadata.document_url in each JSON
const DOCUMENTS = {
  contract: {
    name: 'Santa Cruz Contract',
    shortName: 'Contract',
    jsonPath: '/output/SampleContract-Shuttle-3-v3-final.json',
  },
  fidic: {
    name: 'FIDIC Yellow Book',
    shortName: 'FIDIC',
    jsonPath: '/output/fidic-db-yellow-book-v3-final.json',
  },
  lma: {
    name: 'LMA Facilities Agreement',
    shortName: 'LMA',
    jsonPath: '/output/lma-v3-final.json',
  }
};
const EXPLANATION_PATH = '/output/explaination.md';

// Block type colors for badges
const BLOCK_TYPE_COLORS = {
  heading: '#8b5cf6',
  paragraph: '#6366f1',
  clause: '#3b82f6',
  ordered_list_item: '#06b6d4',
  bullet_list_item: '#10b981',
  table: '#f59e0b',
  signature_line: '#ec4899',
  definition: '#22c55e',
  recital: '#84cc16',
  page_header: '#94a3b8',
  page_footer: '#94a3b8',
  whitespace: '#64748b',
  image: '#f97316',
  toc_entry: '#a78bfa',
};

// Segment type icons
const SEGMENT_ICONS = {
  main_body: '📄',
  schedule: '📋',
  exhibit: '📎',
  annex: '📑',
  appendix: '📑',
  signature: '✍️',
  toc: '📑',
  cover: '📘',
  definitions: '📖',
  general_conditions: '📜',
  particular_conditions: '📝',
  preamble: '📜',
  front_matter: '📘',
  index: '📇',
};

// ============================================
// DocumentBenchmark Class
// ============================================
class DocumentBenchmark {
  constructor() {
    this.currentDoc = 'contract';
    this.cache = {};            // JSON cache per document key
    this.explanationCache = null;
    this.renderedSegments = new Set();
    this.segmentBlockOffset = {};
    this.blockObservers = {};   // IntersectionObservers per segment
    this.pdfCollapsed = false;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.switchTab('contract');
  }

  // ============================================
  // Event Listeners
  // ============================================
  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.doc-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const doc = btn.dataset.doc;
        this.switchTab(doc);
      });
    });

    // PDF panel collapse/expand
    document.getElementById('collapsePdf').addEventListener('click', () => {
      this.setPdfCollapsed(true);
    });
    document.getElementById('expandPdf').addEventListener('click', () => {
      this.setPdfCollapsed(false);
    });

    // Open PDF in new tab
    document.getElementById('openInTab').addEventListener('click', () => {
      const iframe = document.getElementById('pdfViewer');
      if (iframe.src) window.open(iframe.src, '_blank');
    });

    // Download JSON
    document.getElementById('downloadJson').addEventListener('click', () => {
      if (this.currentDoc === 'explanation') return;
      const config = DOCUMENTS[this.currentDoc];
      const a = document.createElement('a');
      a.href = config.jsonPath;
      a.download = config.jsonPath.split('/').pop();
      a.click();
    });

    // View Raw JSON
    document.getElementById('viewRawJson').addEventListener('click', () => {
      if (this.currentDoc === 'explanation') return;
      const data = this.cache[this.currentDoc];
      if (!data) return;
      this.openRawJsonModal(data);
    });

    // Copy JSON
    document.getElementById('copyJson').addEventListener('click', async () => {
      const content = document.getElementById('rawJsonContent').textContent;
      try {
        await navigator.clipboard.writeText(content);
        const btn = document.getElementById('copyJson');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000);
      } catch (e) {
        console.error('Copy failed:', e);
      }
    });

    // Close modal
    document.getElementById('closeModal').addEventListener('click', () => {
      document.getElementById('rawJsonModal').classList.add('hidden');
      document.getElementById('rawJsonContent').textContent = '';
    });
    document.getElementById('rawJsonModal').addEventListener('click', (e) => {
      if (e.target.id === 'rawJsonModal') {
        document.getElementById('rawJsonModal').classList.add('hidden');
        document.getElementById('rawJsonContent').textContent = '';
      }
    });

    // Delegated click handlers on content body
    document.getElementById('contentBody').addEventListener('click', (e) => {
      // Section collapse
      const sectionHeader = e.target.closest('.section-header');
      if (sectionHeader) {
        const section = sectionHeader.closest('.section');
        if (section) section.classList.toggle('collapsed');
        return;
      }

      // Segment accordion
      const segHeader = e.target.closest('.segment-header');
      if (segHeader) {
        const accordion = segHeader.closest('.segment-accordion');
        if (accordion) {
          const wasCollapsed = accordion.classList.contains('collapsed');
          accordion.classList.toggle('collapsed');
          if (wasCollapsed) {
            const segId = accordion.dataset.segmentId;
            this.onSegmentExpand(segId, accordion);
          }
        }
        return;
      }

      // Raw markdown toggle
      const rawToggle = e.target.closest('.raw-md-toggle');
      if (rawToggle) {
        const pre = rawToggle.closest('.block-card')?.querySelector('.raw-md-content')
                 || rawToggle.closest('.table-card')?.querySelector('.raw-md-content');
        if (pre) {
          pre.classList.toggle('hidden');
          rawToggle.textContent = pre.classList.contains('hidden') ? 'Show raw markdown' : 'Hide raw markdown';
        }
        return;
      }

      // Cross-ref context expand
      const ctxToggle = e.target.closest('.crossref-ctx-toggle');
      if (ctxToggle) {
        const full = ctxToggle.previousElementSibling;
        if (full) {
          full.classList.toggle('hidden');
          ctxToggle.textContent = full.classList.contains('hidden') ? 'Show context' : 'Hide context';
        }
        return;
      }

      // Segment raw JSON button
      const segJsonBtn = e.target.closest('.segment-json-btn');
      if (segJsonBtn) {
        const segIdx = parseInt(segJsonBtn.dataset.segmentIndex, 10);
        const data = this.cache[this.currentDoc];
        if (data && data.segments && data.segments[segIdx]) {
          this.openRawJsonModal(data.segments[segIdx]);
        }
        return;
      }

      // Skeleton item click → scroll to segment
      const skelItem = e.target.closest('.skeleton-item');
      if (skelItem) {
        const segId = skelItem.dataset.segmentId;
        if (segId) {
          const accordion = document.querySelector(`.segment-accordion[data-segment-id="${segId}"]`);
          if (accordion) {
            accordion.classList.remove('collapsed');
            this.onSegmentExpand(segId, accordion);
            accordion.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
        return;
      }

      // Definitions load more
      const loadMoreDefs = e.target.closest('.load-more-defs');
      if (loadMoreDefs) {
        this.renderAllDefinitions();
        return;
      }
    });
  }

  // ============================================
  // PDF Panel Collapse/Expand
  // ============================================
  setPdfCollapsed(collapsed) {
    this.pdfCollapsed = collapsed;
    const pdfPanel = document.getElementById('pdfPanel');
    const expandHandle = document.getElementById('expandHandle');
    const mainContent = document.querySelector('.main-content');

    if (collapsed) {
      pdfPanel.classList.add('hidden');
      expandHandle.classList.remove('hidden');
      mainContent.classList.add('pdf-collapsed');
    } else {
      pdfPanel.classList.remove('hidden');
      expandHandle.classList.add('hidden');
      mainContent.classList.remove('pdf-collapsed');
    }
  }

  // ============================================
  // Tab Switching
  // ============================================
  async switchTab(doc) {
    this.currentDoc = doc;

    // Update tab active state
    document.querySelectorAll('.doc-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.doc === doc);
    });

    // Clean up observers
    this.cleanupObservers();
    this.renderedSegments.clear();
    this.segmentBlockOffset = {};

    const pdfPanel = document.getElementById('pdfPanel');
    const expandHandle = document.getElementById('expandHandle');
    const mainContent = document.querySelector('.main-content');
    const panelActions = document.querySelector('#jsonPanel .panel-actions');

    if (doc === 'explanation') {
      // Hide PDF panel entirely for Tech Brief, hide stats, hide JSON actions
      pdfPanel.classList.add('hidden');
      expandHandle.classList.add('hidden');
      mainContent.classList.add('pdf-collapsed');
      document.getElementById('processingStats').style.display = 'none';
      panelActions.classList.add('hidden');
      document.getElementById('jsonPanelTitle').textContent = 'Tech Brief';
      await this.loadExplanation();
    } else {
      // Restore PDF panel per user's collapse preference
      if (this.pdfCollapsed) {
        pdfPanel.classList.add('hidden');
        expandHandle.classList.remove('hidden');
        mainContent.classList.add('pdf-collapsed');
      } else {
        pdfPanel.classList.remove('hidden');
        expandHandle.classList.add('hidden');
        mainContent.classList.remove('pdf-collapsed');
      }
      document.getElementById('processingStats').style.display = '';
      panelActions.classList.remove('hidden');
      document.getElementById('jsonPanelTitle').textContent = 'Extracted Structure';
      await this.loadDocument(doc);
    }
  }

  // ============================================
  // Data Loading
  // ============================================
  async loadDocument(docKey) {
    const container = document.getElementById('contentBody');

    if (this.cache[docKey]) {
      this.renderDocument(this.cache[docKey], docKey);
      return;
    }

    // Show loading
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading ${DOCUMENTS[docKey].name}...</p></div>`;

    try {
      const response = await fetch(DOCUMENTS[docKey].jsonPath);
      const data = await response.json();
      this.cache[docKey] = data;
      this.renderDocument(data, docKey);
    } catch (err) {
      container.innerHTML = `<div class="error-state">Failed to load document: ${err.message}</div>`;
    }
  }

  async loadExplanation() {
    const container = document.getElementById('contentBody');

    if (this.explanationCache) {
      container.innerHTML = `<div class="markdown-rendered">${this.explanationCache}</div>`;
      return;
    }

    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading Tech Brief...</p></div>`;

    try {
      const response = await fetch(EXPLANATION_PATH);
      const text = await response.text();
      this.explanationCache = marked(text);
      container.innerHTML = `<div class="markdown-rendered">${this.explanationCache}</div>`;
    } catch (err) {
      container.innerHTML = `<div class="error-state">Failed to load explanation: ${err.message}</div>`;
    }
  }

  // ============================================
  // Document Rendering — Main Entry
  // ============================================
  renderDocument(data, docKey) {
    const meta = data.metadata || {};
    const docInfo = data.document_info || {};

    // Update stats badge
    document.getElementById('totalPages').textContent = meta.total_pages || '-';
    document.getElementById('totalSegments').textContent = meta.total_segments || '-';
    document.getElementById('totalBlocks').textContent = meta.total_blocks?.toLocaleString() || '-';

    // Update PDF iframe
    const pdfViewer = document.getElementById('pdfViewer');
    if (meta.document_url) {
      pdfViewer.src = meta.document_url;
    }

    const container = document.getElementById('contentBody');
    container.innerHTML = [
      this.renderMetadataDashboard(meta),
      this.renderDocumentInfo(docInfo),
      this.renderDefinitions(data),
      this.renderSkeleton(docInfo),
      this.renderSegments(data.segments || []),
      this.renderImagesSummary(data.segments || []),
    ].join('');
  }

  // ============================================
  // Section 1: Metadata Dashboard
  // ============================================
  renderMetadataDashboard(meta) {
    const cost = meta.cost || {};
    const time = meta.processing_time || {};
    const quality = meta.quality || {};
    const prescan = meta.prescan_summary || {};

    // Consistency score color
    const score = quality.consistency_score ?? 0;
    const scoreColor = score >= 0.9 ? 'var(--success)' : score >= 0.7 ? 'var(--warning)' : 'var(--error)';
    const scorePct = (score * 100).toFixed(1);

    // Stat cards
    const statCards = `
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-card-value">${meta.total_pages || '-'}</div>
          <div class="stat-card-label">Total Pages</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">${meta.total_segments || '-'}</div>
          <div class="stat-card-label">Total Segments</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">${meta.total_blocks?.toLocaleString() || '-'}</div>
          <div class="stat-card-label">Total Blocks</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value" style="color: ${scoreColor}">${scorePct}%</div>
          <div class="stat-card-label">Consistency</div>
        </div>
      </div>
    `;

    // Cost grid
    const costGrid = `
      <div class="subsection-title">Cost Breakdown</div>
      <div class="stat-grid">
        <div class="stat-card stat-card-highlight">
          <div class="stat-card-value" style="color: var(--success)">$${(cost.total ?? 0).toFixed(4)}</div>
          <div class="stat-card-label">Total Cost</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">$${(cost.per_page ?? 0).toFixed(4)}</div>
          <div class="stat-card-label">Per Page</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">$${(cost.pass0 ?? 0).toFixed(4)}</div>
          <div class="stat-card-label">Pass 0 (OCR)</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">$${(cost.pass1 ?? 0).toFixed(4)}</div>
          <div class="stat-card-label">Pass 1 (Structure)</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">$${(cost.pass2 ?? 0).toFixed(4)}</div>
          <div class="stat-card-label">Pass 2 (Extract)</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">${cost.llm_calls?.pass1 ?? '-'}</div>
          <div class="stat-card-label">LLM Calls (P1)</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">${cost.llm_calls?.pass2 ?? '-'}</div>
          <div class="stat-card-label">LLM Calls (P2)</div>
        </div>
      </div>
    `;

    // Processing time grid
    const timeGrid = `
      <div class="subsection-title">Processing Time</div>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-card-value">${time.pass0_ocr || '-'}</div>
          <div class="stat-card-label">Pass 0 (OCR)</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">${time.pass1_convention || '-'}</div>
          <div class="stat-card-label">Pass 1 (Convention)</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">${time.pass2_blocks || '-'}</div>
          <div class="stat-card-label">Pass 2 (Blocks)</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">${time.pass3_stitch || '-'}</div>
          <div class="stat-card-label">Pass 3 (Stitch)</div>
        </div>
        <div class="stat-card stat-card-highlight">
          <div class="stat-card-value" style="color: var(--accent-secondary)">${time.total || '-'}</div>
          <div class="stat-card-label">Total Time</div>
        </div>
      </div>
    `;

    // Quality section
    const qualitySection = `
      <div class="subsection-title">Quality</div>
      <div class="quality-bar-container">
        <div class="quality-bar" style="width: ${scorePct}%; background: ${scoreColor}"></div>
      </div>
      <div class="quality-meta">
        <span>Score: ${scorePct}%</span>
        <span>Issues: ${quality.consistency_issues ?? 0}</span>
        <span>Warnings: ${quality.consistency_warnings ?? 0}</span>
        <span>Ambiguous Refs: ${quality.ambiguous_refs ?? 0}</span>
      </div>
    `;

    // Prescan summary (collapsed by default)
    let prescanHtml = '';
    if (prescan && prescan.totalPages) {
      const dominantRows = Object.entries(prescan.dominantPatterns || {}).map(([level, info]) =>
        `<tr><td>${level}</td><td><code>${this.escapeHtml(info.pattern)}</code></td><td>${info.count}</td></tr>`
      ).join('');

      const segmentList = (prescan.segments || []).map(s => `<span class="tag">${this.escapeHtml(s)}</span>`).join(' ');
      const breakPages = (prescan.breakPages || []).map(p => `<span class="tag">${p}</span>`).join(' ');

      prescanHtml = `
        <div class="section collapsed" style="margin-top: var(--spacing-md);">
          <div class="section-header">
            <h3>Prescan Summary</h3>
            <span class="section-badge">${prescan.totalPages} pages scanned</span>
            <span class="section-toggle">▼</span>
          </div>
          <div class="section-content">
            <div class="data-row"><span class="data-label">Pages with Content</span><span class="data-value">${prescan.pagesWithContent}</span></div>
            <div class="data-row"><span class="data-label">Segments Detected</span><span class="data-value">${prescan.segmentCount}</span></div>
            <div class="data-row"><span class="data-label">Convention Breaks</span><span class="data-value">${prescan.conventionBreaks}</span></div>
            <div class="data-row"><span class="data-label">Tables Detected</span><span class="data-value">${prescan.totalTables}</span></div>
            <div class="data-row"><span class="data-label">Images Detected</span><span class="data-value">${prescan.totalImages}</span></div>
            ${dominantRows ? `
              <div class="subsection-title" style="margin-top: var(--spacing-md);">Dominant Patterns</div>
              <table class="data-table">
                <thead><tr><th>Level</th><th>Pattern</th><th>Count</th></tr></thead>
                <tbody>${dominantRows}</tbody>
              </table>
            ` : ''}
            ${segmentList ? `<div class="subsection-title" style="margin-top: var(--spacing-md);">Segments</div><div class="tag-list">${segmentList}</div>` : ''}
            ${breakPages ? `<div class="subsection-title" style="margin-top: var(--spacing-md);">Break Pages</div><div class="tag-list">${breakPages}</div>` : ''}
          </div>
        </div>
      `;
    }

    return `
      <div class="section">
        <div class="section-header">
          <h3>Metadata Dashboard</h3>
          <span class="section-badge">${meta.schema_version || 'v3'}</span>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          ${statCards}
          ${costGrid}
          ${timeGrid}
          ${qualitySection}
          ${prescanHtml}
        </div>
      </div>
    `;
  }

  // ============================================
  // Section 2: Document Info
  // ============================================
  renderDocumentInfo(docInfo) {
    if (!docInfo) return '';

    // Title/type/language row
    const infoRow = `
      <div class="stat-grid stat-grid-3">
        <div class="stat-card">
          <div class="stat-card-value" style="font-size: 0.95rem;">${this.escapeHtml(docInfo.title || 'N/A')}</div>
          <div class="stat-card-label">Title</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value" style="text-transform: capitalize;">${docInfo.document_type || 'N/A'}</div>
          <div class="stat-card-label">Document Type</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">${docInfo.language || 'N/A'}</div>
          <div class="stat-card-label">Language</div>
        </div>
      </div>
    `;

    // Parties
    let partiesHtml = '';
    if (docInfo.parties && docInfo.parties.length > 0) {
      const cards = docInfo.parties.map(p => `
        <div class="party-card">
          <div class="party-avatar">${(p.name || '?').charAt(0)}</div>
          <div class="party-info">
            <div class="party-name">${this.escapeHtml(p.name)}</div>
            <div class="party-role">${this.escapeHtml(p.role)}</div>
            ${p.abbreviation ? `<span class="party-abbr">${this.escapeHtml(p.abbreviation)}</span>` : ''}
          </div>
        </div>
      `).join('');
      partiesHtml = `<div class="subsection-title">Parties</div>${cards}`;
    }

    // Key dates
    let datesHtml = '';
    if (docInfo.key_dates && docInfo.key_dates.length > 0) {
      const rows = docInfo.key_dates.map(d => `
        <div class="date-row">
          <span class="date-type">${this.escapeHtml(this.formatLabel(d.date_type))}</span>
          <span class="date-value">${this.escapeHtml(d.date_value)}</span>
          <span class="date-context">${this.escapeHtml(d.context || '')}</span>
        </div>
      `).join('');
      datesHtml = `<div class="subsection-title">Key Dates</div>${rows}`;
    }

    // Numbering convention
    let numberingHtml = '';
    const nc = docInfo.numbering_convention;
    if (nc) {
      const levelsRows = (nc.level_conventions || []).map(lc => `
        <tr>
          <td>${lc.level}</td>
          <td>${this.escapeHtml(lc.style)}</td>
          <td>${(lc.examples || []).map(e => `<code>${this.escapeHtml(e)}</code>`).join(', ')}</td>
          <td><code>${this.escapeHtml(lc.label_pattern || '')}</code></td>
        </tr>
      `).join('');

      const notes = (nc.consistency_notes || []).map(n => `<li>${this.escapeHtml(n)}</li>`).join('');

      numberingHtml = `
        <div class="subsection-title">Numbering Convention</div>
        <div class="stat-grid stat-grid-3" style="margin-bottom: var(--spacing-md);">
          <div class="stat-card"><div class="stat-card-value">${this.escapeHtml(nc.primary_style || 'N/A')}</div><div class="stat-card-label">Primary Style</div></div>
          <div class="stat-card"><div class="stat-card-value">L${nc.max_depth || '-'}</div><div class="stat-card-label">Max Depth</div></div>
          <div class="stat-card"><div class="stat-card-value">${(nc.level_conventions || []).length}</div><div class="stat-card-label">Levels Defined</div></div>
        </div>
        ${levelsRows ? `
          <table class="data-table">
            <thead><tr><th>Level</th><th>Style</th><th>Examples</th><th>Label Pattern</th></tr></thead>
            <tbody>${levelsRows}</tbody>
          </table>
        ` : ''}
        ${notes ? `<div class="subsection-title" style="margin-top: var(--spacing-md);">Consistency Notes</div><ul class="notes-list">${notes}</ul>` : ''}
      `;
    }

    return `
      <div class="section">
        <div class="section-header">
          <h3>Document Info</h3>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          ${infoRow}
          ${partiesHtml}
          ${datesHtml}
          ${numberingHtml}
        </div>
      </div>
    `;
  }

  // ============================================
  // Section 3: Definitions
  // ============================================
  renderDefinitions(data) {
    // Aggregate definitions from document_info and per-segment
    const allDefs = [];

    // From document_info
    if (data.document_info?.definitions) {
      data.document_info.definitions.forEach(d => {
        allDefs.push({ ...d, source: 'document_info' });
      });
    }

    // From each segment
    (data.segments || []).forEach(seg => {
      if (seg.definitions && seg.definitions.length > 0) {
        seg.definitions.forEach(d => {
          // Avoid duplicates by term
          if (!allDefs.some(existing => existing.term === d.term)) {
            allDefs.push({ ...d, source: seg.segment?.segment_id || 'segment' });
          }
        });
      }
    });

    if (allDefs.length === 0) return '';

    // Store for "load more"
    this._allDefinitions = allDefs;
    const INITIAL = 30;
    const defsToShow = allDefs.slice(0, INITIAL);

    const cards = defsToShow.map(d => this.renderDefinitionCard(d)).join('');
    const moreCount = allDefs.length - INITIAL;

    return `
      <div class="section">
        <div class="section-header">
          <h3>Definitions</h3>
          <span class="section-badge">${allDefs.length}</span>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          <input type="text" class="filter-input" placeholder="Filter definitions..." oninput="window.__app.filterDefinitions(this.value)" />
          <div id="definitionsContainer">
            ${cards}
            ${moreCount > 0 ? `<button class="btn-load-more load-more-defs">Load ${moreCount} more definitions</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderDefinitionCard(d) {
    return `
      <div class="definition-card" data-term="${this.escapeHtml(d.term?.toLowerCase() || '')}">
        <div class="def-term">${this.escapeHtml(d.term)}</div>
        <div class="def-text">${this.escapeHtml(d.definition)}</div>
        <div class="def-meta">
          ${d.section_path ? `<span class="tag">&#167; ${this.escapeHtml(d.section_path)}</span>` : ''}
          ${d.segment_id ? `<span class="tag">${this.escapeHtml(d.segment_id)}</span>` : ''}
          ${d.source ? `<span class="tag tag-muted">${this.escapeHtml(d.source)}</span>` : ''}
        </div>
      </div>
    `;
  }

  renderAllDefinitions() {
    if (!this._allDefinitions) return;
    const container = document.getElementById('definitionsContainer');
    if (!container) return;
    container.innerHTML = this._allDefinitions.map(d => this.renderDefinitionCard(d)).join('');
  }

  filterDefinitions(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('.definition-card').forEach(card => {
      const term = card.dataset.term || '';
      card.style.display = term.includes(q) ? '' : 'none';
    });
  }

  // ============================================
  // Section 4: Skeleton / Table of Contents
  // ============================================
  renderSkeleton(docInfo) {
    const skeleton = docInfo.skeleton;
    if (!skeleton || skeleton.length === 0) return '';

    const items = skeleton.map(item => `
      <div class="skeleton-item" data-segment-id="${this.escapeHtml(item.segment_id || '')}" data-title="${this.escapeHtml((item.title || '').toLowerCase())}" style="padding-left: ${(item.indent_level || 0) * 18}px;">
        <span class="skel-label">${this.escapeHtml(item.section_label || '')}</span>
        <span class="skel-title">${this.escapeHtml(this.truncate(item.title || '', 80))}</span>
        <span class="tag tag-sm">${this.escapeHtml(item.segment_id || '')}</span>
        ${item.page_number ? `<span class="skel-page">p.${item.page_number}</span>` : ''}
      </div>
    `).join('');

    return `
      <div class="section">
        <div class="section-header">
          <h3>Skeleton / Table of Contents</h3>
          <span class="section-badge">${skeleton.length} entries</span>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          <input type="text" class="filter-input" placeholder="Filter skeleton..." oninput="window.__app.filterSkeleton(this.value)" />
          <div class="skeleton-tree" id="skeletonTree">
            ${items}
          </div>
        </div>
      </div>
    `;
  }

  filterSkeleton(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('.skeleton-item').forEach(item => {
      const title = item.dataset.title || '';
      item.style.display = title.includes(q) ? '' : 'none';
    });
  }

  // ============================================
  // Section 5: Segments (main content)
  // ============================================
  renderSegments(segments) {
    if (!segments || segments.length === 0) return '';

    const accordions = segments.map((seg, idx) => {
      const s = seg.segment || {};
      const stats = seg.stats || {};
      const icon = SEGMENT_ICONS[s.segment_type] || '📄';
      const blockCount = stats.total_blocks || 0;

      return `
        <div class="segment-accordion collapsed" data-segment-id="${this.escapeHtml(s.segment_id || '')}" data-segment-index="${idx}">
          <div class="segment-header">
            <div class="segment-header-left">
              <span class="segment-icon">${icon}</span>
              <span class="segment-type-badge">${this.escapeHtml(this.formatLabel(s.segment_type || 'unknown'))}</span>
              <span class="segment-title">${this.escapeHtml(s.title || 'Untitled')}</span>
            </div>
            <div class="segment-header-right">
              <span class="segment-pages">p.${s.page_start || '?'}–${s.page_end || '?'}</span>
              <span class="segment-block-count">${blockCount} blocks</span>
              <button class="segment-json-btn" data-segment-index="${idx}" title="View segment JSON">{ }</button>
            </div>
          </div>
          <div class="segment-body">
            <div class="segment-stats-bar" id="segStats-${idx}"></div>
            <div class="segment-blocks" id="segBlocks-${idx}"></div>
            <div class="segment-tables" id="segTables-${idx}"></div>
            <div class="segment-crossrefs" id="segCrossrefs-${idx}"></div>
            <div class="segment-defs" id="segDefs-${idx}"></div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="section">
        <div class="section-header">
          <h3>Segments</h3>
          <span class="section-badge">${segments.length} segments</span>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content segments-container">
          ${accordions}
        </div>
      </div>
    `;
  }

  // ============================================
  // Segment Expand Handler (Lazy Load)
  // ============================================
  onSegmentExpand(segId, accordion) {
    if (this.renderedSegments.has(segId)) return;
    this.renderedSegments.add(segId);

    const data = this.cache[this.currentDoc];
    if (!data || !data.segments) return;

    const idx = parseInt(accordion.dataset.segmentIndex, 10);
    const seg = data.segments[idx];
    if (!seg) return;

    const stats = seg.stats || {};
    const blocks = seg.blocks || [];
    const tables = seg.tables || [];
    const crossRefs = seg.cross_references || [];
    const defs = seg.definitions || [];

    // Render stats bar
    this.renderSegmentStats(idx, stats);

    // Render blocks (batched for large segments)
    this.segmentBlockOffset[segId] = 0;
    this.renderBlockBatch(idx, segId, blocks);

    // Render tables
    this.renderSegmentTables(idx, tables);

    // Render cross-references
    this.renderSegmentCrossRefs(idx, crossRefs);

    // Render segment definitions
    this.renderSegmentDefs(idx, defs);
  }

  // ============================================
  // Segment Stats Bar
  // ============================================
  renderSegmentStats(idx, stats) {
    const container = document.getElementById(`segStats-${idx}`);
    if (!container) return;

    const typeCounts = stats.block_type_counts || {};
    const total = stats.total_blocks || 0;
    const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

    const barSegments = sorted.map(([type, count]) => {
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
      const color = BLOCK_TYPE_COLORS[type] || '#64748b';
      return `<div class="type-bar-segment" style="width: ${pct}%; background: ${color};" title="${type}: ${count} (${pct}%)"></div>`;
    }).join('');

    const legend = sorted.slice(0, 6).map(([type, count]) => {
      const color = BLOCK_TYPE_COLORS[type] || '#64748b';
      return `<span class="type-legend-item"><span class="type-legend-dot" style="background:${color}"></span>${type.replace(/_/g, ' ')} (${count})</span>`;
    }).join('');

    container.innerHTML = `
      <div class="seg-stats-mini">
        <span>${total} blocks</span>
        <span>Max depth: ${stats.max_depth ?? '-'}</span>
        <span>Tables: ${stats.table_count ?? 0}</span>
      </div>
      <div class="type-bar">${barSegments}</div>
      <div class="type-legend">${legend}</div>
    `;
  }

  // ============================================
  // Block Rendering (Batched)
  // ============================================
  renderBlockBatch(idx, segId, blocks) {
    const container = document.getElementById(`segBlocks-${idx}`);
    if (!container) return;

    const BATCH = 50;
    const offset = this.segmentBlockOffset[segId] || 0;
    const batch = blocks.slice(offset, offset + BATCH);

    if (batch.length === 0) return;

    const html = batch.map(block => this.renderBlock(block)).join('');

    // Remove existing sentinel
    const existingSentinel = container.querySelector('.block-sentinel');
    if (existingSentinel) existingSentinel.remove();

    container.insertAdjacentHTML('beforeend', html);
    this.segmentBlockOffset[segId] = offset + batch.length;

    // Add sentinel if more blocks remain
    if (offset + batch.length < blocks.length) {
      const sentinel = document.createElement('div');
      sentinel.className = 'block-sentinel';
      sentinel.innerHTML = `<div class="loading-more">Loading more blocks... (${offset + batch.length} / ${blocks.length})</div>`;
      container.appendChild(sentinel);

      // Set up IntersectionObserver
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            observer.disconnect();
            this.renderBlockBatch(idx, segId, blocks);
          }
        });
      }, {
        root: document.getElementById('contentScroll') || null,
        rootMargin: '300px 0px',
      });
      observer.observe(sentinel);

      // Track for cleanup
      if (!this.blockObservers[segId]) this.blockObservers[segId] = [];
      this.blockObservers[segId].push(observer);
    }
  }

  renderBlock(block) {
    const typeColor = BLOCK_TYPE_COLORS[block.block_type] || '#64748b';
    const fmt = block.formatting || {};

    // Formatting badges
    const fmtBadges = [];
    if (fmt.is_bold) fmtBadges.push('<span class="fmt-badge fmt-bold">B</span>');
    if (fmt.is_italic) fmtBadges.push('<span class="fmt-badge fmt-italic">I</span>');
    if (fmt.is_underlined) fmtBadges.push('<span class="fmt-badge fmt-underline">U</span>');

    // Cross-page badges
    const pageBadges = [];
    if (block.continues_from_previous_page) pageBadges.push('<span class="tag tag-sm tag-info">Continues from prev</span>');
    if (block.continues_on_next_page) pageBadges.push('<span class="tag tag-sm tag-info">Continues on next</span>');
    if (block.has_table) pageBadges.push('<span class="tag tag-sm tag-warn">Has table</span>');
    if (block.has_image) pageBadges.push('<span class="tag tag-sm tag-warn">Has image</span>');

    // Indent indicator
    const indent = block.indent_level || 0;
    const indentDots = indent > 0 ? '<span class="indent-dots">' + '·'.repeat(indent) + '</span> L' + indent : '';

    return `
      <div class="block-card" style="margin-left: ${indent * 12}px;">
        <div class="block-header">
          <span class="block-id">${this.escapeHtml(block.block_id || '')}</span>
          <span class="block-type-badge" style="background: ${typeColor};">${this.escapeHtml(block.block_type || '')}</span>
          <span class="block-section-path">${this.escapeHtml(block.section_path || '')}</span>
          <span class="block-page">p.${block.page_number || '?'}</span>
          ${fmtBadges.join('')}
        </div>
        <div class="block-content">${this.escapeHtml(block.content || '')}</div>
        ${block.raw_markdown ? `
          <button class="raw-md-toggle">Show raw markdown</button>
          <pre class="raw-md-content hidden">${this.escapeHtml(block.raw_markdown)}</pre>
        ` : ''}
        <div class="block-meta">
          ${indentDots ? `<span class="block-indent">${indentDots}</span>` : ''}
          ${block.sequence_label ? `<span class="tag tag-sm">${this.escapeHtml(block.sequence_label)}</span>` : ''}
          ${block.parent_section_path ? `<span class="tag tag-sm tag-muted">Parent: ${this.escapeHtml(block.parent_section_path)}</span>` : ''}
          ${pageBadges.join('')}
        </div>
      </div>
    `;
  }

  // ============================================
  // Table Rendering
  // ============================================
  renderSegmentTables(idx, tables) {
    if (!tables || tables.length === 0) return;
    const container = document.getElementById(`segTables-${idx}`);
    if (!container) return;

    const html = tables.map(t => {
      const headers = t.headers || [];
      const rows = t.rows || [];
      const headRow = headers.length > 0
        ? `<thead><tr>${headers.map(h => `<th>${this.escapeHtml(h)}</th>`).join('')}</tr></thead>`
        : '';
      const bodyRows = rows.map(row => {
        const cells = Array.isArray(row) ? row : Object.values(row);
        return `<tr>${cells.map(c => `<td>${this.escapeHtml(String(c ?? ''))}</td>`).join('')}</tr>`;
      }).join('');

      return `
        <div class="table-card">
          <div class="table-card-header">
            <span class="tag">${this.escapeHtml(t.table_id || '')}</span>
            <span class="table-dims">${t.row_count || rows.length}r × ${t.col_count || headers.length}c</span>
            <span class="block-section-path">${this.escapeHtml(t.section_path || '')}</span>
            <span class="block-page">p.${t.page_number || '?'}</span>
          </div>
          <div class="table-rendered-wrapper">
            <table class="table-rendered">${headRow}<tbody>${bodyRows}</tbody></table>
          </div>
          ${t.raw_markdown ? `
            <button class="raw-md-toggle">Show raw markdown</button>
            <pre class="raw-md-content hidden">${this.escapeHtml(t.raw_markdown)}</pre>
          ` : ''}
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="subsection-title">Tables (${tables.length})</div>${html}`;
  }

  // ============================================
  // Cross-References Rendering
  // ============================================
  renderSegmentCrossRefs(idx, refs) {
    if (!refs || refs.length === 0) return;
    const container = document.getElementById(`segCrossrefs-${idx}`);
    if (!container) return;

    const html = refs.map(ref => {
      const targetType = ref.target_type || 'unknown';
      const typeClass = targetType === 'internal' ? 'tag-success' : targetType === 'external' ? 'tag-info' : 'tag-warn';
      const confidence = ref.confidence ?? 0;
      const confPct = (confidence * 100).toFixed(0);

      return `
        <div class="crossref-row">
          <span class="crossref-text">${this.escapeHtml(ref.reference_text || '')}</span>
          <span class="tag tag-sm ${typeClass}">${targetType}</span>
          <span class="crossref-target">${this.escapeHtml(ref.resolved_section_path || ref.external_document_name || '-')}</span>
          <div class="confidence-bar"><div class="confidence-fill" style="width: ${confPct}%;"></div></div>
          <span class="confidence-val">${confPct}%</span>
          ${ref.context_sentence ? `
            <div class="crossref-ctx hidden">${this.escapeHtml(ref.context_sentence)}</div>
            <button class="crossref-ctx-toggle">Show context</button>
          ` : ''}
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="subsection-title">Cross-References (${refs.length})</div>${html}`;
  }

  // ============================================
  // Segment Definitions
  // ============================================
  renderSegmentDefs(idx, defs) {
    if (!defs || defs.length === 0) return;
    const container = document.getElementById(`segDefs-${idx}`);
    if (!container) return;

    const html = defs.map(d => `
      <div class="definition-card definition-card-sm">
        <span class="def-term">${this.escapeHtml(d.term)}</span>
        <span class="def-text">${this.escapeHtml(d.definition)}</span>
      </div>
    `).join('');

    container.innerHTML = `<div class="subsection-title">Definitions (${defs.length})</div>${html}`;
  }

  // ============================================
  // Section 6: Images Summary
  // ============================================
  renderImagesSummary(segments) {
    const allImages = [];
    segments.forEach(seg => {
      if (seg.images_summary && seg.images_summary.length > 0) {
        seg.images_summary.forEach(img => {
          allImages.push({ ...img, segment_id: seg.segment?.segment_id });
        });
      }
    });

    if (allImages.length === 0) return '';

    const cards = allImages.map(img => `
      <div class="image-summary-card">
        <span class="tag">${this.escapeHtml(img.image_type || img.type || 'image')}</span>
        <span>${this.escapeHtml(img.description || img.context || '')}</span>
        <span class="tag tag-sm tag-muted">${this.escapeHtml(img.segment_id || '')}</span>
        ${img.page_number ? `<span class="block-page">p.${img.page_number}</span>` : ''}
      </div>
    `).join('');

    return `
      <div class="section">
        <div class="section-header">
          <h3>Images Summary</h3>
          <span class="section-badge">${allImages.length}</span>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          ${cards}
        </div>
      </div>
    `;
  }

  // ============================================
  // Raw JSON Modal
  // ============================================
  openRawJsonModal(data) {
    const modal = document.getElementById('rawJsonModal');
    const content = document.getElementById('rawJsonContent');
    modal.classList.remove('hidden');

    const jsonStr = JSON.stringify(data, null, 2);
    const size = new Blob([jsonStr]).size;

    if (size > 1_000_000) {
      content.textContent = 'Formatting large JSON...';
      // Use setTimeout to avoid UI freeze
      setTimeout(() => {
        content.textContent = jsonStr;
      }, 50);
    } else {
      content.textContent = jsonStr;
    }
  }

  // ============================================
  // Cleanup
  // ============================================
  cleanupObservers() {
    Object.values(this.blockObservers).forEach(observers => {
      observers.forEach(obs => obs.disconnect());
    });
    this.blockObservers = {};
  }

  // ============================================
  // Utility Functions
  // ============================================
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }

  formatLabel(str) {
    if (!str) return '';
    return str.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
}

// ============================================
// Initialize
// ============================================
const app = new DocumentBenchmark();
// Expose for inline event handlers (filter inputs)
window.__app = app;
