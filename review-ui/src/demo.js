(function () {
  const fallbackData = window.TradeReviewDemoData;
  const sidecarUrl = window.TRADE_REVIEW_SIDECAR_URL || "http://127.0.0.1:8788";
  const app = document.getElementById("app");
  let data = normalizeDataset(fallbackData);
  let selectedId = data.cases[0]?.id || null;
  let activeFilter = "all";
  let loading = true;
  let error = null;
  let pendingAction = null;

  function normalizeDataset(payload) {
    if (payload?.items) {
      return {
        user: {
          name: "Used Team",
          initials: "UT",
          period: "Live sidecar"
        },
        summary: normalizeSummary(payload.summary, payload.generatedAt),
        cases: payload.items.map(normalizeCase)
      };
    }
    return payload || { user: {}, summary: { kpis: [] }, cases: [] };
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
    const low = item.lowValue ?? item.proposedTrade ?? 0;
    const high = item.highValue ?? item.proposedTrade ?? low;
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
      age: item.age || "today",
      risk: item.risk || "medium",
      riskScore: Number(item.riskScore || 50),
      confidence: item.confidence || "Pending",
      proposedTrade: item.proposedTrade ?? null,
      lowValue: low,
      highValue: high,
      reconBudget: item.reconBudget ?? null,
      specs: item.specs || [],
      riskFactors: item.riskFactors || [],
      evidence: item.evidence || [],
      reviewLines: item.reviewLines || [],
      summary: item.summary || "No reviewer readout is available yet.",
      sourceUrl: item.sourceUrl || item.source?.url || null
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

  function toneForRisk(risk) {
    if (risk === "low") return "good";
    if (risk === "medium") return "watch";
    return "risk";
  }

  function filteredCases() {
    if (activeFilter === "all") return data.cases;
    return data.cases.filter((item) => item.risk === activeFilter || item.route.toLowerCase().includes(activeFilter));
  }

  function selectedCase() {
    return data.cases.find((item) => item.id === selectedId) || data.cases[0] || null;
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

  function renderTopbar() {
    return `
      <header class="ti-topbar">
        <div class="ti-brand">
          <div class="ti-brand__mark">P</div>
          <div>
            <span class="ti-brand__name">Premier / Stotz Used Equipment</span>
            <span class="ti-brand__meta">Trade Desk / Review Ops</span>
          </div>
        </div>
        <nav class="ti-nav" aria-label="Review navigation">
          <a class="ti-nav__item" aria-current="page" href="#">Trade Queue</a>
          <a class="ti-nav__item" href="#">Evidence</a>
          <a class="ti-nav__item" href="#">Valuations</a>
          <a class="ti-nav__item" href="#">Recon</a>
          <a class="ti-nav__item" href="#">Inventory</a>
        </nav>
        <div class="ti-topbar__right">
          ${badge(loading ? "Syncing" : error ? "Demo fallback" : data.user.period, error ? "watch" : "info")}
          <span>${escapeHtml(data.user.name)}</span>
          <div class="ti-avatar" aria-label="${escapeHtml(data.user.name)}">${escapeHtml(data.user.initials)}</div>
        </div>
      </header>
    `;
  }

  function renderPagehead() {
    return `
      <section class="ti-pagehead" aria-labelledby="review-title">
        <div>
          <div class="ti-eyebrow">${escapeHtml(error || "Sidecar-backed review queue")}</div>
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
      ["high", "High risk"],
      ["medium", "Medium"],
      ["fast", "Fast path"]
    ];

    return filters.map(([value, label]) => `
      <button class="ti-button" type="button" data-filter="${escapeHtml(value)}" aria-pressed="${activeFilter === value}">
        ${escapeHtml(label)}
      </button>
    `).join("");
  }

  function renderQueue() {
    const rows = filteredCases().map((item) => `
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
        <span class="stage-cell">${escapeHtml(item.stage)}</span>
        <span class="age-cell">${escapeHtml(item.age)}</span>
      </button>
    `).join("");

    return `
      <section class="review-queue" aria-labelledby="queue-title">
        <div class="ti-section-head">
          <h2 id="queue-title" class="ti-section-title">Tickets needing review</h2>
          <div class="ti-toolbar" aria-label="Queue filters">${renderFilters()}</div>
        </div>
        <div class="ti-panel">
          <div class="queue-head" aria-hidden="true">
            <div>Ticket</div>
            <div>Unit</div>
            <div>Source</div>
            <div>Trade</div>
            <div>Risk</div>
            <div>Stage</div>
            <div>Age</div>
          </div>
          ${rows || `<div class="summary-panel"><p class="summary-copy">No review tickets match this filter.</p></div>`}
        </div>
      </section>
    `;
  }

  function renderEvidence(item) {
    return `
      <div class="evidence-strip" aria-label="Evidence coverage">
        ${item.evidence.slice(0, 8).map((evidence) => `
          <div class="evidence-tile" data-status="${escapeHtml(evidence.status)}">
            <div class="evidence-tile__label">${escapeHtml(evidence.label)}</div>
            <div class="evidence-tile__meta">${escapeHtml(evidence.meta)}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderDetail(item) {
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
            ${badge(item.route, toneForRisk(item.risk))}
          </div>
          <div class="detail-panel__body">
            <h2 id="detail-title" class="detail-title">${escapeHtml(item.unit)} - MY ${escapeHtml(item.modelYear)}</h2>
            <p class="detail-subtitle">SN ${escapeHtml(item.serial)} / ${escapeHtml(item.hours)} / ${escapeHtml(item.type)}</p>

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
          <div class="detail-actions">
            <button class="ti-button" data-action="hold_for_technician" type="button" ${pendingAction ? "disabled" : ""}>Hold</button>
            <button class="ti-button" data-action="request_more_evidence" type="button" ${pendingAction ? "disabled" : ""}>Request evidence</button>
            <button class="ti-button" data-variant="primary" data-action="approve_packet" type="button" ${pendingAction ? "disabled" : ""}>Approve packet</button>
          </div>
        </section>

        <section class="ti-panel summary-panel" aria-labelledby="summary-title">
          <div class="ti-section-head">
            <h2 id="summary-title" class="ti-section-title">Reviewer readout</h2>
            ${badge(item.confidence + " confidence", toneForRisk(item.risk))}
          </div>
          <p class="summary-copy">${escapeHtml(item.summary)}</p>
          ${item.sourceUrl ? `<p class="summary-copy"><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">Source listing</a></p>` : ""}
          ${item.packet?.preview ? `<pre class="packet-preview">${escapeHtml(item.packet.preview)}</pre>` : ""}
        </section>
      </aside>
    `;
  }

  function render() {
    const item = selectedCase();
    app.innerHTML = `
      <div class="review-shell">
        ${renderTopbar()}
        ${renderPagehead()}
        ${renderKpis()}
        <main class="review-main">
          <div class="review-main__left">${renderQueue()}</div>
          <div class="review-main__right">${renderDetail(item)}</div>
        </main>
        <footer class="review-footnote">
          <span>Used Equipment Review Ops</span>
          <span>${escapeHtml(error ? "Static fallback" : "Live sidecar")} / Premier-Stotz Trade Desk v0.2</span>
        </footer>
      </div>
    `;
  }

  async function loadQueue() {
    loading = true;
    render();
    try {
      const response = await fetch(`${sidecarUrl}/review/cases?limit=100`);
      if (!response.ok) throw new Error(`Sidecar returned ${response.status}`);
      data = normalizeDataset(await response.json());
      selectedId = data.cases.some((item) => item.id === selectedId) ? selectedId : data.cases[0]?.id || null;
      error = null;
    } catch (err) {
      data = normalizeDataset(fallbackData);
      selectedId = data.cases[0]?.id || null;
      error = `Sidecar unavailable: ${err.message}`;
    } finally {
      loading = false;
      render();
      if (!error && selectedId) loadDetail(selectedId);
    }
  }

  async function loadDetail(id) {
    try {
      const response = await fetch(`${sidecarUrl}/review/cases/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error(`Detail returned ${response.status}`);
      const detail = normalizeCase(await response.json());
      data.cases = data.cases.map((item) => item.id === id ? { ...item, ...detail } : item);
      render();
    } catch {
      // Queue summaries are still useful if a detail refresh fails.
    }
  }

  async function submitReviewAction(actionType) {
    const item = selectedCase();
    if (!item || error) return;
    pendingAction = actionType;
    render();
    const notes = {
      hold_for_technician: "Reviewer held the case for licensed technician inspection.",
      request_more_evidence: "Reviewer requested additional field evidence before approval.",
      approve_packet: "Reviewer approved this demo packet for QA."
    };
    try {
      const response = await fetch(`${sidecarUrl}/review/cases/${encodeURIComponent(item.id)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType,
          reviewer: "review-ui",
          note: notes[actionType] || "Reviewer action from review UI."
        })
      });
      if (!response.ok) throw new Error(`Action returned ${response.status}`);
      const body = await response.json();
      const updated = normalizeCase(body.case);
      data.cases = data.cases.map((candidate) => candidate.id === item.id ? { ...candidate, ...updated } : candidate);
    } catch (err) {
      error = `Action failed: ${err.message}`;
    } finally {
      pendingAction = null;
      render();
    }
  }

  app.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      submitReviewAction(actionButton.dataset.action);
      return;
    }

    const caseButton = event.target.closest("[data-case-id]");
    if (caseButton) {
      selectedId = caseButton.dataset.caseId;
      render();
      if (!error) loadDetail(selectedId);
      return;
    }

    const filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      activeFilter = filterButton.dataset.filter;
      const visible = filteredCases();
      if (visible.length && !visible.some((item) => item.id === selectedId)) {
        selectedId = visible[0].id;
      }
      render();
    }
  });

  render();
  loadQueue();
})();
