import './style.css';

// ============================================
// MyHero Document AI Benchmark - Main App
// ============================================

// Document and technique configurations
const DOCUMENTS = {
  contract: {
    name: 'Santa Cruz Contract',
    pdfUrl: 'https://sccrtc.org/wp-content/uploads/2010/09/SampleContract-Shuttle.pdf',
    results: {
      mistral: '/contract-mistral.json'
    }
  },
  fidic: {
    name: 'FIDIC Yellow Book',
    pdfUrl: 'https://example30164.wordpress.com/wp-content/uploads/2016/04/fidic-db-yellow-book.pdf',
    results: {
      mistral: '/fidic-mistral.json'
    }
  }
};

// ============================================
// NEW ADDITIONS - ADE Technique Support
// ============================================
// This section adds ADE (Anthropic Document Extraction) technique options
// Original code above is preserved - these are additions for new branch
// ============================================

// Extend DOCUMENTS with ADE results
DOCUMENTS.contract.results = {
  ...DOCUMENTS.contract.results, // Preserve original mistral
  'ade-modify': '/contract-ade-modify.json'
};

DOCUMENTS.fidic.results = {
  ...DOCUMENTS.fidic.results, // Preserve original mistral
  'ade-modify': '/fidic-ade-modify.json'
};

class DocumentBenchmark {
  constructor() {
    this.data = null;
    this.currentDocument = 'contract';
    this.currentTechnique = 'mistral';
    // NEW: Toggle for ADE format - show only hierarchy (like Mistral) or full content
    this.adeShowHierarchyOnly = true; // Default to hierarchy only
    this.init();
  }

  async init() {
    // NEW: Initialize technique options based on default document
    this.updateTechniqueOptions();
    
    await this.loadData();
    this.setupEventListeners();
    this.render();
  }

  async loadData() {
    try {
      this.showLoading();
      const config = DOCUMENTS[this.currentDocument];
      const jsonPath = config.results[this.currentTechnique];
      
      if (!jsonPath) {
        throw new Error(`No results available for ${this.currentTechnique} on ${config.name}`);
      }
      
      const response = await fetch(jsonPath);
      this.data = await response.json();
      
      // NEW: Store format type for rendering
      this.dataFormat = this.isADEFormat(this.data) ? 'ade' : 'mistral';
      
      console.log(`📄 Loaded ${config.name} with ${this.currentTechnique}:`, this.data);
    } catch (error) {
      console.error('Failed to load data:', error);
      this.showError(`Failed to load document analysis: ${error.message}`);
    }
  }

  setupEventListeners() {
    // Document selector
    document.getElementById('documentSelect').addEventListener('change', async (e) => {
      this.currentDocument = e.target.value;
      const config = DOCUMENTS[this.currentDocument];
      
      // Update PDF viewer
      document.getElementById('pdfViewer').src = config.pdfUrl;
      
      // NEW: Update technique options based on selected document
      this.updateTechniqueOptions();
      
      // Reload data
      await this.loadData();
      this.render();
    });

    // Technique selector
    document.getElementById('techniqueSelect').addEventListener('change', async (e) => {
      this.currentTechnique = e.target.value;
      await this.loadData();
      this.render();
    });

    // Open PDF in new tab
    document.getElementById('openInTab').addEventListener('click', () => {
      const config = DOCUMENTS[this.currentDocument];
      window.open(config.pdfUrl, '_blank');
    });

    // Raw JSON modal
    document.getElementById('toggleRawJson').addEventListener('click', () => {
      document.getElementById('rawJsonModal').classList.remove('hidden');
      document.getElementById('rawJsonContent').textContent = JSON.stringify(this.data, null, 2);
    });

    document.getElementById('closeModal').addEventListener('click', () => {
      document.getElementById('rawJsonModal').classList.add('hidden');
    });

    document.getElementById('rawJsonModal').addEventListener('click', (e) => {
      if (e.target.id === 'rawJsonModal') {
        document.getElementById('rawJsonModal').classList.add('hidden');
      }
    });

    // Section collapse toggle
    document.getElementById('jsonContent').addEventListener('click', (e) => {
      const header = e.target.closest('.section-header');
      if (header) {
        header.closest('.section').classList.toggle('collapsed');
      }
      
      // NEW: ADE toggle view button
      if (e.target.id === 'adeToggleView') {
        this.adeShowHierarchyOnly = !this.adeShowHierarchyOnly;
        // Re-render ADE visualization
        if (this.dataFormat === 'ade') {
          this.render();
        }
      }
    });
  }

  showLoading() {
    document.getElementById('jsonContent').innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading document analysis...</p>
      </div>
    `;
  }

  render() {
    if (!this.data) return;

    // NEW: Handle different formats (Mistral vs ADE)
    if (this.dataFormat === 'ade') {
      // Update stats for ADE format
      document.getElementById('totalPages').textContent = this.data.total_pages || '-';
      document.getElementById('totalSections').textContent = 
        this.data.total_sections || (this.data.sections?.length || '-');
      document.getElementById('maxDepth').textContent = 
        this.getADEMaxDepth(this.data.sections) || '-';

      // Render ADE visualization
      const container = document.getElementById('jsonContent');
      container.innerHTML = this.renderADEVisualization();
    } else {
      // Original Mistral format
      const doc = this.data.documentAnnotation;
      
      // Update stats
      document.getElementById('totalPages').textContent = this.data.metadata?.totalPages || '-';
      document.getElementById('totalSections').textContent = 
        doc?.structural_hierarchy?.length || '-';
      document.getElementById('maxDepth').textContent = 
        doc?.numbering_convention?.max_depth ? `L${doc.numbering_convention.max_depth}` : '-';

      // Render JSON visualization
      const container = document.getElementById('jsonContent');
      container.innerHTML = this.renderVisualization();
    }
  }

  renderVisualization() {
    const doc = this.data.documentAnnotation;
    if (!doc) return '<p class="text-muted">No document annotation available</p>';

    return `
      ${this.renderMetadataSection(doc)}
      ${this.renderPartiesSection(doc.parties)}
      ${this.renderNumberingSection(doc.numbering_convention)}
      ${this.renderHierarchySection(doc.structural_hierarchy)}
      ${this.renderCrossReferencesSection(doc.cross_references)}
      ${this.renderAttachmentsSection(doc.attachments)}
      ${this.renderDatesSection(doc.key_dates)}
      ${this.renderDefinitionsSection(doc.definitions)}
      ${this.renderSummarySection(doc.summary)}
      ${this.renderPagesSection(this.data.pages)}
    `;
  }

  // ============================================
  // NEW METHOD - ADE Format Visualization
  // ============================================
  // Renders ADE format exactly as it appears in JSON
  // No transformation - shows raw structure
  // ============================================
  renderADEVisualization() {
    if (!this.data || !this.data.sections) {
      return '<p class="text-muted">No sections available</p>';
    }

    return `
      ${this.renderADEMetadataSection()}
      ${this.renderADEHierarchySection(this.data.sections)}
    `;
  }

  getADEMaxDepth(sections) {
    if (!sections || sections.length === 0) return '-';
    
    let maxDepth = 0;
    const findMaxDepth = (sections, currentDepth = 0) => {
      sections.forEach(section => {
        const depth = section.level !== undefined ? section.level + 1 : currentDepth + 1;
        maxDepth = Math.max(maxDepth, depth);
        if (section.subsections && section.subsections.length > 0) {
          findMaxDepth(section.subsections, depth);
        }
      });
    };
    
    findMaxDepth(sections);
    return maxDepth > 0 ? `L${maxDepth}` : '-';
  }

  renderADEMetadataSection() {
    return `
      <div class="section">
        <div class="section-header">
          <h3>📋 Document Information</h3>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          <div class="data-row">
            <span class="data-label">Document</span>
            <span class="data-value">${this.data.document || 'N/A'}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Total Sections</span>
            <span class="data-value">${this.data.total_sections || this.data.sections?.length || 'N/A'}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Total Subsections</span>
            <span class="data-value">${this.data.total_subsections || 'N/A'}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Technique</span>
            <span class="data-value" style="color: var(--accent-secondary)">${this.currentTechnique}</span>
          </div>
          <div class="data-row" style="margin-top: var(--spacing-md); padding-top: var(--spacing-md); border-top: 1px solid var(--border-subtle);">
            <span class="data-label">View Mode</span>
            <button id="adeToggleView" class="btn-secondary" style="margin-left: auto;">
              ${this.adeShowHierarchyOnly ? '📋 Show Full Content' : '📑 Show Hierarchy Only'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderADEHierarchySection(sections) {
    if (!sections || sections.length === 0) return '';

    const renderSection = (section) => {
      const indent = section.level !== undefined ? section.level * 16 : 0;
      
      // NEW: In hierarchy mode, show full title but let CSS handle truncation for single line
      const displayTitle = section.title || '';
      
      // NEW: Ensure single line display with proper overflow handling for hierarchy mode
      const itemStyle = this.adeShowHierarchyOnly 
        ? `padding-left: ${indent}px; align-items: center !important;`
        : `padding-left: ${indent}px;`;
      
      const titleStyle = this.adeShowHierarchyOnly 
        ? 'min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;'
        : '';
      
      let html = `
        <div class="hierarchy-item" style="${itemStyle}">
          <span class="hierarchy-number" style="flex-shrink: 0;">${section.number || ''}</span>
          <span class="hierarchy-title" style="${titleStyle}">${this.escapeHtml(displayTitle)}</span>
          <span class="level-badge" style="flex-shrink: 0; margin-left: auto;">L${section.level !== undefined ? section.level + 1 : 1}</span>
        </div>
      `;

      // NEW: Only show content if toggle is set to show full content
      if (!this.adeShowHierarchyOnly && section.content) {
        html += `
          <div class="section-content-text" style="padding-left: ${indent + 20}px; margin-top: 8px; margin-bottom: 16px; color: var(--text-secondary); font-size: 0.9rem;">
            ${this.escapeHtml(this.truncate(section.content, 300))}
          </div>
        `;
      }

      if (section.subsections && section.subsections.length > 0) {
        section.subsections.forEach(subsection => {
          html += renderSection(subsection);
        });
      }

      return html;
    };

    const hierarchyHtml = sections.map(section => renderSection(section)).join('');

    return `
      <div class="section">
        <div class="section-header">
          <h3>📑 Document Structure (ADE Format)</h3>
          <span class="section-badge">${this.data.total_sections || sections.length} sections</span>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          <div class="hierarchy-tree">
            ${hierarchyHtml}
          </div>
        </div>
      </div>
    `;
  }

  renderMetadataSection(doc) {
    return `
      <div class="section">
        <div class="section-header">
          <h3>📋 Document Metadata</h3>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          <div class="data-row">
            <span class="data-label">Title</span>
            <span class="data-value">${doc.title || 'N/A'}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Document Type</span>
            <span class="data-value" style="text-transform: capitalize">${doc.document_type || 'N/A'}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Language</span>
            <span class="data-value">${doc.language || 'N/A'}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Pages</span>
            <span class="data-value">${this.data.metadata?.totalPages || 'N/A'}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Total Characters</span>
            <span class="data-value">${this.data.pages?.reduce((acc, p) => acc + (p.characterCount || 0), 0).toLocaleString() || 'N/A'}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Processed At</span>
            <span class="data-value">${new Date(this.data.metadata?.processedAt).toLocaleString() || 'N/A'}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Model</span>
            <span class="data-value" style="color: var(--accent-secondary)">${this.data.metadata?.model || 'N/A'}</span>
          </div>
        </div>
      </div>
    `;
  }

  renderPartiesSection(parties) {
    if (!parties || parties.length === 0) return '';

    const partyCards = parties.map(party => `
      <div class="party-card">
        <div class="party-avatar">${party.name?.charAt(0) || '?'}</div>
        <div class="party-info">
          <div class="party-name">${party.name}</div>
          <div class="party-role">${party.role}</div>
          ${party.abbreviation ? `<span class="party-abbr">${party.abbreviation}</span>` : ''}
        </div>
      </div>
    `).join('');

    return `
      <div class="section">
        <div class="section-header">
          <h3>👥 Parties</h3>
          <span class="section-badge">${parties.length}</span>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          ${partyCards}
        </div>
      </div>
    `;
  }

  renderNumberingSection(convention) {
    if (!convention) return '';

    const examples = (convention.examples || []).map(ex => 
      `<span class="example-tag">${ex}</span>`
    ).join('');

    return `
      <div class="section">
        <div class="section-header">
          <h3>🔢 Numbering Convention</h3>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          <div class="convention-grid">
            <div class="convention-item">
              <div class="convention-label">Primary Style</div>
              <div class="convention-value">${this.formatStyle(convention.primary_style)}</div>
            </div>
            <div class="convention-item">
              <div class="convention-label">Subsection Style</div>
              <div class="convention-value">${this.formatStyle(convention.subsection_style)}</div>
            </div>
            <div class="convention-item">
              <div class="convention-label">Max Depth</div>
              <div class="convention-value">Level ${convention.max_depth}</div>
            </div>
            <div class="convention-item">
              <div class="convention-label">Detected Pattern</div>
              <div class="convention-value">${convention.max_depth > 3 ? 'Complex' : convention.max_depth > 2 ? 'Moderate' : 'Standard'}</div>
            </div>
          </div>
          ${examples ? `
            <div style="margin-top: var(--spacing-md)">
              <div class="convention-label">Examples Found</div>
              <div class="examples-list">${examples}</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  renderHierarchySection(hierarchy) {
    if (!hierarchy || hierarchy.length === 0) return '';

    const items = hierarchy.slice(0, 50).map(item => {
      return `
        <div class="hierarchy-item" style="padding-left: ${(item.indent_level - 1) * 16}px">
          <span class="hierarchy-number">${item.section_number}</span>
          <span class="hierarchy-title">${this.truncate(item.title, 50)}</span>
          <span class="level-badge">L${item.indent_level}</span>
        </div>
      `;
    }).join('');

    const moreCount = hierarchy.length - 50;

    return `
      <div class="section">
        <div class="section-header">
          <h3>📑 Structural Hierarchy</h3>
          <span class="section-badge">${hierarchy.length} sections</span>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          <div class="hierarchy-tree">
            ${items}
            ${moreCount > 0 ? `<div style="padding: var(--spacing-md); color: var(--text-muted); text-align: center;">... and ${moreCount} more sections</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderCrossReferencesSection(refs) {
    if (!refs || refs.length === 0) return '';

    const items = refs.slice(0, 20).map(ref => `
      <div class="ref-item">
        <span class="ref-text">"${ref.reference_text}"</span>
        <span class="ref-arrow">→</span>
        <span class="ref-target">${ref.target_section}</span>
      </div>
    `).join('');

    return `
      <div class="section">
        <div class="section-header">
          <h3>🔗 Cross-References</h3>
          <span class="section-badge">${refs.length}</span>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          ${items}
          ${refs.length > 20 ? `<div style="color: var(--text-muted); text-align: center; margin-top: var(--spacing-sm)">... and ${refs.length - 20} more</div>` : ''}
        </div>
      </div>
    `;
  }

  renderAttachmentsSection(attachments) {
    if (!attachments || attachments.length === 0) return '';

    const items = attachments.map(att => `
      <div class="attachment-item">
        <span class="attachment-icon">📎</span>
        <div class="attachment-info">
          <div class="attachment-id">${att.identifier}</div>
          <div class="attachment-title">${att.title}</div>
        </div>
      </div>
    `).join('');

    return `
      <div class="section">
        <div class="section-header">
          <h3>📁 Attachments</h3>
          <span class="section-badge">${attachments.length}</span>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          ${items}
        </div>
      </div>
    `;
  }

  renderDatesSection(dates) {
    if (!dates || dates.length === 0) return '';

    const items = dates.map(date => `
      <div class="data-row">
        <span class="data-label">${this.formatDateType(date.date_type)}</span>
        <span class="data-value">${date.date_value}</span>
      </div>
    `).join('');

    return `
      <div class="section">
        <div class="section-header">
          <h3>📅 Key Dates</h3>
          <span class="section-badge">${dates.length}</span>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          ${items}
        </div>
      </div>
    `;
  }

  renderDefinitionsSection(definitions) {
    if (!definitions || definitions.length === 0) return '';

    const items = definitions.slice(0, 15).map(def => `
      <div style="margin-bottom: var(--spacing-md); padding-bottom: var(--spacing-md); border-bottom: 1px solid var(--border-subtle);">
        <div style="font-weight: 600; color: var(--accent-secondary); margin-bottom: var(--spacing-xs);">"${def.term}"</div>
        <div style="color: var(--text-secondary); font-size: 0.9rem;">${this.truncate(def.definition, 200)}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: var(--spacing-xs);">§ ${def.section_reference}</div>
      </div>
    `).join('');

    return `
      <div class="section">
        <div class="section-header">
          <h3>📖 Definitions</h3>
          <span class="section-badge">${definitions.length}</span>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          ${items}
          ${definitions.length > 15 ? `<div style="color: var(--text-muted); text-align: center;">... and ${definitions.length - 15} more definitions</div>` : ''}
        </div>
      </div>
    `;
  }

  renderSummarySection(summary) {
    if (!summary) return '';

    return `
      <div class="section">
        <div class="section-header">
          <h3>📝 Summary</h3>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          <p style="color: var(--text-secondary); line-height: 1.7;">${summary}</p>
        </div>
      </div>
    `;
  }

  renderPagesSection(pages) {
    if (!pages || pages.length === 0) return '';

    // Find pages with images first
    const pagesWithImages = pages.filter(p => p.imageAnnotations && p.imageAnnotations.length > 0);
    
    // Select first 3 pages, prioritizing those with images
    let selectedPages = [];
    if (pagesWithImages.length >= 2) {
      selectedPages = [pages[0], ...pagesWithImages.slice(0, 2)];
    } else {
      selectedPages = pages.slice(0, 3);
    }
    
    // Remove duplicates
    selectedPages = [...new Map(selectedPages.map(p => [p.pageNumber, p])).values()].slice(0, 3);

    const totalImages = pages.reduce((acc, p) => acc + (p.imageAnnotations?.length || 0), 0);

    const pageCards = selectedPages.map(page => {
      const hasImages = page.imageAnnotations && page.imageAnnotations.length > 0;
      const markdownPreview = this.truncate(page.markdown || '', 500);
      
      return `
        <div class="page-card">
          <div class="page-card-header">
            <div class="page-number-badge">Page ${page.pageNumber}</div>
            <div class="page-stats">
              <span class="page-stat">${(page.characterCount || 0).toLocaleString()} chars</span>
              ${hasImages ? `<span class="page-stat highlight">🖼️ ${page.imageAnnotations.length} images</span>` : ''}
            </div>
          </div>
          
          <div class="page-card-content">
            <div class="markdown-preview">
              <div class="preview-label">📄 Extracted Markdown</div>
              <pre class="markdown-code">${this.escapeHtml(markdownPreview)}</pre>
            </div>
            
            ${hasImages ? `
              <div class="images-section">
                <div class="preview-label">🖼️ Detected Images (BBox Annotations)</div>
                <div class="image-annotations">
                  ${page.imageAnnotations.map((img, idx) => `
                    <div class="image-annotation-card">
                      <div class="image-annotation-header">
                        <span class="image-type-badge">${img.type || 'Image'}</span>
                        <span class="image-id">ID: ${img.id || idx + 1}</span>
                      </div>
                      ${img.context ? `<div class="image-context">${this.truncate(img.context, 100)}</div>` : ''}
                      <div class="bbox-info">
                        <span class="bbox-label">Bounding Box:</span>
                        <span class="bbox-coords">[${img.topLeft?.x?.toFixed(2) || '?'}, ${img.topLeft?.y?.toFixed(2) || '?'}] → [${img.bottomRight?.x?.toFixed(2) || '?'}, ${img.bottomRight?.y?.toFixed(2) || '?'}]</span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="section pages-section">
        <div class="section-header">
          <h3>📄 Page-Level OCR Extraction</h3>
          <div style="display: flex; gap: var(--spacing-sm);">
            <span class="section-badge">${pages.length} pages</span>
            ${totalImages > 0 ? `<span class="section-badge highlight">${totalImages} images detected</span>` : ''}
          </div>
          <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
          <div class="ocr-depth-banner">
            <div class="ocr-depth-icon">🔬</div>
            <div class="ocr-depth-text">
              <strong>OCR Depth Showcase</strong>
              <p>Each page is processed individually with full markdown extraction and bounding box annotations for images, tables, and diagrams.</p>
            </div>
          </div>
          <div class="page-cards-container">
            ${pageCards}
          </div>
          ${pages.length > 3 ? `
            <div class="more-pages-note">
              Showing 3 of ${pages.length} pages • ${(pages.reduce((acc, p) => acc + (p.characterCount || 0), 0)).toLocaleString()} total characters extracted
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // Utility methods
  formatStyle(style) {
    if (!style) return 'N/A';
    return style.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  formatDateType(type) {
    if (!type) return 'Date';
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  showError(message) {
    document.getElementById('jsonContent').innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--error);">
        <p>⚠️ ${message}</p>
      </div>
    `;
  }

  // ============================================
  // NEW METHOD - ADE Format Detection
  // ============================================
  // Checks if data is in ADE format (has 'sections' array)
  // Original code above is preserved - this is addition for ADE support
  // ============================================
  
  isADEFormat(data) {
    // Check if data is in ADE format (has 'sections' array instead of 'documentAnnotation')
    return data && !data.documentAnnotation && Array.isArray(data.sections);
  }

  // ============================================
  // NEW METHOD - Dynamic Technique Options
  // ============================================
  // Updates the technique selector dropdown based on available techniques
  // for the currently selected document
  // ============================================
  updateTechniqueOptions() {
    const config = DOCUMENTS[this.currentDocument];
    const techniqueSelect = document.getElementById('techniqueSelect');
    const availableTechniques = config.results || {};
    
    // Technique display names mapping
    const techniqueNames = {
      'mistral': 'Mistral OCR Latest',
      'ade-modify': 'ADE Modify'
    };
    
    // Clear existing options
    techniqueSelect.innerHTML = '';
    
    // Add options for available techniques
    Object.keys(availableTechniques).forEach(techKey => {
      const option = document.createElement('option');
      option.value = techKey;
      option.textContent = techniqueNames[techKey] || techKey;
      
      // Set as selected if it matches current technique (if available) or first option
      if (techKey === this.currentTechnique || 
          (techniqueSelect.options.length === 0 && techKey === Object.keys(availableTechniques)[0])) {
        option.selected = true;
        this.currentTechnique = techKey;
      }
      
      techniqueSelect.appendChild(option);
    });
  }
}

// Initialize app
new DocumentBenchmark();
