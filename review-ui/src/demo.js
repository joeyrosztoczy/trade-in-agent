(function () {
  const APP_VERSION = "v0.4.1";
  const fallbackData = window.TradeReviewDemoData;
  const sidecarUrl = resolveSidecarUrl();
  const app = document.getElementById("app");
  let auth = {
    checked: false,
    required: false,
    authenticated: false,
    accessDenied: false,
    user: null,
    csrfToken: null,
    logoutUrl: "/auth/logout",
    deployment: null,
    tenantLabel: null
  };
  let data = normalizeDataset(fallbackData);
  let selectedId = data.cases[0]?.id || null;
  let activeFilter = "all";
  let searchQuery = "";
  let sortMode = "updated";
  let loading = true;
  let error = null;
  let fatalError = null;
  let hasLoadedQueue = false;
  let pendingAction = null;
  let selectedEvidenceId = null;
  let toast = null;

  function resolveSidecarUrl() {
    if (window.TRADE_REVIEW_SIDECAR_URL) return String(window.TRADE_REVIEW_SIDECAR_URL).replace(/\/$/, "");
    if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) return "http://127.0.0.1:8788";
    return "";
  }

  function apiUrl(path) {
    return `${sidecarUrl}${path}`;
  }

  function normalizeDataset(payload) {
    const user = currentUserSummary();
    if (payload?.items) {
      return {
        user: user || {
          name: "Used Team",
          initials: "UT",
          period: "Live sidecar"
        },
        summary: normalizeSummary(payload.summary, payload.generatedAt),
        cases: payload.items.map(normalizeCase)
      };
    }
    const fallback = payload || {};
    return {
      user: user || {
        name: fallback.user?.name || "Used Team",
        initials: fallback.user?.initials || "UT",
        period: fallback.user?.period || "Static fallback"
      },
      summary: normalizeSummary(fallback.summary || {}, fallback.summary?.lastSync),
      cases: (fallback.cases || []).map(normalizeCase)
    };
  }

  function normalizeSummary(summary = {}, generatedAt) {
    return {
      lastSync: formatTimestamp(summary.lastSync || generatedAt),
      locationsOnline: summary.locationsOnline || "Sidecar",
      slaBreaches: summary.slaBreaches || "0",
      kpis: summary.kpis || [
        { label: "Open Reviews", value: String(summary.openReviews || 0), delta: "live", tone: "info" },
        { label: "Ready", value: String(summary.readyForReview || 0), delta: "for desk", tone: "good" },
        { label: "Field Evidence", value: String(summary.fieldCollection || 0), delta: "needs more", tone: "watch" },
        { label: "Avg Risk Score", value: String(summary.avgRiskScore || 0), suffix: "/100", delta: "queue", tone: "watch" }
      ]
    };
  }

  function normalizeCase(item) {
    const low = item.lowValue ?? item.proposedTrade ?? null;
    const high = item.highValue ?? item.proposedTrade ?? low;
    const packet = item.packet || null;
    const evidenceItems = item.evidenceItems || [];
    const actions = item.actions || [];
    return {
      ...item,
      id: item.id,
      caseNumber: item.caseNumber || item.id,
      unit: item.unit || "Unknown combine",
      modelYear: item.modelYear || "TBD",
      type: item.type || "Combine",
      serial: item.serial || "Unconfirmed",
      hours: item.hours || "Unconfirmed",
      customer: item.customer || item.source?.dealer || "Field source",
      location: item.location || "Location TBD",
      stage: item.stage || item.reviewStatusLabel || "Review",
      route: item.route || "Review",
      routeKey: item.routeKey || item.route || "draft",
      age: item.age || "today",
      risk: item.risk || "medium",
      riskScore: Number(item.riskScore || 50),
      reviewStatus: item.reviewStatus || item.reviewStatusLabel || "field_collection",
      reviewStatusLabel: item.reviewStatusLabel || item.stage || "Review",
      confidence: item.confidence || "Pending",
      proposedTrade: item.proposedTrade ?? null,
      lowValue: low,
      highValue: high,
      reconBudget: item.reconBudget ?? null,
      reconLow: item.reconLow ?? null,
      reconHigh: item.reconHigh ?? null,
      specs: item.specs || [],
      riskFactors: item.riskFactors || [],
      evidence: item.evidence || [],
      evidenceItems,
      reviewLines: item.reviewLines || [],
      summary: item.summary || "No reviewer readout is available yet.",
      sourceUrl: item.sourceUrl || item.source?.url || null,
      source: item.source || {},
      packet,
      checklist: item.checklist || {},
      processingSummary: item.processingSummary || {},
      latestAction: item.latestAction || actions[0] || null,
      actions
    };
  }

  function formatMoney(value) {
    if (value == null || Number.isNaN(Number(value))) return "TBD";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(value);
  }

  function formatTimestamp(value) {
    if (!value) return "Not synced";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function currentUserSummary() {
    if (!auth.user) return null;
    const displayName = auth.user.displayName || auth.user.name || auth.user.email || auth.user.upn || "Reviewer";
    return {
      name: displayName,
      initials: initialsFor(displayName),
      period: auth.required ? humanize(auth.user.roles?.slice(-1)[0] || "reviewer") : "Local review"
    };
  }

  function currentDeploymentBrand() {
    const raw = String(auth.tenantLabel || auth.deployment || auth.user?.deployment || "").trim();
    const host = String(window.location.hostname || "").toLowerCase();
    const normalized = raw.toLowerCase();
    let name = "";

    if (normalized.includes("stotz") || host.includes("stotz")) {
      name = "Stotz";
    } else if (normalized.includes("premier") || host.includes("premier")) {
      name = "Premier";
    } else if (raw) {
      name = humanize(raw);
    } else {
      name = "Used Equipment";
    }

    return {
      name,
      title: name === "Used Equipment" ? name : `${name} Used Equipment`,
      mark: name.slice(0, 1).toUpperCase() || "U"
    };
  }

  function initialsFor(value) {
    const parts = String(value || "Reviewer").replace(/<.*>/g, "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "RV";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  function hasAnyRole(roles) {
    const current = new Set(auth.user?.roles || []);
    return roles.some((role) => current.has(role));
  }

  function canApprovePacket() {
    return !auth.required || hasAnyRole(["manager", "admin"]);
  }

  function authHeaders(json = false) {
    const headers = {};
    if (json) headers["Content-Type"] = "application/json";
    if (auth.csrfToken) headers["X-CSRF-Token"] = auth.csrfToken;
    return headers;
  }

  function toneForRisk(risk) {
    if (risk === "low") return "good";
    if (risk === "medium") return "watch";
    return "risk";
  }

  function toneForStatus(item) {
    if (item.reviewStatus === "approved") return "good";
    if (item.reviewStatus === "technician_inspection_required" || item.routeKey === "technician_inspection_required") return "risk";
    if (item.reviewStatus === "ready_for_fast_review" || item.reviewStatus === "ready_for_standard_review") return "good";
    if (item.reviewStatus === "central_review_hold") return "risk";
    return "watch";
  }

  function textMatches(item) {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [
      item.caseNumber,
      item.unit,
      item.modelYear,
      item.serial,
      item.customer,
      item.location,
      item.route,
      item.stage,
      item.sourceUrl
    ].filter(Boolean).join(" ").toLowerCase().includes(query);
  }

  function filterMatches(item) {
    if (activeFilter === "all") return true;
    if (activeFilter === "high") return item.risk === "high";
    if (activeFilter === "ready") return ["ready_for_fast_review", "ready_for_standard_review"].includes(item.reviewStatus);
    if (activeFilter === "field") return item.reviewStatus === "field_collection" || item.routeKey === "needs_more_evidence";
    if (activeFilter === "tech") return item.reviewStatus === "technician_inspection_required" || item.routeKey === "technician_inspection_required";
    if (activeFilter === "valued") return item.proposedTrade != null || item.reconBudget != null;
    if (activeFilter === "failed") return Number(item.processingSummary.failed || 0) > 0;
    return item.risk === activeFilter || item.route.toLowerCase().includes(activeFilter);
  }

  function filteredCases() {
    return data.cases
      .filter((item) => textMatches(item) && filterMatches(item))
      .sort((a, b) => {
        if (sortMode === "risk") return Number(b.riskScore || 0) - Number(a.riskScore || 0);
        if (sortMode === "value") return Number(b.proposedTrade || 0) - Number(a.proposedTrade || 0);
        if (sortMode === "evidence") return evidenceCompleteness(b) - evidenceCompleteness(a);
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
      });
  }

  function selectedCase() {
    return data.cases.find((item) => item.id === selectedId) || data.cases[0] || null;
  }

  function selectedEvidence(item) {
    if (!item || !selectedEvidenceId) return null;
    return (item.evidenceItems || []).find((evidence) => evidence.id === selectedEvidenceId) || null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function riskChip(risk) {
    return `<span class="ti-risk" data-risk="${escapeHtml(risk)}"><span class="ti-dot"></span>${escapeHtml(risk)}</span>`;
  }

  function badge(value, tone) {
    return `<span class="ti-badge" data-tone="${escapeHtml(tone)}">${escapeHtml(value)}</span>`;
  }

  function meter(value, tone) {
    const color = tone === "high"
      ? "var(--ti-color-risk-high)"
      : tone === "medium"
        ? "var(--ti-color-risk-medium)"
        : "var(--ti-color-risk-low)";
    return `
      <div class="ti-meter" style="--meter-value:${Number(value)}%; --meter-color:${color}">
        <div class="ti-meter__track"><div class="ti-meter__fill"></div></div>
        <div class="ti-meter__value">${escapeHtml(value)}</div>
      </div>
    `;
  }

  function humanize(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function evidenceCompleteness(item) {
    const checklist = item.checklist || {};
    const required = Number(checklist.requiredCount || item.processingSummary.registered || 0);
    const complete = Number(checklist.acceptedCount || item.processingSummary.complete || 0);
    if (!required) return complete;
    return Math.round((complete / required) * 100);
  }

  function evidenceQueueLabel(item) {
    const summary = item.processingSummary || {};
    const failed = Number(summary.failed || 0);
    const active = Number(summary.processing || 0) + Number(summary.queued || 0) + Number(summary.pending || 0);
    if (failed) return `${failed} failed`;
    if (active) return `${active} processing`;
    const accepted = Number(item.checklist?.acceptedCount || 0);
    const missing = Number(item.checklist?.missingCount || 0);
    if (accepted || missing) return `${accepted} ok / ${missing} missing`;
    return `${summary.complete || 0} done`;
  }

  function previewableEvidence(items = []) {
    return items.filter((item) => isPreviewableMedia(item));
  }

  function isPreviewableMedia(evidence = {}) {
    const uri = String(evidence.storageUri || "");
    const contentType = String(evidence.contentType || "");
    return contentType.startsWith("image/") || /^https?:\/\/.+\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(uri);
  }

  function packetMarkdown(item) {
    return item?.packet?.markdown || item?.packet?.preview || "";
  }

  function renderTopbar() {
    const brand = currentDeploymentBrand();
    return `
      <header class="ti-topbar">
        <div class="ti-brand">
          <div class="ti-brand__mark">${escapeHtml(brand.mark)}</div>
          <div>
            <span class="ti-brand__name">${escapeHtml(brand.title)}</span>
            <span class="ti-brand__meta">Trade Desk / Review Ops</span>
          </div>
        </div>
        <nav class="ti-nav" aria-label="Review navigation">
          <a class="ti-nav__item" aria-current="page" href="#">Trade Queue</a>
          <a class="ti-nav__item" href="#evidence-panel">Evidence</a>
          <a class="ti-nav__item" href="#packet-panel">Packet</a>
          <a class="ti-nav__item" href="#history-panel">History</a>
        </nav>
        <div class="ti-topbar__right">
          ${badge(loading ? "Syncing" : error ? "Demo fallback" : data.user.period, error ? "watch" : "info")}
          <span>${escapeHtml(data.user.name)}</span>
          <div class="ti-avatar" aria-label="${escapeHtml(data.user.name)}">${escapeHtml(data.user.initials)}</div>
          ${auth.required ? renderLogoutButton() : ""}
        </div>
      </header>
    `;
  }

  function renderLogoutButton() {
    return `
      <button class="ti-button ti-logout-button" type="button" data-auth-logout aria-label="Sign out">
        <span class="ti-logout-button__icon" aria-hidden="true"></span>
        <span class="ti-logout-button__label">Sign out</span>
      </button>
    `;
  }

  function renderPagehead() {
    const eyebrow = error ? "Static fallback data" : "Sidecar-backed review queue";
    return `
      <section class="ti-pagehead" aria-labelledby="review-title">
        <div>
          <div class="ti-eyebrow">${escapeHtml(eyebrow)}</div>
          <h1 id="review-title" class="ti-title">Open trade <em>review queue</em></h1>
        </div>
        <div class="ti-meta-list" aria-label="Queue metadata">
          <div class="ti-meta"><span class="ti-meta__label">Last sync</span><span class="ti-meta__value">${escapeHtml(data.summary.lastSync)}</span></div>
          <div class="ti-meta"><span class="ti-meta__label">Sources</span><span class="ti-meta__value">${escapeHtml(data.summary.locationsOnline)}</span></div>
          <div class="ti-meta"><span class="ti-meta__label">SLA breaches</span><span class="ti-meta__value">${escapeHtml(data.summary.slaBreaches)}</span></div>
        </div>
      </section>
    `;
  }

  function renderKpis() {
    return `
      <section class="ti-kpis" aria-label="Queue summary">
        ${data.summary.kpis.map((kpi) => `
          <div class="ti-kpi">
            <div class="ti-kpi__label">${escapeHtml(kpi.label)}</div>
            <div class="ti-kpi__value">${escapeHtml(kpi.value)}${kpi.suffix ? `<small>${escapeHtml(kpi.suffix)}</small>` : ""}</div>
            <div class="ti-delta" data-tone="${escapeHtml(kpi.tone)}">${escapeHtml(kpi.delta)}</div>
          </div>
        `).join("")}
      </section>
    `;
  }

  function renderFilters() {
    const filters = [
      ["all", "All"],
      ["ready", "Ready"],
      ["field", "Field evidence"],
      ["tech", "Tech hold"],
      ["high", "High risk"],
      ["valued", "Valued"],
      ["failed", "Media gaps"]
    ];

    return `
      <div class="queue-tools">
        <label class="queue-search">
          <span>Search</span>
          <input type="search" value="${escapeHtml(searchQuery)}" placeholder="Case, unit, source, serial" data-search>
        </label>
        <label class="queue-sort">
          <span>Sort</span>
          <select data-sort>
            ${[
              ["updated", "Recently updated"],
              ["risk", "Highest risk"],
              ["value", "Highest value"],
              ["evidence", "Best evidence"]
            ].map(([value, label]) => `<option value="${value}" ${sortMode === value ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="ti-toolbar" aria-label="Queue filters">
        ${filters.map(([value, label]) => `
          <button class="ti-button" type="button" data-filter="${escapeHtml(value)}" aria-pressed="${activeFilter === value}">
            ${escapeHtml(label)}
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderQueue() {
    if (loading && !hasLoadedQueue) return renderQueueSkeleton();
    const visibleCases = filteredCases();
    const rows = visibleCases.map((item) => `
      <button class="case-row" type="button" data-case-id="${escapeHtml(item.id)}" aria-selected="${item.id === selectedId}">
        <span class="case-id">${escapeHtml(item.caseNumber)}</span>
        <span class="unit-cell">
          <span class="unit-cell__model">${escapeHtml(item.unit)} - ${escapeHtml(item.modelYear)}</span>
          <span class="unit-cell__meta">SN ${escapeHtml(item.serial)}</span>
        </span>
        <span class="customer-cell">
          <span class="customer-cell__org">${escapeHtml(item.customer)}</span>
          <span class="customer-cell__loc">${escapeHtml(item.location)}</span>
        </span>
        <span class="money-cell">${formatMoney(item.proposedTrade)}</span>
        <span>${riskChip(item.risk)}</span>
        <span class="evidence-cell">${escapeHtml(evidenceQueueLabel(item))}</span>
        <span class="stage-cell">${escapeHtml(item.stage)}</span>
        <span class="age-cell">${escapeHtml(item.age)}</span>
      </button>
    `).join("");

    return `
      <section class="review-queue" aria-labelledby="queue-title">
        <div class="ti-section-head queue-heading">
          <div>
            <h2 id="queue-title" class="ti-section-title">Tickets needing review</h2>
            <p class="section-subcopy">${visibleCases.length} shown / ${data.cases.length} total</p>
          </div>
          ${renderFilters()}
        </div>
        <div class="ti-panel">
          <div class="queue-head" aria-hidden="true">
            <div>Ticket</div>
            <div>Unit</div>
            <div>Source</div>
            <div>Trade</div>
            <div>Risk</div>
            <div>Evidence</div>
            <div>Stage</div>
            <div>Age</div>
          </div>
          ${rows || `<div class="summary-panel"><p class="summary-copy">No review tickets match this view.</p></div>`}
        </div>
      </section>
    `;
  }

  function renderQueueSkeleton() {
    const rows = Array.from({ length: 7 }, (_, index) => `
      <div class="case-row case-row--skeleton" aria-hidden="true">
        <span class="skeleton skeleton--short"></span>
        <span class="unit-cell">
          <span class="skeleton skeleton--line"></span>
          <span class="skeleton skeleton--short"></span>
        </span>
        <span class="customer-cell">
          <span class="skeleton skeleton--line"></span>
          <span class="skeleton skeleton--short"></span>
        </span>
        <span class="skeleton skeleton--money"></span>
        <span class="skeleton skeleton--pill"></span>
        <span class="skeleton skeleton--short"></span>
        <span class="skeleton skeleton--short"></span>
        <span class="skeleton skeleton--tiny"></span>
      </div>
    `).join("");

    return `
      <section class="review-queue" aria-labelledby="queue-title">
        <div class="ti-section-head queue-heading">
          <div>
            <h2 id="queue-title" class="ti-section-title">Tickets needing review</h2>
            <p class="section-subcopy">Loading live review queue...</p>
          </div>
          ${renderFilters()}
        </div>
        <div class="ti-panel">
          <div class="queue-head" aria-hidden="true">
            <div>Ticket</div>
            <div>Unit</div>
            <div>Source</div>
            <div>Trade</div>
            <div>Risk</div>
            <div>Evidence</div>
            <div>Stage</div>
            <div>Age</div>
          </div>
          ${rows}
        </div>
      </section>
    `;
  }

  function renderWorkflow(item) {
    const active = workflowState(item);
    const steps = [
      ["field", "Field collection"],
      ["review", "Used review"],
      ["tech", "Tech hold"],
      ["approved", "Approved"]
    ];
    return `
      <div class="workflow-strip" aria-label="Reviewer workflow state">
        ${steps.map(([key, label]) => `
          <div class="workflow-step" data-active="${active === key}" data-complete="${isWorkflowComplete(active, key)}">
            <span></span>
            <strong>${escapeHtml(label)}</strong>
          </div>
        `).join("")}
      </div>
    `;
  }

  function workflowState(item) {
    if (item.reviewStatus === "approved") return "approved";
    if (item.reviewStatus === "technician_inspection_required" || item.routeKey === "technician_inspection_required") return "tech";
    if (["ready_for_fast_review", "ready_for_standard_review", "central_review_hold"].includes(item.reviewStatus)) return "review";
    return "field";
  }

  function isWorkflowComplete(active, key) {
    const order = ["field", "review", "tech", "approved"];
    if (active === "tech") return ["field", "review"].includes(key);
    return order.indexOf(key) < order.indexOf(active);
  }

  function renderEvidence(item) {
    return `
      <div class="evidence-strip" aria-label="Evidence coverage">
        ${item.evidence.slice(0, 10).map((evidence) => `
          <button class="evidence-tile" data-status="${escapeHtml(evidence.status)}" data-preview-evidence="${escapeHtml(evidence.evidenceItemId || "")}" type="button" ${evidence.evidenceItemId ? "" : "disabled"}>
            <div class="evidence-tile__label">${escapeHtml(evidence.label)}</div>
            <div class="evidence-tile__meta">${escapeHtml(evidence.meta)}</div>
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderEvidencePanel(item) {
    const thumbnails = previewableEvidence(item.evidenceItems);
    const allEvidence = item.evidenceItems || [];
    const processingSummary = item.processingSummary || {};
    return `
      <section id="evidence-panel" class="ti-panel evidence-panel" aria-labelledby="evidence-title">
        <div class="ti-section-head">
          <div>
            <h2 id="evidence-title" class="ti-section-title">Evidence preview</h2>
            <p class="section-subcopy">${escapeHtml(evidenceQueueLabel(item))}</p>
          </div>
          ${badge(`${processingSummary.complete || 0} done / ${processingSummary.failed || 0} failed`, Number(processingSummary.failed || 0) ? "risk" : "good")}
        </div>
        ${thumbnails.length ? `
          <div class="media-grid">
            ${thumbnails.slice(0, 8).map((evidence) => `
              <button class="media-card" type="button" data-preview-evidence="${escapeHtml(evidence.id)}">
                <img src="${escapeHtml(evidence.storageUri)}" alt="${escapeHtml(humanize(evidence.checklistSlot || evidence.originalFileName || "Evidence image"))}" loading="lazy">
                <span>${escapeHtml(humanize(evidence.checklistSlot || evidence.originalFileName || "Evidence image"))}</span>
              </button>
            `).join("")}
          </div>
        ` : `
          <div class="empty-state">
            <strong>No previewable image URLs yet.</strong>
            <span>Field uploads, local OpenClaw media, unsupported files, or failed remote downloads still appear in the evidence ledger below.</span>
          </div>
        `}
        ${allEvidence.length ? `
          <div class="evidence-ledger">
            ${allEvidence.slice(0, 10).map((evidence) => `
              <div class="ledger-row">
                <span>${escapeHtml(humanize(evidence.checklistSlot || evidence.originalFileName || "Unslotted evidence"))}</span>
                ${badge(`${humanize(evidence.qualityStatus)} / ${humanize(evidence.analysisStatus)}`, evidence.analysisStatus === "failed" ? "risk" : evidence.qualityStatus === "accepted" ? "good" : "watch")}
              </div>
            `).join("")}
          </div>
        ` : ""}
      </section>
    `;
  }

  function renderActionsPanel(item) {
    const actions = item.actions?.length ? item.actions : item.latestAction ? [item.latestAction] : [];
    return `
      <section id="history-panel" class="ti-panel summary-panel" aria-labelledby="history-title">
        <div class="ti-section-head">
          <h2 id="history-title" class="ti-section-title">Reviewer actions</h2>
          ${badge(actions.length ? `${actions.length} recorded` : "No actions", actions.length ? "info" : "watch")}
        </div>
        <div class="action-history">
          ${actions.length ? actions.slice(0, 8).map((action) => `
            <div class="action-history__item">
              <div>
                <strong>${escapeHtml(humanize(action.actionType || "note"))}</strong>
                <span>${escapeHtml(formatTimestamp(action.createdAt))} / ${escapeHtml(action.reviewer || "reviewer")}</span>
              </div>
              <p>${escapeHtml(action.note || "No note recorded.")}</p>
            </div>
          `).join("") : `<p class="summary-copy">No reviewer decision has been recorded for this case yet.</p>`}
        </div>
      </section>
    `;
  }

  function renderPacketPanel(item) {
    const markdown = packetMarkdown(item);
    return `
      <section id="packet-panel" class="ti-panel summary-panel" aria-labelledby="packet-title">
        <div class="ti-section-head">
          <div>
            <h2 id="packet-title" class="ti-section-title">Packet preview</h2>
            <p class="section-subcopy">${item.packet?.createdAt ? `Generated ${formatTimestamp(item.packet.createdAt)}` : "No packet has been generated for this ticket."}</p>
          </div>
          <div class="packet-actions">
            <button class="ti-button" type="button" data-export="copy_packet" ${markdown ? "" : "disabled"}>Copy</button>
            <button class="ti-button" type="button" data-export="download_packet" ${markdown ? "" : "disabled"}>Download</button>
            <button class="ti-button" type="button" data-action="generate_packet" ${pendingAction ? "disabled" : ""}>Generate</button>
          </div>
        </div>
        ${markdown ? `<pre class="packet-preview">${escapeHtml(markdown)}</pre>` : `<p class="summary-copy">Generate a packet after evidence processing to capture the current route, valuation posture, recon posture, and reviewer brief.</p>`}
      </section>
    `;
  }

  function renderDetail(item) {
    if (loading && !hasLoadedQueue) return renderDetailSkeleton();
    if (!item) {
      return `<aside><section class="ti-panel summary-panel"><p class="summary-copy">No review case selected.</p></section></aside>`;
    }
    const rangeMark = item.lowValue != null && item.highValue != null && item.proposedTrade != null && item.highValue !== item.lowValue
      ? Math.min(85, Math.max(12, Math.round(((item.proposedTrade - item.lowValue) / (item.highValue - item.lowValue)) * 100)))
      : 50;

    return `
      <aside aria-labelledby="detail-title">
        <section class="ti-panel">
          <div class="detail-panel__head">
            <span class="detail-panel__case">${escapeHtml(item.caseNumber)}</span>
            ${badge(item.route, toneForStatus(item))}
          </div>
          <div class="detail-panel__body">
            <h2 id="detail-title" class="detail-title">${escapeHtml(item.unit)} - MY ${escapeHtml(item.modelYear)}</h2>
            <p class="detail-subtitle">SN ${escapeHtml(item.serial)} / ${escapeHtml(item.hours)} / ${escapeHtml(item.type)}</p>
            ${renderWorkflow(item)}

            <div class="spec-grid">
              ${item.specs.map(([label, value]) => `
                <div class="ti-field">
                  <span class="ti-label">${escapeHtml(label)}</span>
                  <span class="ti-value">${escapeHtml(value)}</span>
                </div>
              `).join("")}
            </div>

            <div class="value-block">
              <div>
                <div class="ti-label">Demo trade posture</div>
                <div class="value-block__amount"><span>$</span>${formatMoney(item.proposedTrade).replace("$", "")}</div>
              </div>
              <div class="range-track" style="--range-start:18%; --range-end:22%; --range-mark:${rangeMark}%">
                <div class="range-track__band"></div>
                <div class="range-track__mark"></div>
              </div>
              <div class="range-labels">
                <span>Low ${formatMoney(item.lowValue)}</span>
                <span>Recon ${formatMoney(item.reconBudget)}</span>
                <span>High ${formatMoney(item.highValue)}</span>
              </div>
            </div>

            <div class="signal-grid" aria-label="Risk factor breakdown">
              <div class="ti-label">Risk factor breakdown</div>
              ${item.riskFactors.map(([label, value, tone]) => `
                <div class="signal-row">
                  <span class="signal-row__name">${escapeHtml(label)}</span>
                  ${meter(value, tone)}
                </div>
              `).join("")}
            </div>

            ${renderEvidence(item)}

            <div class="review-lane" aria-label="Reviewer status">
              ${item.reviewLines.map((line) => `
                <div class="review-line">
                  <span class="review-line__label">${escapeHtml(line.label)}</span>
                  ${badge(line.value, line.tone)}
                </div>
              `).join("")}
            </div>
          </div>
          <div class="decision-box">
            <label class="review-note">
              <span>Reviewer note</span>
              <textarea id="review-note" rows="3" placeholder="Add context for sales, used team, or technician handoff"></textarea>
            </label>
            <div class="detail-actions">
              <button class="ti-button" data-action="hold_for_technician" type="button" ${pendingAction ? "disabled" : ""}>Hold</button>
              <button class="ti-button" data-action="request_more_evidence" type="button" ${pendingAction ? "disabled" : ""}>Request evidence</button>
              <button class="ti-button" data-variant="primary" data-action="approve_packet" type="button" ${pendingAction || !canApprovePacket() ? "disabled" : ""}>Approve packet</button>
            </div>
          </div>
        </section>

        <section class="ti-panel summary-panel" aria-labelledby="summary-title">
          <div class="ti-section-head">
            <h2 id="summary-title" class="ti-section-title">Reviewer readout</h2>
            ${badge(item.confidence + " confidence", toneForRisk(item.risk))}
          </div>
          <p class="summary-copy">${escapeHtml(item.summary)}</p>
          ${item.sourceUrl ? `<p class="summary-copy"><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">Source listing</a></p>` : ""}
        </section>
        ${renderEvidencePanel(item)}
        ${renderPacketPanel(item)}
        ${renderActionsPanel(item)}
      </aside>
    `;
  }

  function renderDetailSkeleton() {
    return `
      <aside aria-label="Loading review detail">
        <section class="ti-panel">
          <div class="detail-panel__head">
            <span class="skeleton skeleton--short"></span>
            <span class="skeleton skeleton--pill"></span>
          </div>
          <div class="detail-panel__body">
            <span class="skeleton skeleton--title"></span>
            <span class="skeleton skeleton--line"></span>
            <div class="workflow-strip workflow-strip--skeleton">
              ${Array.from({ length: 4 }, () => `<div class="workflow-step"><span></span><strong><span class="skeleton skeleton--line"></span></strong></div>`).join("")}
            </div>
            <div class="spec-grid">
              ${Array.from({ length: 4 }, () => `<div class="ti-field"><span class="skeleton skeleton--short"></span><span class="skeleton skeleton--line"></span></div>`).join("")}
            </div>
            <div class="value-block">
              <span class="skeleton skeleton--short"></span>
              <span class="skeleton skeleton--title"></span>
              <span class="skeleton skeleton--line"></span>
            </div>
            <div class="evidence-strip">
              ${Array.from({ length: 8 }, () => `<div class="evidence-tile"><span class="skeleton skeleton--line"></span><span class="skeleton skeleton--short"></span></div>`).join("")}
            </div>
          </div>
        </section>
      </aside>
    `;
  }

  function renderEvidenceModal(item) {
    const evidence = selectedEvidence(item);
    if (!evidence) return "";
    return `
      <div class="evidence-modal" role="dialog" aria-modal="true" aria-labelledby="evidence-modal-title">
        <button class="evidence-modal__backdrop" type="button" data-close-preview aria-label="Close evidence preview"></button>
        <div class="evidence-modal__panel">
          <div class="ti-section-head">
            <div>
              <h2 id="evidence-modal-title" class="ti-section-title">${escapeHtml(humanize(evidence.checklistSlot || evidence.originalFileName || "Evidence"))}</h2>
              <p class="section-subcopy">${escapeHtml(evidence.originalFileName || evidence.storageUri || "No file name")}</p>
            </div>
            <button class="ti-button" type="button" data-close-preview>Close</button>
          </div>
          ${isPreviewableMedia(evidence)
            ? `<img class="evidence-modal__image" src="${escapeHtml(evidence.storageUri)}" alt="${escapeHtml(humanize(evidence.checklistSlot || "Evidence image"))}">`
            : `<div class="empty-state"><strong>Preview unavailable</strong><span>${escapeHtml(evidence.storageUri || "No media path recorded.")}</span></div>`}
          <div class="evidence-modal__meta">
            ${badge(`${humanize(evidence.qualityStatus)} quality`, evidence.qualityStatus === "accepted" ? "good" : evidence.qualityStatus === "rejected" ? "risk" : "watch")}
            ${badge(`${humanize(evidence.analysisStatus)} analysis`, evidence.analysisStatus === "complete" ? "good" : evidence.analysisStatus === "failed" ? "risk" : "watch")}
            <span>${escapeHtml(formatTimestamp(evidence.uploadedAt))}</span>
          </div>
          ${evidence.notes ? `<p class="summary-copy">${escapeHtml(evidence.notes)}</p>` : ""}
        </div>
      </div>
    `;
  }

  function renderToast() {
    if (!toast) return "";
    return `<div class="review-toast" data-tone="${escapeHtml(toast.tone || "info")}">${escapeHtml(toast.message)}</div>`;
  }

  function renderSystemBanner() {
    if (!error) return "";
    return `
      <section class="system-banner" role="status">
        <strong>Live sidecar unavailable.</strong>
        <span>${escapeHtml(error)} The UI is showing static fallback data until the next successful refresh.</span>
        <button class="ti-button" type="button" data-retry-load>Retry</button>
      </section>
    `;
  }

  function renderFatalError(errorValue) {
    return `
      <div class="review-shell">
        ${renderTopbar()}
        <section class="fatal-panel" role="alert">
          <h1>Review UI could not render</h1>
          <p>${escapeHtml(errorValue?.message || errorValue || "Unknown browser error")}</p>
          <button class="ti-button" type="button" data-retry-load>Reload review queue</button>
        </section>
      </div>
    `;
  }

  function renderAccessDenied() {
    return `
      <div class="review-shell">
        ${renderTopbar()}
        <section class="fatal-panel" role="alert">
          <h1>Access denied</h1>
          <p>${escapeHtml(auth.error || "Your Microsoft account is not on the review allow list for this deployment.")}</p>
          <button class="ti-button" type="button" data-auth-logout>Sign out</button>
        </section>
      </div>
    `;
  }

  function render() {
    if (fatalError) {
      app.innerHTML = renderFatalError(fatalError);
      return;
    }
    if (auth.accessDenied) {
      app.innerHTML = renderAccessDenied();
      return;
    }
    const item = selectedCase();
    const brand = currentDeploymentBrand();
    try {
      app.innerHTML = `
        <div class="review-shell">
          ${renderTopbar()}
          ${renderPagehead()}
          ${renderKpis()}
          ${renderSystemBanner()}
          <main class="review-main">
            <div class="review-main__left">${renderQueue()}</div>
            <div id="review-detail-panel" class="review-main__right" tabindex="-1">${renderDetail(item)}</div>
          </main>
          <footer class="review-footnote">
            <span>Used Equipment Review Ops</span>
            <span>${escapeHtml(error ? "Static fallback" : "Live sidecar")} / ${escapeHtml(brand.name)} Trade Desk ${APP_VERSION}</span>
          </footer>
        </div>
        ${renderEvidenceModal(item)}
        ${renderToast()}
      `;
    } catch (err) {
      fatalError = err;
      app.innerHTML = renderFatalError(err);
    }
  }

  async function loadQueue() {
    loading = true;
    render();
    try {
      const response = await fetch(apiUrl("/review/cases?limit=100"), { credentials: "same-origin" });
      if (!response.ok) throw new Error(`Sidecar returned ${response.status}`);
      data = normalizeDataset(await response.json());
      selectedId = data.cases.some((item) => item.id === selectedId) ? selectedId : data.cases[0]?.id || null;
      error = null;
      hasLoadedQueue = true;
    } catch (err) {
      data = normalizeDataset(fallbackData);
      selectedId = data.cases[0]?.id || null;
      error = `Sidecar unavailable: ${err.message}`;
      hasLoadedQueue = true;
    } finally {
      loading = false;
      render();
      if (!error && selectedId) loadDetail(selectedId);
    }
  }

  async function loadAuth() {
    try {
      const response = await fetch(apiUrl("/auth/me"), { credentials: "same-origin" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 && body.loginUrl) {
        window.location.assign(apiUrl(body.loginUrl));
        return false;
      }
      if (response.status === 403) {
        auth = {
          ...auth,
          checked: true,
          required: true,
          authenticated: false,
          accessDenied: true,
          error: body.error || "Your Microsoft account is not allowed for this review deployment."
        };
        render();
        return false;
      }
      if (!response.ok) throw new Error(`Auth returned ${response.status}`);
      auth = {
        checked: true,
        required: Boolean(body.authRequired),
        authenticated: Boolean(body.authenticated),
        accessDenied: false,
        user: body.user || null,
        csrfToken: body.csrfToken || null,
        logoutUrl: body.logoutUrl || "/auth/logout",
        deployment: body.deployment || body.user?.deployment || null,
        tenantLabel: body.tenantLabel || null
      };
      data = normalizeDataset(data);
      render();
      return true;
    } catch {
      auth = { ...auth, checked: true, required: false, authenticated: false, accessDenied: false };
      return true;
    }
  }

  async function loadDetail(id) {
    try {
      const response = await fetch(apiUrl(`/review/cases/${encodeURIComponent(id)}`), { credentials: "same-origin" });
      if (!response.ok) throw new Error(`Detail returned ${response.status}`);
      const detail = normalizeCase(await response.json());
      data.cases = data.cases.map((item) => item.id === id ? { ...item, ...detail } : item);
      render();
    } catch {
      // Queue summaries are still useful if a detail refresh fails.
    }
  }

  async function generatePacket() {
    const item = selectedCase();
    if (!item || error) return;
    pendingAction = "generate_packet";
    render();
    try {
      const response = await fetch(apiUrl(`/review/cases/${encodeURIComponent(item.id)}/packet`), {
        method: "POST",
        headers: authHeaders(),
        credentials: "same-origin"
      });
      if (!response.ok) throw new Error(`Packet returned ${response.status}`);
      await loadDetail(item.id);
      showToast("Packet generated for the selected ticket.", "good");
    } catch (err) {
      showToast(`Packet generation failed: ${err.message}`, "risk");
    } finally {
      pendingAction = null;
      render();
    }
  }

  async function submitReviewAction(actionType) {
    if (actionType === "generate_packet") {
      await generatePacket();
      return;
    }
    const item = selectedCase();
    if (!item || error) return;
    const noteFromUi = document.getElementById("review-note")?.value?.trim();
    pendingAction = actionType;
    render();
    const notes = {
      hold_for_technician: "Reviewer held the case for licensed technician inspection.",
      request_more_evidence: "Reviewer requested additional field evidence before approval.",
      approve_packet: "Reviewer approved this demo packet for QA."
    };
    try {
      const response = await fetch(apiUrl(`/review/cases/${encodeURIComponent(item.id)}/actions`), {
        method: "POST",
        headers: authHeaders(true),
        credentials: "same-origin",
        body: JSON.stringify({
          actionType,
          note: noteFromUi || notes[actionType] || "Reviewer action from review UI.",
          packetId: item.packet?.id || null
        })
      });
      if (!response.ok) throw new Error(`Action returned ${response.status}`);
      const body = await response.json();
      const updated = normalizeCase(body.case);
      data.cases = data.cases.map((candidate) => candidate.id === item.id ? { ...candidate, ...updated } : candidate);
      showToast("Reviewer action recorded.", "good");
    } catch (err) {
      showToast(`Action failed: ${err.message}`, "risk");
    } finally {
      pendingAction = null;
      render();
    }
  }

  async function copyPacket() {
    const item = selectedCase();
    const markdown = packetMarkdown(item);
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      showToast("Packet copied to clipboard.", "good");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = markdown;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      showToast("Packet copied to clipboard.", "good");
    }
  }

  function downloadPacket() {
    const item = selectedCase();
    const markdown = packetMarkdown(item);
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${item.caseNumber || "trade-review"}-packet.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast("Packet download started.", "good");
  }

  function showToast(message, tone = "info") {
    toast = { message, tone };
    render();
    window.setTimeout(() => {
      toast = null;
      render();
    }, 2600);
  }

  function isMobileReviewLayout() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function scrollDetailIntoViewOnMobile() {
    if (!isMobileReviewLayout()) return;
    window.requestAnimationFrame(() => {
      const detail = document.getElementById("review-detail-panel");
      if (!detail) return;
      detail.focus({ preventScroll: true });
      detail.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function refocusSearch() {
    window.requestAnimationFrame(() => {
      const search = document.querySelector("[data-search]");
      if (!search) return;
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    });
  }

  app.addEventListener("input", (event) => {
    try {
      if (event.target.matches("[data-search]")) {
        searchQuery = event.target.value;
        const visible = filteredCases();
        if (visible.length && !visible.some((item) => item.id === selectedId)) {
          selectedId = visible[0].id;
          selectedEvidenceId = null;
          if (!error) loadDetail(selectedId);
        }
        render();
        refocusSearch();
      }
    } catch (err) {
      fatalError = err;
      render();
    }
  });

  app.addEventListener("change", (event) => {
    try {
      if (event.target.matches("[data-sort]")) {
        sortMode = event.target.value;
        render();
      }
    } catch (err) {
      fatalError = err;
      render();
    }
  });

  app.addEventListener("click", (event) => {
    try {
      if (event.target.closest("[data-retry-load]")) {
        fatalError = null;
        error = null;
        hasLoadedQueue = false;
        boot();
        return;
      }

      if (event.target.closest("[data-auth-logout]")) {
        window.location.assign(apiUrl(auth.logoutUrl || "/auth/logout"));
        return;
      }

      const exportButton = event.target.closest("[data-export]");
      if (exportButton) {
        if (exportButton.dataset.export === "copy_packet") copyPacket();
        if (exportButton.dataset.export === "download_packet") downloadPacket();
        return;
      }

      const previewButton = event.target.closest("[data-preview-evidence]");
      if (previewButton && previewButton.dataset.previewEvidence) {
        selectedEvidenceId = previewButton.dataset.previewEvidence;
        render();
        return;
      }

      if (event.target.closest("[data-close-preview]")) {
        selectedEvidenceId = null;
        render();
        return;
      }

      const actionButton = event.target.closest("[data-action]");
      if (actionButton) {
        submitReviewAction(actionButton.dataset.action);
        return;
      }

      const caseButton = event.target.closest("[data-case-id]");
      if (caseButton) {
        selectedId = caseButton.dataset.caseId;
        selectedEvidenceId = null;
        render();
        if (!error) loadDetail(selectedId);
        scrollDetailIntoViewOnMobile();
        return;
      }

      const filterButton = event.target.closest("[data-filter]");
      if (filterButton) {
        activeFilter = filterButton.dataset.filter;
        const visible = filteredCases();
        if (visible.length && !visible.some((item) => item.id === selectedId)) {
          selectedId = visible[0].id;
          selectedEvidenceId = null;
          if (!error) loadDetail(selectedId);
        }
        render();
      }
    } catch (err) {
      fatalError = err;
      render();
    }
  });

  window.addEventListener("error", (event) => {
    fatalError = event.error || new Error(event.message || "Browser runtime error");
    render();
  });

  window.addEventListener("unhandledrejection", (event) => {
    fatalError = event.reason || new Error("Unhandled browser promise rejection");
    render();
  });

  render();
  boot();

  async function boot() {
    const canLoad = await loadAuth();
    if (canLoad) await loadQueue();
  }
})();
